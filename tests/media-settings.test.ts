import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useMediaSettings, type MediaSettingsItem } from '@/composables/useMediaSettings';

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function setup(useAPI = true) {
  const scope = effectScope(); scopes.push(scope);
  const config = { base_url: 'http://service.test', api_key: 'test-only', root_folder_path: '/media' };
  const instance = ref({ name: 'Test', radarr: config, sonarr: config });
  return { instance, ...scope.run(() => useMediaSettings({ useAPI: ref(useAPI), selectedInstanceData: instance }))! };
}
const initial = { id: 1, qualityProfileId: 4, tags: [3], path: '/media/Example', monitored: false,
  seasons: [{ seasonNumber: 1, monitored: false }], languageProfileId: 1 };
function network(version = '4.0.0') {
  let resource = structuredClone(initial);
  const writes: typeof initial[] = [];
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const path = new URL(url).pathname;
    if (options?.method === 'PUT') {
      resource = JSON.parse(options.body as string); writes.push(resource);
      return new Response(null, { status: 202 });
    }
    if (path.endsWith('/qualityprofile')) return Response.json([{ id: 4, name: 'Any' }, { id: 5, name: 'HD' }]);
    if (path.endsWith('/languageprofile')) return Response.json([{ id: 1, name: 'English' }, { id: 2, name: 'French' }]);
    if (path.endsWith('/tag')) return Response.json([{ id: 3, label: 'original' }, { id: 7, label: 'family' }]);
    if (path.endsWith('/system/status')) return Response.json({ version });
    return Response.json(resource);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, writes, setResource: (value: typeof initial) => { resource = value; } };
}

