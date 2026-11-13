import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupCatalogMovie, prepareCatalogMovies } from '@/composables/catalogCollectionMovies';
import type { LibraryMovie } from '@/composables/collections';

const config = { base_url: 'https://radarr.test/proxy/', api_key: 'test & key', root_folder_path: '/movies' };
const invalidLookup = 'Invalid movie lookup. No movie was added.';
const loadFailure = 'Unable to load movie library.';
const member = (tmdbId: number) => ({ tmdbId, title: `Catalog ${tmdbId}`, year: 1999 });
const native = (tmdbId: number, status = 'released') => ({ tmdbId, title: `Native ${tmdbId}`, year: 2026, status });
const signal = () => new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('catalog movie lookup', () => {
  it('uses only the configured Radarr GET endpoint and preserves native metadata', async () => {
    const data = Object.freeze({ ...native(10), title: '  Native title  ', overview: 'Overview', runtime: 120,
      images: [{ coverType: 'poster', remoteUrl: 'https://untrusted.test/poster' }], originalTitle: 'Original' });
    const fetch = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await lookupCatalogMovie(config, 10, controller.signal)).toEqual({ ...data, title: 'Native title' });
    expect(data.title).toBe('  Native title  ');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://radarr.test/proxy/api/v3/movie/lookup/tmdb?tmdbId=10&apikey=test+%26+key',
      { method: 'GET', signal: controller.signal, cache: 'no-store' },
    );
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null])('rejects unsafe requested identity %s before fetching', async value => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(lookupCatalogMovie(config, value as number, signal())).rejects.toThrow(invalidLookup);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, [], [native(10)], {}, native(11), { ...native(10), tmdbId: '10' },
    { ...native(10), tmdbId: 0 }, { ...native(10), tmdbId: Number.MAX_SAFE_INTEGER + 1 },
    { ...native(10), title: '' }, { ...native(10), title: ' \n ' }, { ...native(10), title: 10 }])(
    'rejects malformed or mismatched lookup %j', async data => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
      await expect(lookupCatalogMovie(config, 10, signal())).rejects.toThrow(invalidLookup);
    },
  );

  it.each([401, 404, 429, 500])('rejects HTTP %s without retrying', async status => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: 'API error' }, { status }));
    vi.stubGlobal('fetch', fetch);
    await expect(lookupCatalogMovie(config, 10, signal())).rejects.toThrow(loadFailure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('normalizes network errors and rejects invalid JSON', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(new Response('<html>Not JSON</html>'));
    vi.stubGlobal('fetch', fetch);
    await expect(lookupCatalogMovie(config, 10, signal())).rejects.toThrow(loadFailure);
    await expect(lookupCatalogMovie(config, 10, signal())).rejects.toThrow(invalidLookup);
  });

  it.each([{ ...config, base_url: '' }, { ...config, api_key: '' }])('does not fall back to an arbitrary URL without configuration', async value => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(lookupCatalogMovie(value, 10, signal())).rejects.toThrow(loadFailure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a late body after abort even when the transport ignores the signal', async () => {
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
    const controller = new AbortController();
    const result = lookupCatalogMovie(config, 10, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    body.resolve(native(10));
    await assertion;
  });
});

