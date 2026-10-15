import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useMediaSheetRefresh } from '@/composables/useMediaSheetRefresh';

let scope: ReturnType<typeof effectScope>;
beforeEach(() => {
  vi.useFakeTimers(); scope = effectScope();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
});
afterEach(() => { scope.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const open = ref(true), blocked = ref(false), native = ref(true);
  const item = ref<Record<string, unknown>>({ id: 1, tmdbId: 10, hasFile: false, selected_quality: 9 });
  const refreshed = vi.fn();
  const actions = scope.run(() => useMediaSheetRefresh({
    useAPI: ref(true), selectedInstanceData: ref({ name: 'Test', radarr: { base_url: 'http://radarr.test', api_key: 'test', root_folder_path: '/movies' }, sonarr: { base_url: 'http://sonarr.test', api_key: 'test', root_folder_path: '/tv' } }),
    open: () => open.value, type: () => 'movies', item: () => item.value,
    native: () => native.value, blocked: () => blocked.value, refreshed,
  }))!;
  return { open, blocked, native, item, refreshed, actions };
}
const resource = { id: 1, tmdbId: 10, title: 'Film', hasFile: true, status: 'released', movieFile: { relativePath: 'New.mkv', size: 2e9 } };
it('refreshes in place every 30 seconds without overwriting the selected quality', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(resource))); vi.stubGlobal('fetch', fetch);
  const state = setup(); const original = state.item.value;
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).toHaveBeenCalledOnce(); expect(state.item.value).toBe(original);
  expect(state.item.value).toMatchObject({ hasFile: true, relativePath: 'New.mkv', selected_quality: 9 });
  expect(state.refreshed).toHaveBeenCalledOnce();
  state.open.value = false;
  await vi.advanceTimersByTimeAsync(60000); expect(fetch).toHaveBeenCalledOnce();
});
it('does not poll non-library media, hidden tabs, or edits, and refreshes on return', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(resource))); vi.stubGlobal('fetch', fetch);
  const state = setup();
  state.native.value = false; await vi.advanceTimersByTimeAsync(30000);
  state.native.value = true; state.blocked.value = true; await vi.advanceTimersByTimeAsync(30000);
  state.blocked.value = false; window.dispatchEvent(new Event('blur')); await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
});
it('discards responses when the sheet closes, changes identity or enters an edit', async () => {
  for (const change of ['close', 'identity', 'edit']) {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const state = setup(); const original = state.item.value;
    const pending = state.actions.refresh();
    if (change === 'close') state.open.value = false;
    else if (change === 'identity') state.item.value = { id: 2, tmdbId: 20 };
    else state.blocked.value = true;
    finish(Response.json(resource)); await pending;
    expect(original.hasFile).toBe(false); expect(state.refreshed).not.toHaveBeenCalled();
    state.open.value = false;
  }
});
it('keeps the last snapshot on errors and rejects a different media identity', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...resource, tmdbId: 99 })));
  const state = setup(); await state.actions.refresh();
  expect(state.actions.state.error).toContain('identity changed');
  expect(state.item.value.hasFile).toBe(false);
});
