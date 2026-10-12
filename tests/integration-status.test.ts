import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useIntegrationStatus } from '@/composables/useIntegrationStatus';
import type { MediaInstance } from '@/composables/useMediaService';

const scopes: ReturnType<typeof effectScope>[] = [];
const instance: MediaInstance = { name: 'Test / Instance', has_storage_agent: true,
  radarr: { base_url: 'http://radarr.test', api_key: 'movie-secret', root_folder_path: '/movies' },
  sonarr: { base_url: 'http://sonarr.test', api_key: 'series-secret', root_folder_path: '/tv' } };
function setup(api = true, active = true) {
  vi.stubEnv('VITE_FLIX_API_URL', 'http://flix.test');
  const options = { useAPI: ref(api), active: ref(active), selectedInstanceData: ref<MediaInstance | null>(instance) };
  const scope = effectScope(); scopes.push(scope);
  const status = scope.run(() => useIntegrationStatus(options))!;
  return { options, status, scope };
}
function validFetch() {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => Response.json(url.endsWith('/instances') ? [{ name: 'Test' }]
    : url.includes('/storage/') ? { collectedAt: '2026-10-12T10:00:00Z', locations: [{ id: 'movies', available: true }] }
      : { version: '6.0' }));
}
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop());
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

it('checks configured services with read-only requests and encodes the instance name', async () => {
  const fetchMock = validFetch(); vi.stubGlobal('fetch', fetchMock);
  const { status } = setup();
  await vi.waitFor(() => expect(status.services.value.every(service => service.state === 'available')).toBe(true));
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls.map(call => call[0])).toContain('http://flix.test/storage/Test%20%2F%20Instance');
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { 'X-Api-Key': 'movie-secret' } });
  expect(JSON.stringify(status.services.value)).not.toContain('secret');
  expect(status.services.value.every(service => service.lastSuccessAt)).toBe(true);
});

it('makes no requests while the section is closed, and stops automatic checks when leaving', async () => {
  vi.useFakeTimers(); const fetchMock = validFetch(); vi.stubGlobal('fetch', fetchMock);
  const { options, status, scope } = setup(true, false);
  await status.refresh(); expect(fetchMock).not.toHaveBeenCalled();
  options.active.value = true; await nextTick(); await status.refresh();
  const before = fetchMock.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000); expect(fetchMock.mock.calls.length).toBe(before + 4);
  options.active.value = false; await nextTick();
  const closed = fetchMock.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120000); expect(fetchMock).toHaveBeenCalledTimes(closed);
  scope.stop();
});

it('supports standalone mode without any Flix API or agent request', async () => {
  vi.stubEnv('VITE_RADARR_BASE_URL', 'http://radarr.test'); vi.stubEnv('VITE_RADARR_API_KEY', 'test');
  vi.stubEnv('VITE_SONARR_BASE_URL', 'http://sonarr.test'); vi.stubEnv('VITE_SONARR_API_KEY', 'test');
  const fetchMock = validFetch(); vi.stubGlobal('fetch', fetchMock);
  const { status } = setup(false);
  await vi.waitFor(() => expect(status.services.value.find(service => service.id === 'sonarr')?.state).toBe('available'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(status.services.value.filter(service => ['api', 'storage'].includes(service.id)).every(service => service.state === 'disabled')).toBe(true);
});

it('reports unconfigured services without requesting them', async () => {
  const fetchMock = validFetch(); vi.stubGlobal('fetch', fetchMock);
  const { options, status } = setup(true, false);
  options.selectedInstanceData.value = { ...instance, has_storage_agent: false, radarr: { ...instance.radarr, api_key: '' } };
  options.active.value = true; await nextTick();
  await vi.waitFor(() => expect(status.services.value.find(service => service.id === 'sonarr')?.state).toBe('available'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(status.services.value.find(service => service.id === 'radarr')?.state).toBe('unconfigured');
  expect(status.services.value.find(service => service.id === 'storage')?.state).toBe('unconfigured');
});

it.each([401, 403, 404, 502, 503])('reports HTTP %s and preserves the last valid response when a retry fails', async code => {
  const fetchMock = validFetch(); vi.stubGlobal('fetch', fetchMock);
  const { status } = setup();
  await vi.waitFor(() => expect(status.services.value[0]?.state).toBe('available'));
  const last = status.services.value[0]!.lastSuccessAt;
  fetchMock.mockImplementation(async () => new Response(null, { status: code }));
  await status.check('api');
  expect(status.services.value[0]).toMatchObject({ state: 'unavailable', lastSuccessAt: last });
  expect(status.services.value[0]!.message).toContain(`HTTP ${code}`);
});

it('distinguishes a reachable storage agent from unavailable storage volumes', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('/storage/')
    ? { collectedAt: '2026-10-12', locations: [{ id: 'movies', available: false }, { id: 'series', available: false }] }
    : url.endsWith('/instances') ? [] : {})));
  const { status } = setup();
  await vi.waitFor(() => expect(status.services.value[3]?.state).toBe('degraded'));
  expect(status.services.value[3]!.message).toContain('movies, series');
  expect(status.services.value[3]!.lastSuccessAt).not.toBe('');
});

it('rejects invalid responses without exposing raw errors or credentials', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(null)));
  const { status } = setup();
  await vi.waitFor(() => expect(status.services.value.every(service => service.state === 'unavailable')).toBe(true));
  expect(status.services.value.every(service => service.message === 'Service returned an invalid response.')).toBe(true);
});

it('reports network failures and timeouts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('secret URL')));
  const { status } = setup();
  await vi.waitFor(() => expect(status.services.value[0]?.state).toBe('unavailable'));
  expect(status.services.value[0]!.message).toContain('network');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')));
  await status.check('api');
  expect(status.services.value[0]!.message).toContain('8 seconds');
});

it('ignores late responses after switching instances', async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('radarr.test')
    ? new Promise<Response>(resolve => { resolveOld = resolve; })
    : Promise.resolve(Response.json(url.endsWith('/instances') ? [] : url.includes('/storage/') ? { collectedAt: '2026-10-12', locations: [] } : { version: 'new' }))));
  const { options, status } = setup();
  await vi.waitFor(() => expect(resolveOld).toBeDefined());
  options.selectedInstanceData.value = { ...instance, name: 'New', radarr: { ...instance.radarr, base_url: 'http://new.test' } };
  await nextTick();
  await vi.waitFor(() => expect(status.services.value[1]?.state).toBe('available'));
  resolveOld(Response.json({ version: 'old response' })); await nextTick();
  expect(status.services.value[1]!.version).not.toBe('old response');
});
