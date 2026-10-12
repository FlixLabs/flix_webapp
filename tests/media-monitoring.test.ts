import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { monitoringFields, useMediaMonitoring } from '@/composables/useMediaMonitoring';

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup(useAPI = true) {
  const scope = effectScope(); scopes.push(scope);
  const config = { base_url: 'http://service.test', api_key: 'test-only', root_folder_path: '/media' };
  const instance = ref({ name: 'Test', radarr: config, sonarr: config });
  return { instance, ...scope.run(() => useMediaMonitoring({ useAPI: ref(useAPI), selectedInstanceData: instance }))! };
}
const resource = { id: 1, monitored: true, title: 'Example', path: '/media/Example', qualityProfileId: 4, tags: [3],
  seasons: [{ seasonNumber: 0, monitored: false }, { seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: true }] };

it('retains explicit false monitoring and ignores malformed seasons', () => {
  expect(monitoringFields({ monitored: false, seasons: [null, { seasonNumber: -1 }, { seasonNumber: 1, monitored: false }] as never }))
    .toEqual({ monitored: false, seasons: [{ seasonNumber: 1, monitored: false }] });
});

it.each(['movies', 'series'] as const)('updates %s monitoring without changing other settings or sending commands', async type => {
  const state = setup();
  const item = { id: 1, monitored: true };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(resource))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(Response.json({ ...resource, monitored: false }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await state.setMonitoring(type, item, false)).toBe(true);
  expect(item.monitored).toBe(false);
  expect(fetchMock.mock.calls.map(call => call[1]?.method || 'GET')).toEqual(['GET', 'PUT', 'GET']);
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ ...resource, monitored: false });
  expect(fetchMock.mock.calls[1]![0]).toBe(`http://service.test/api/v3/${type === 'movies' ? 'movie' : 'series'}/1`);
});

it('updates only the selected season, preserving specials and other season settings', async () => {
  const state = setup();
  const updated = { ...resource, seasons: resource.seasons.map(season => season.seasonNumber === 1 ? { ...season, monitored: false } : season) };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(resource)).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(Response.json(updated));
  vi.stubGlobal('fetch', fetchMock);
  const item = { ...resource };
  expect(await state.setMonitoring('series', item, false, 1)).toBe(true);
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual(updated);
  expect(item.seasons).toEqual(updated.seasons);
});

it('supports direct standalone requests with the same operation', async () => {
  vi.stubEnv('VITE_RADARR_BASE_URL', 'http://radarr.test'); vi.stubEnv('VITE_RADARR_API_KEY', 'direct-only');
  const state = setup(false);
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(resource)).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(Response.json({ ...resource, monitored: false }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await state.setMonitoring('movies', { id: 1, monitored: true }, false)).toBe(true);
  expect(fetchMock.mock.calls[0]![0]).toBe('http://radarr.test/api/v3/movie/1');
  expect(fetchMock.mock.calls[0]![1].headers['X-Api-Key']).toBe('direct-only');
});

it.each([{}, { id: 0, monitored: true }, { id: 1 }])('never writes media with an unknown monitoring state: %j', async item => {
  const state = setup(); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect(await state.setMonitoring('movies', item, false)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([{}, { ...resource, id: 2 }, { ...resource, monitored: undefined }])('does not write an invalid fresh resource', async data => {
  const state = setup(); const fetchMock = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  expect(await state.setMonitoring('movies', { id: 1, monitored: true }, false)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('preserves the visible state on rejected updates and hides raw service errors', async () => {
  const state = setup(); const item = { id: 1, monitored: true };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(resource)).mockResolvedValueOnce(new Response('credential leak', { status: 401 })));
  expect(await state.setMonitoring('movies', item, false)).toBe(false);
  expect(item.monitored).toBe(true); expect(state.error.value).not.toContain('credential leak');
});

it('does not write a missing season or enable an unmonitored series implicitly', async () => {
  for (const data of [resource, { ...resource, monitored: false }]) {
    const state = setup(); const fetchMock = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
    expect(await state.setMonitoring('series', { id: 1, monitored: true }, true, data.monitored ? 99 : 1)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
});

it('ignores repeated clicks and prevents a write after an instance change', async () => {
  const state = setup(); let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal('fetch', fetchMock);
  const item = { id: 1, monitored: true };
  const request = state.setMonitoring('movies', item, false);
  expect(state.pending.value).toBe(true);
  expect(await state.setMonitoring('movies', item, false)).toBe(false);
  state.instance.value = { ...state.instance.value, name: 'Other' };
  resolve(Response.json(resource));
  expect(await request).toBe(false); expect(item.monitored).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('reloads monitoring after an uncertain update without sending another write', async () => {
  const state = setup(); const item = { id: 1, monitored: true };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(resource))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockRejectedValueOnce(new Error('Read failed'))
    .mockResolvedValueOnce(Response.json({ ...resource, monitored: false }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await state.setMonitoring('movies', item, false)).toBe(false);
  expect(item.monitored).toBe(true); expect(state.error.value).not.toBe('');
  expect(await state.refreshMonitoring('movies', item)).toBe(true);
  expect(item.monitored).toBe(false); expect(state.error.value).toBe('');
  expect(fetchMock.mock.calls.map(call => call[1]?.method || 'GET')).toEqual(['GET', 'PUT', 'GET', 'GET']);
});

it('uses the persisted state if the service does not apply the requested change', async () => {
  const state = setup(); const item = { id: 1, monitored: true };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(resource)).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(Response.json(resource)));
  expect(await state.setMonitoring('movies', item, false)).toBe(false);
  expect(item.monitored).toBe(true); expect(state.error.value).not.toBe('');
});

it('marks interrupted writes for a read-only refresh when the sheet is reopened', async () => {
  const state = setup(); let resolve!: (response: Response) => void;
  const item = { id: 1, monitored: true, monitoringNeedsRefresh: false };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(resource))
    .mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValueOnce(Response.json({ ...resource, monitored: false }));
  vi.stubGlobal('fetch', fetchMock);
  const request = state.setMonitoring('movies', item, false);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  state.reset(); resolve(new Response(null, { status: 202 }));
  expect(await request).toBe(false); expect(item.monitoringNeedsRefresh).toBe(true);
  expect(await state.refreshMonitoring('movies', item)).toBe(true);
  expect(item.monitored).toBe(false); expect(item.monitoringNeedsRefresh).toBe(false);
});
