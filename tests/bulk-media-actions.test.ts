import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useBulkMediaActions } from '@/composables/useBulkMediaActions';
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function setup(useAPI = true) {
  const scope = effectScope(); scopes.push(scope);
  const config = { base_url: 'http://service.test', api_key: 'test-only', root_folder_path: '/media' };
  const instance = ref({ name: 'Test', radarr: config, sonarr: config });
  return { instance, ...scope.run(() => useBulkMediaActions({ useAPI: ref(useAPI), selectedInstanceData: instance }))! };
}
const items = [1, 2, 3].map(id => ({ id, title: `Movie ${id}`, status: 'released', monitored: true }));

it('deduplicates IDs, skips ineligible searches and reports partial failures', async () => {
  const state = setup(); const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  expect(await state.run('movies', [items[0]!, items[0]!, { ...items[1]!, status: 'announced' }, items[2]!, { ...items[0]!, id: 0 }, { ...items[0]!, id: 4, already_in_library: false }], 'search'))
    .toEqual({ succeeded: [2, 3], failed: [1], skipped: [4], stopped: false, stale: false });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ name: 'MoviesSearch', movieIds: [2] });
});

it('processes sequentially and stops after the current item without accepting another run', async () => {
  const state = setup(); let finish!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetchMock);
  const request = state.run('movies', items, 'search');
  expect(state.pending.value).toBe(true); expect(await state.run('movies', items, 'delete')).toBeNull();
  state.stop(); finish(Response.json({}));
  expect(await request).toMatchObject({ succeeded: [1], stopped: true, stale: false });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(state.completed.value).toBe(1); expect(state.pending.value).toBe(false);
});

it('never starts another write after changing instances', async () => {
  const state = setup(); let finish!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetchMock);
  const request = state.run('movies', items, 'delete');
  state.instance.value = { ...state.instance.value, name: 'Other' }; finish(Response.json({}));
  expect(await request).toMatchObject({ stale: true, stopped: true }); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('deletes files only for explicitly selected valid media', async () => {
  const state = setup(); const fetchMock = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetchMock);
  expect(await state.run('series', [items[1]!], 'delete')).toMatchObject({ succeeded: [2] });
  expect(fetchMock.mock.calls[0]![0]).toBe('http://service.test/api/v3/series/2?deleteFiles=true');
  expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
});

it('reuses persisted monitoring changes and skips unknown monitoring states', async () => {
  const state = setup(); let monitored = true;
  const item = { ...items[0]! };
  const fetchMock = vi.fn(async (_url, init) => {
    if (init.method === 'PUT') { monitored = JSON.parse(init.body).monitored; return Response.json({}); }
    return Response.json({ ...item, monitored, path: '/movies/Movie', qualityProfileId: 4 });
  }); vi.stubGlobal('fetch', fetchMock);
  expect(await state.run('movies', [item, { ...items[1]!, monitored: undefined }], 'unmonitor'))
    .toMatchObject({ succeeded: [1], skipped: [2] });
  expect(item.monitored).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('supports standalone batches and rejects empty selections', async () => {
  vi.stubEnv('VITE_SONARR_BASE_URL', 'http://sonarr.test'); vi.stubEnv('VITE_SONARR_API_KEY', 'direct-only');
  const state = setup(false); const fetchMock = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetchMock);
  expect(await state.run('series', [], 'search')).toBeNull();
  expect(await state.run('series', [items[0]!], 'search')).toMatchObject({ succeeded: [1] });
  expect(fetchMock.mock.calls[0]![0]).toBe('http://sonarr.test/api/v3/command');
});

it('bounds stalled batch requests so progress does not remain blocked forever', async () => {
  vi.useFakeTimers(); const state = setup();
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('Timed out')));
  })));
  const request = state.run('movies', [items[0]!], 'search');
  await vi.advanceTimersByTimeAsync(15000);
  expect(await request).toMatchObject({ failed: [1], stopped: false });
  expect(state.pending.value).toBe(false);
});