it.each(['movies', 'series'] as const)('loads %s settings lazily and writes nothing for unchanged settings', async type => {
  const state = setup(); const net = network(); const item: MediaSettingsItem = { id: 1 };
  expect(state.dirty.value).toBe(false); expect(net.fetchMock).not.toHaveBeenCalled();
  expect(await state.load(type, item)).toBe(true); expect(state.qualityProfileId.value).toBe(4);
  expect(state.selectedTags.value).toEqual([3]); expect(state.dirty.value).toBe(false);
  expect(await state.save(type, item)).toBe(false); expect(net.writes).toEqual([]);
});
it.each(['movies', 'series'] as const)('saves %s profiles and tags while preserving paths, monitoring and seasons', async type => {
  const state = setup(); const net = network(); const item: MediaSettingsItem = { id: 1 };
  await state.load(type, item); state.qualityProfileId.value = 5; state.selectedTags.value = [7];
  expect(state.dirty.value).toBe(true); expect(await state.save(type, item)).toBe(true);
  expect(net.writes).toEqual([{ ...initial, qualityProfileId: 5, tags: [7] }]);
  const put = net.fetchMock.mock.calls.find(call => call[1]?.method === 'PUT')!;
  expect(put[0]).toContain('?moveFiles=false'); expect(item.qualityProfileId).toBe(5);
  expect(item.settingsNeedsRefresh).toBe(false); expect(state.dirty.value).toBe(false);
  expect(net.fetchMock.mock.calls.every(call => !call[0].includes('/command'))).toBe(true);
});
it('supports removal of all existing tags without inventing tags', async () => {
  const state = setup(); const net = network(); const item = { id: 1 };
  await state.load('movies', item); state.selectedTags.value = [];
  expect(await state.save('movies', item)).toBe(true); expect(net.writes[0]?.tags).toEqual([]);
});
it('preserves concurrently changed fields that were not edited', async () => {
  const state = setup(); const net = network(); const item = { id: 1 };
  await state.load('series', item); state.qualityProfileId.value = 5;
  net.setResource({ ...initial, tags: [7], monitored: true });
  expect(await state.save('series', item)).toBe(true);
  expect(net.writes[0]).toMatchObject({ tags: [7], monitored: true, qualityProfileId: 5 });
});
it('refuses a conflicting quality change and requires reloading before retrying', async () => {
  const state = setup(); const net = network(); const item = { id: 1 };
  await state.load('movies', item); state.qualityProfileId.value = 5;
  net.setResource({ ...initial, qualityProfileId: 5 });
  expect(await state.save('movies', item)).toBe(false); expect(net.writes).toEqual([]);
  expect(state.error.value).toContain('Reload settings');
  expect(await state.load('movies', item)).toBe(true); expect(state.error.value).toBe('');
});
it('supports editable language profiles only on confirmed Sonarr 3', async () => {
  const state = setup(); const net = network('3.0.10.1567'); const item = { id: 1 };
  await state.load('series', item); expect(state.languageEditable.value).toBe(true);
  state.languageProfileId.value = 2;
  expect(await state.save('series', item)).toBe(true); expect(net.writes[0]?.languageProfileId).toBe(2);
});
it.each(['4.0.0', '5.0.0', ''])('never offers or modifies obsolete language profiles for version %s', async version => {
  const state = setup(); const net = network(version); const item = { id: 1 };
  await state.load('series', item); expect(state.languageEditable.value).toBe(false);
  state.languageProfileId.value = 2; state.qualityProfileId.value = 5;
  expect(await state.save('series', item)).toBe(true); expect(net.writes[0]?.languageProfileId).toBe(1);
  expect(net.fetchMock.mock.calls.some(call => call[0].endsWith('/languageprofile'))).toBe(false);
});
it('uses standalone service credentials', async () => {
  vi.stubEnv('VITE_RADARR_BASE_URL', 'http://radarr.test'); vi.stubEnv('VITE_RADARR_API_KEY', 'direct-only');
  const state = setup(false); const net = network();
  const item = { id: 1 };
  expect(await state.load('movies', item)).toBe(true);
  expect(net.fetchMock.mock.calls[0]?.[0]).toBe('http://radarr.test/api/v3/movie/1');
  expect(net.fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-Api-Key': 'direct-only' });
  state.qualityProfileId.value = 5;
  expect(await state.save('movies', item)).toBe(true);
  expect(net.writes[0]?.qualityProfileId).toBe(5);
});
it.each([{ ...initial, id: 2 }, { ...initial, tags: null }, { ...initial, qualityProfileId: null }])('refuses malformed service resources', async resource => {
  const state = setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(resource)));
  expect(await state.load('movies', { id: 1 })).toBe(false); expect(state.loaded.value).toBe(false);
});
it('rejects unknown tag selections without PUT', async () => {
  const state = setup(); const net = network(); const item = { id: 1 };
  await state.load('movies', item); state.selectedTags.value = [99];
  expect(await state.save('movies', item)).toBe(false); expect(net.writes).toEqual([]);
});
it('requires reloading an unconfirmed update and does not assume the requested state', async () => {
  const state = setup(); const net = network(); const item: MediaSettingsItem = { id: 1 };
  await state.load('movies', item); state.qualityProfileId.value = 5;
  net.fetchMock.mockImplementation(async (_url, options) => options?.method === 'PUT' ? new Response(null, { status: 202 }) : Response.json(initial));
  expect(await state.save('movies', item)).toBe(false);
  expect(item.qualityProfileId).toBe(4); expect(item.settingsNeedsRefresh).toBe(true);
  const calls = net.fetchMock.mock.calls.length;
  expect(await state.save('movies', item)).toBe(false); expect(net.fetchMock).toHaveBeenCalledTimes(calls);
});
it('ignores repeated saves and late results after an instance change', async () => {
  const state = setup(); const net = network(); const item = { id: 1 };
  await state.load('movies', item); state.qualityProfileId.value = 5;
  let resolve!: (response: Response) => void;
  net.fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  const pending = state.save('movies', item);
  expect(await state.save('movies', item)).toBe(false);
  state.instance.value = { ...state.instance.value, name: 'Other' }; resolve(Response.json(initial));
  expect(await pending).toBe(false); expect(net.writes).toEqual([]); expect(state.loaded.value).toBe(false);
});
it('times out without leaking a service response or leaving pending state', async () => {
  vi.useFakeTimers(); const state = setup();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('secret'))))));
  const pending = state.load('movies', { id: 1 }); await vi.advanceTimersByTimeAsync(15000);
  expect(await pending).toBe(false); expect(state.pending.value).toBe(false); expect(state.error.value).not.toContain('secret');
});
