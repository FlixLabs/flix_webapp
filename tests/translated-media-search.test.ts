import { afterEach, describe, expect, it, vi } from 'vitest';
import { supplementMediaSearch } from '@/composables/translatedMediaSearch';
import { rankSearchResults } from '@/composables/useSearchRelevance';

const options = () => ({ query: 'Alexandre', type: 'movies' as const, serviceUrl: 'http://radarr.test', serviceKey: 'test-only',
  tmdbUrl: 'http://tmdb.test/3', tmdbKey: 'test-only', language: 'fr-FR', signal: new AbortController().signal });
const native = [{ title: 'Alexandre', tmdbId: 100, year: 1983 }];
const translated = { id: 1966, title: 'Alexandre', original_title: 'Alexander' };
const resource = { title: 'Alexander', tmdbId: 1966, year: 2004, images: [], alternateTitles: [] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('translated movie search', () => {
  it('finds a translated film even when Radarr returned other results, keeping Radarr identity', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/movie') ? { results: [translated] } : resource)));
    vi.stubGlobal('fetch', fetcher);
    const results = await supplementMediaSearch(native, options());
    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ title: 'Alexander', tmdbId: 1966, year: 2004, alternateTitles: [{ title: 'Alexandre' }, { title: 'Alexander' }] });
    expect(rankSearchResults(results, 'Alexandre')[1]?.tmdbId).toBe(1966);
    const search = new URL(fetcher.mock.calls[0]![0]);
    expect(search.searchParams.get('query')).toBe('Alexandre');
    expect(search.searchParams.get('language')).toBe('fr-FR');
    expect(new URL(fetcher.mock.calls[1]![0]).searchParams.get('tmdbId')).toBe('1966');
    expect(native).toEqual([{ title: 'Alexandre', tmdbId: 100, year: 1983 }]);
  });

  it('adds translated aliases to existing results without duplicate lookups or title replacement', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [translated, translated] })));
    vi.stubGlobal('fetch', fetcher);
    const results = await supplementMediaSearch([resource, { title: 'Unrelated', tmdbId: 8 }], options());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(rankSearchResults(results, 'Alexandre')[0]?.title).toBe('Alexander');
    expect(resource.alternateTitles).toEqual([]);
  });

  it('limits hydration to three unique missing candidates', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const id = Number(new URL(url).searchParams.get('tmdbId'));
      return new Response(JSON.stringify(url.includes('/search/movie') ? { results: [translated, translated,
        ...Array.from({ length: 20 }, (_, i) => ({ id: i + 2000, title: `Alexandre ${i}` }))] }
        : { title: 'Resolved', tmdbId: id }));
    });
    vi.stubGlobal('fetch', fetcher);
    const results = await supplementMediaSearch(native, options());
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(results).toHaveLength(4);
    expect(new Set(results.map(movie => movie.tmdbId)).size).toBe(4);
  });

  it.each(['tmdb:1966', 'imdb:tt0346491', 'tvdb:123'])('leaves identifier search %s untouched', async query => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await supplementMediaSearch(native, { ...options(), query })).toBe(native);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([new Response('{}', { status: 503 }), new Response('{'), new Response('{"results":null}')])('keeps native results when TMDB fails', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    expect(await supplementMediaSearch(native, options())).toBe(native);
  });

  it('rejects mismatched Radarr identities and preserves other successful lookups', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/movie')
      ? { results: [translated, { id: 2000, title: 'Alexandre II' }] }
      : new URL(url).searchParams.get('tmdbId') === '1966' ? { ...resource, tmdbId: 999 } : { title: 'Other movie', tmdbId: 2000 }))));
    expect((await supplementMediaSearch(native, options())).map(movie => movie.tmdbId)).toEqual([100, 2000]);
  });

  it('aborts a hanging supplement after 2.5 seconds, preserving native results', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    })));
    const pending = supplementMediaSearch(native, options());
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBe(native);
    expect(signal?.aborted).toBe(true);
  });

  it('cancels every supplemental lookup when the search is cleared or context changes', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('/search/movie')) return new Response(JSON.stringify({ results: [translated] }));
      signal = init.signal;
      started();
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))));
    }));
    const pending = supplementMediaSearch(native, { ...options(), signal: controller.signal });
    await ready;
    controller.abort();
    expect(await pending).toBe(native);
    expect(signal?.aborted).toBe(true);
  });
});

