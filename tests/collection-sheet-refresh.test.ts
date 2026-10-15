import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useCollectionSheetRefresh } from '@/composables/useCollectionSheetRefresh';

let scope: ReturnType<typeof effectScope>;
const collection = { id: 5, tmdbId: 100, title: 'Saga', movies: [{ tmdbId: 10, title: 'Film' }] };
const movies = [{ id: 1, tmdbId: 10, title: 'Film', hasFile: true }];
beforeEach(() => {
  scope = effectScope(); vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
});
afterEach(() => { scope.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const open = ref(true), blocked = ref(false), selected = ref(collection);
  const refreshed = vi.fn();
  const actions = scope.run(() => useCollectionSheetRefresh({
    useAPI: ref(true), selectedInstanceData: ref({ name: 'Test', radarr: { base_url: 'http://radarr.test', api_key: 'test', root_folder_path: '/movies' }, sonarr: { base_url: '', api_key: '', root_folder_path: '' } }),
    open: () => open.value, collection: () => selected.value, blocked: () => blocked.value, refreshed,
  }))!;
  return { open, blocked, selected, refreshed, actions };
}
it('atomically refreshes the collection and movie library every 30 seconds, then stops on close', async () => {
  const fetch = vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith('/movie') ? movies : collection)));
  vi.stubGlobal('fetch', fetch);
  const state = setup();
  state.refreshed.mockImplementation(() => { state.selected.value = { ...collection }; });
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(state.refreshed).toHaveBeenCalledWith({ collection, movies: expect.arrayContaining([expect.objectContaining({ id: 1, hasFile: true })]) });
  expect(state.actions.state.hasData).toBe(true);
  state.open.value = false;
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not apply partial reads or an unexpected collection identity', async () => {
  for (const invalid of ['movies', 'identity']) {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith('/movie')
      ? invalid === 'movies' ? {} : movies
      : invalid === 'identity' ? { ...collection, tmdbId: 99 } : collection))));
    const state = setup();
    await state.actions.refresh();
    expect(state.refreshed).not.toHaveBeenCalled();
    expect(state.actions.state.error).not.toBe('');
    state.open.value = false;
  }
});
it('skips nested actions and hidden tabs, and refreshes on return', async () => {
  const fetch = vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith('/movie') ? movies : collection)));
  vi.stubGlobal('fetch', fetch);
  const state = setup(); state.blocked.value = true;
  await vi.advanceTimersByTimeAsync(30000);
  state.blocked.value = false;
  window.dispatchEvent(new Event('blur'));
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(state.refreshed).toHaveBeenCalledOnce();
});
it('discards in-flight results after closing or starting a nested action', async () => {
  for (const change of ['close', 'action', 'selection']) {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/movie')
      ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(Response.json(collection))));
    const state = setup();
    const pending = state.actions.refresh();
    if (change === 'close') state.open.value = false;
    else if (change === 'action') state.blocked.value = true;
    else state.selected.value = { ...collection, id: 6 };
    finish(Response.json(movies)); await pending;
    expect(state.refreshed).not.toHaveBeenCalled();
    state.open.value = false;
  }
});
it('aborts the parallel library request when the collection read fails', async () => {
  let movieSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    if (url.endsWith('/movie')) {
      movieSignal = init.signal!;
      return new Promise<Response>(() => {});
    }
    return Promise.resolve(Response.json({}, { status: 503 }));
  }));
  const state = setup();
  await state.actions.refresh();
  expect(movieSignal?.aborted).toBe(true);
  expect(state.actions.state.loading).toBe(false);
  expect(state.actions.state.error).not.toBe('');
  expect(state.refreshed).not.toHaveBeenCalled();
});
