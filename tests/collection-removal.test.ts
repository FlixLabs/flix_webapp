import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useCollectionRemoval, removableCollectionMovies } from '@/composables/useCollectionRemoval';
import type { MediaInstance } from '@/composables/useMediaService';

const target = { id: 5, tmdbId: 100, title: 'Saga' };
const movies = [{ tmdbId: 10, localId: 1, title: 'First' }, { tmdbId: 11, localId: 2, title: 'Second' }];
const collection = { ...target, movies: movies.map(movie => ({ tmdbId: movie.tmdbId, title: movie.title })) };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup() {
  const config = { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' };
  const options = { useAPI: ref(true), selectedInstanceData: ref<MediaInstance | null>({ name: 'First', radarr: config, sonarr: config }) };
  const scope = effectScope(); scopes.push(scope);
  return { ...scope.run(() => useCollectionRemoval(options))!, options };
}
function mockResource(url: string, method: string) {
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (url.endsWith('/collection/5')) return new Response(JSON.stringify(collection));
  const id = Number(url.split('/').at(-1));
  return new Response(JSON.stringify({ id, tmdbId: id === 1 ? 10 : 11, title: 'Film', collection: { tmdbId: 100 } }));
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('collection movie removal', () => {
  it('includes only unique films present in the library', () => {
    expect(removableCollectionMovies([...movies, movies[0]!, { tmdbId: 12, title: 'Absent' }, { tmdbId: 13, localId: 0, title: 'Invalid' }])).toEqual(movies);
  });
  it.each([false, true])('verifies each identity then removes selected films sequentially with deleteFiles=%s', async deleteFiles => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init) => {
      calls.push({ url, method: init.method }); return mockResource(url, init.method);
    }));
    const state = setup();
    await state.run(target, movies, deleteFiles);
    expect(calls.map(call => [new URL(call.url).pathname, call.method])).toEqual([
      ['/api/v3/collection/5', 'GET'], ['/api/v3/movie/1', 'GET'], ['/api/v3/movie/1', 'DELETE'], ['/api/v3/movie/2', 'GET'], ['/api/v3/movie/2', 'DELETE'],
    ]);
    for (const call of calls.filter(call => call.method === 'DELETE')) {
      expect(new URL(call.url).searchParams.get('deleteFiles')).toBe(String(deleteFiles));
      expect(new URL(call.url).searchParams.get('addImportExclusion')).toBe('false');
    }
    expect(state.results.value.map(result => result.state)).toEqual(['removed', 'removed']);
  });
  it.each(['collection', 'movie', 'membership'])('never deletes after changed %s identity', async change => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/collection/5')) return new Response(JSON.stringify(change === 'collection' ? { ...collection, tmdbId: 999 } : change === 'membership' ? { ...collection, movies: [] } : collection));
      return new Response(JSON.stringify({ id: 1, tmdbId: 999, title: 'Wrong' }));
    }); vi.stubGlobal('fetch', fetcher);
    const state = setup(); await state.run(target, [movies[0]!], false);
    expect(fetcher.mock.calls.every(([url]) => !url.includes('deleteFiles='))).toBe(true);
    expect(state.results.value.some(result => result.state === 'removed')).toBe(false);
  });
  it('stops after an uncertain deletion and never retries it or the remaining films', async () => {
    const fetcher = vi.fn(async (url: string, init) => {
      if (init.method === 'DELETE') throw new TypeError('Connection lost');
      return mockResource(url, init.method);
    }); vi.stubGlobal('fetch', fetcher);
    const state = setup(); await state.run(target, movies, false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(state.results.value).toMatchObject([{ tmdbId: 10, state: 'unconfirmed' }]);
  });
  it('preserves successful results when a subsequent deletion fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init) => init.method === 'DELETE' && url.includes('/movie/2?')
      ? new Response('{}', { status: 500 }) : mockResource(url, init.method)));
    const state = setup(); await state.run(target, movies, false);
    expect(state.results.value.map(result => result.state)).toEqual(['removed', 'unconfirmed']);
  });
  it('skips a movie already removed from the library', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init) => url.endsWith('/movie/1') ? new Response('{}', { status: 404 }) : mockResource(url, init.method)));
    const state = setup(); await state.run(target, movies, false);
    expect(state.results.value.map(result => result.state)).toEqual(['skipped', 'removed']);
  });
  it('changing instances stops the batch before the next delete', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(async (url: string, init) => init.method === 'DELETE' ? new Promise<Response>(resolve => { finish = resolve; }) : mockResource(url, init.method));
    vi.stubGlobal('fetch', fetcher);
    const state = setup(); const pending = state.run(target, movies, false);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    state.options.selectedInstanceData.value = { ...state.options.selectedInstanceData.value!, name: 'Second' };
    finish(new Response(null, { status: 204 })); await pending;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(state.results.value).toEqual([]);
  });
  it('works without Flix API and does not require an instance', async () => {
    vi.stubEnv('VITE_RADARR_BASE_URL', 'http://direct.test'); vi.stubEnv('VITE_RADARR_API_KEY', 'test-only');
    const fetcher = vi.fn(async (url: string, init) => mockResource(url, init.method)); vi.stubGlobal('fetch', fetcher);
    const state = setup(); state.options.useAPI.value = false; state.options.selectedInstanceData.value = null;
    await state.run(target, [movies[0]!], false);
    expect(fetcher.mock.calls.every(([url]) => url.startsWith('http://direct.test/'))).toBe(true);
  });
});