describe('translated series search', () => {
  const seriesOptions = () => ({ ...options(), query: 'La casa de papel', type: 'series' as const, serviceUrl: 'http://sonarr.test' });
  const candidate = { id: 71446, name: 'La casa de papel', original_name: 'La casa de papel' };
  const show = { title: 'Money Heist', tvdbId: 327417, year: 2017, images: [] };

  it('resolves TMDB to TVDB then validates the Sonarr resource', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/tv')
      ? { results: [candidate] } : url.includes('/external_ids') ? { id: 71446, tvdb_id: 327417 } : [show])));
    vi.stubGlobal('fetch', fetcher);
    const results = await supplementMediaSearch([{ title: 'Unrelated', tvdbId: 12 }], seriesOptions());
    expect(results).toHaveLength(2);
    expect(rankSearchResults(results, 'La casa de papel')[0]).toMatchObject(show);
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/3/search/tv', '/3/tv/71446/external_ids', '/api/v3/series/lookup']);
    expect(new URL(fetcher.mock.calls[2]![0]).searchParams.get('term')).toBe('tvdb:327417');
    expect(results[1]?.tmdbId).toBeUndefined();
  });

  it('enriches an existing TVDB result without fetching it again', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/tv')
      ? { results: [candidate] } : { id: 71446, tvdb_id: 327417 })));
    vi.stubGlobal('fetch', fetcher);
    const results = await supplementMediaSearch([show, { title: 'Unrelated', tvdbId: 12 }], seriesOptions());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(rankSearchResults(results, 'La casa de papel')[0]?.tvdbId).toBe(327417);
    expect(show).not.toHaveProperty('alternateTitles');
  });

  it.each([null, 0, -1, '327417'])('skips missing or invalid TVDB mapping %s', async tvdb_id => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/tv')
      ? { results: [candidate] } : { id: 71446, tvdb_id })));
    vi.stubGlobal('fetch', fetcher);
    expect(await supplementMediaSearch([], seriesOptions())).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ ...show, tvdbId: 1 }], [{ ...show, tmdbId: 999 }], [show, show], [],
  ])('skips mismatched or ambiguous Sonarr results', async resources => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/tv')
      ? { results: [candidate] } : url.includes('/external_ids') ? { id: 71446, tvdb_id: 327417 } : resources))));
    expect(await supplementMediaSearch([], seriesOptions())).toEqual([]);
  });

  it('deduplicates different TMDB entries resolving to the same TVDB series', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/search/tv')
      ? { results: [candidate, { ...candidate, id: 71447 }] }
      : url.includes('/external_ids') ? { id: Number(url.match(/tv\/(\d+)/)![1]), tvdb_id: 327417 } : [show])));
    vi.stubGlobal('fetch', fetcher);
    expect(await supplementMediaSearch([], seriesOptions())).toHaveLength(1);
  });

  it('caps the series supplement at three mappings and three Sonarr lookups', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      return new Response(JSON.stringify(url.includes('/search/tv')
        ? { results: Array.from({ length: 20 }, (_, i) => ({ ...candidate, id: 71446 + i })) }
        : url.includes('/external_ids') ? { id: Number(url.match(/tv\/(\d+)/)![1]), tvdb_id: Number(url.match(/tv\/(\d+)/)![1]) + 100000 }
        : [{ ...show, tvdbId: Number(parsed.searchParams.get('term')!.split(':')[1]) }]));
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await supplementMediaSearch([], seriesOptions())).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('cancels a pending series identifier mapping', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init) => {
      if (url.includes('/search/tv')) return new Response(JSON.stringify({ results: [candidate] }));
      signal = init.signal;
      started();
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError'))));
    }));
    const pending = supplementMediaSearch([show], { ...seriesOptions(), signal: controller.signal });
    await ready;
    controller.abort();
    expect(await pending).toEqual([show]);
    expect(signal?.aborted).toBe(true);
  });
});