describe('catalog collection preparation', () => {
  it('excludes every existing TMDB ID regardless of file state, deduplicates and does not mutate inputs', async () => {
    const members = [1, 2, 3, 4, 4, 5].map(id => Object.freeze(member(id)));
    const library: LibraryMovie[] = [
      { id: 101, tmdbId: 1, title: 'Available', hasFile: true },
      { id: 102, tmdbId: 2, title: 'Missing', hasFile: false },
      { id: 103, tmdbId: 3, title: 'Unknown' },
    ];
    library.forEach(Object.freeze);
    Object.freeze(members);
    Object.freeze(library);
    const before = JSON.stringify({ members, library, config });
    const fetch = vi.fn(async (url: string) => Response.json(native(Number(new URL(url).searchParams.get('tmdbId')))));
    vi.stubGlobal('fetch', fetch);
    expect(await prepareCatalogMovies(config, members, library, signal())).toEqual([
      { ...native(4), state: 'Missing' }, { ...native(5), state: 'Missing' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify({ members, library, config })).toBe(before);
  });

  it.each([['released', 'Missing'], ['announced', 'Upcoming'], ['inCinemas', 'Upcoming']])(
    'maps native %s status to %s without using catalog metadata', async (status, state) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(native(10, status))));
      const members = [{ ...member(10), status: 'unknown', release_date: '1900-01-01' }];
      expect(await prepareCatalogMovies(config, members, [], signal())).toEqual([{ ...native(10, status), state }]);
    },
  );

  it.each([undefined, null, '', 'unknown', 'deleted', 'Released', 1])('rejects unconfirmed native status %s even with an old release date', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...native(10), status, release_date: '1900-01-01' })));
    await expect(prepareCatalogMovies(config, [{ ...member(10), release_date: '1900-01-01' }], [], signal()))
      .rejects.toThrow('Movie availability could not be confirmed.');
  });

  it('validates all candidate identities before starting requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(prepareCatalogMovies(config, [member(1), member(0)], [], signal())).rejects.toThrow(invalidLookup);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns no partial result and schedules no more lookups after a failed validation', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      const id = Number(new URL(url).searchParams.get('tmdbId'));
      return Response.json(native(id === 1 ? 999 : id));
    });
    vi.stubGlobal('fetch', fetch);
    await expect(prepareCatalogMovies(config, [1, 2, 3, 4, 5, 6].map(member), [], signal())).rejects.toThrow(invalidLookup);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('limits concurrency to four and preserves candidate order across out-of-order completions', async () => {
    const pending = new Map<number, ReturnType<typeof deferred<Response>>>();
    let active = 0;
    let peak = 0;
    const fetch = vi.fn((url: string, options: RequestInit) => {
      expect(options.method).toBe('GET');
      const id = Number(new URL(url).searchParams.get('tmdbId'));
      const request = deferred<Response>();
      pending.set(id, request);
      peak = Math.max(peak, ++active);
      return request.promise.finally(() => { active--; });
    });
    vi.stubGlobal('fetch', fetch);
    const result = prepareCatalogMovies(config, [1, 2, 3, 4, 5, 6].map(member), [], signal());
    expect(fetch).toHaveBeenCalledTimes(4);
    pending.get(4)!.resolve(Response.json(native(4)));
    await vi.waitFor(() => expect(pending.has(5)).toBe(true));
    expect(active).toBe(4);
    pending.get(5)!.resolve(Response.json(native(5)));
    await vi.waitFor(() => expect(pending.has(6)).toBe(true));
    for (const id of [6, 3, 2, 1]) pending.get(id)!.resolve(Response.json(native(id)));
    expect((await result).map(movie => movie.tmdbId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(4);
    expect(fetch.mock.calls.every(([, options]) => options.method === 'GET' && !options.body)).toBe(true);
  });

  it('rejects pre-aborted work, including an empty batch, without any requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(lookupCatalogMovie(config, 10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(prepareCatalogMovies(config, [member(10)], [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(prepareCatalogMovies(config, [], [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops scheduling on abort and never returns stale results or sends writes', async () => {
    const pending: ReturnType<typeof deferred<Response>>[] = [];
    const controller = new AbortController();
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      expect(options.signal).toBe(controller.signal);
      const request = deferred<Response>();
      pending.push(request);
      return request.promise;
    });
    vi.stubGlobal('fetch', fetch);
    const result = prepareCatalogMovies(config, [1, 2, 3, 4, 5, 6].map(member), [], controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    pending.forEach((request, index) => request.resolve(Response.json(native(index + 1))));
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([, options]) => options.method === 'GET' && !options.body)).toBe(true);
  });

  it('returns an empty list without requests when there are no candidates', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await prepareCatalogMovies(config, [], [], signal())).toEqual([]);
    expect(await prepareCatalogMovies(config, [member(10)], [{ id: 1, ...member(10) }], signal())).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
