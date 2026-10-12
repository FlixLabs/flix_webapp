import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { historyEvent, useMediaHistory } from '@/composables/useMediaHistory';

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function setup(useAPI = true) {
  const scope = effectScope(); scopes.push(scope);
  const config = { base_url: 'http://service.test', api_key: 'test-only', root_folder_path: '/media' };
  const instance = ref({ name: 'Test', radarr: config, sonarr: config });
  return { instance, ...scope.run(() => useMediaHistory({ useAPI: ref(useAPI), selectedInstanceData: instance }))! };
}
const event = { id: 5, movieId: 1, seriesId: 1, eventType: 'downloadFailed', sourceTitle: 'Example release', date: '2026-10-12T12:00:00Z', data: { message: 'Not enough space', apiKey: 'never-display' } };

it('normalizes failure details without exposing arbitrary service data', () => {
  expect(historyEvent(event, 'movies')).toMatchObject({ label: 'Download failed', failed: true, title: 'Example release', details: [{ label: 'Message', value: 'Not enough space' }] });
});
it('distinguishes service-specific numeric event codes', () => {
  expect(historyEvent({ eventType: 6 }, 'movies').label).toBe('File deleted');
  expect(historyEvent({ eventType: 6 }, 'series').label).toBe('File renamed');
});
it('handles missing metadata and displays unknown events without inventing a meaning', () => {
  expect(historyEvent({ eventType: 'futureEvent', sourceTitle: null, data: [], quality: null }, 'series')).toMatchObject({ label: 'futureEvent', title: 'Release title not provided', details: [], quality: '' });
  expect(historyEvent({ episode: { seasonNumber: 0, episodeNumber: 2, title: 'Special' } }, 'series').episode).toBe('S00E02 - Special');
});
it.each(['movies', 'series'] as const)('loads paginated %s history with the service ID filter and no writes', async type => {
  const state = setup(); const fetchMock = vi.fn().mockResolvedValue(Response.json({ records: [event], totalRecords: 21 })); vi.stubGlobal('fetch', fetchMock);
  expect(await state.load(type, 1, 2)).toBe(true);
  const url = new URL(fetchMock.mock.calls[0]![0]);
  expect(url.pathname).toBe('/api/v3/history');
  expect(url.searchParams.get(type === 'movies' ? 'movieIds' : 'seriesIds')).toBe('1');
  expect(url.searchParams.get('page')).toBe('2');
  expect(url.searchParams.get('pageSize')).toBe('10');
  expect(url.searchParams.get('sortDirection')).toBe('descending');
  expect(fetchMock.mock.calls[0]![1].headers['X-Api-Key']).toBe('test-only');
  expect(fetchMock.mock.calls[0]![1].method).toBeUndefined();
  expect(state.page.value).toBe(2); expect(state.total.value).toBe(21);
});
it('supports standalone configuration', async () => {
  vi.stubEnv('VITE_SONARR_BASE_URL', 'http://sonarr.test'); vi.stubEnv('VITE_SONARR_API_KEY', 'direct-only');
  const state = setup(false); const fetchMock = vi.fn().mockResolvedValue(Response.json({ records: [], totalRecords: 0 })); vi.stubGlobal('fetch', fetchMock);
  expect(await state.load('series', 1)).toBe(true);
  expect(fetchMock.mock.calls[0]![0]).toContain('http://sonarr.test/api/v3/history?');
  expect(fetchMock.mock.calls[0]![1].headers['X-Api-Key']).toBe('direct-only');
});
it.each([{ records: null, totalRecords: 0 }, { records: [event], totalRecords: -1 }, { records: [{ ...event, movieId: 8 }], totalRecords: 1 }])('rejects invalid or unfiltered responses', async payload => {
  const state = setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
  expect(await state.load('movies', 1)).toBe(false);
  expect(state.records.value).toEqual([]); expect(state.error.value).toContain('retry');
});
it('does not fetch invalid media IDs', async () => {
  const state = setup(); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect(await state.load('movies', 0)).toBe(false); expect(await state.load('movies', 1, -1)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('allows retry after a rejected response without exposing its body', async () => {
  const state = setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('secret', { status: 401 })).mockResolvedValueOnce(Response.json({ records: [], totalRecords: 0 })));
  expect(await state.load('movies', 1)).toBe(false); expect(state.error.value).not.toContain('secret');
  expect(await state.load('movies', 1)).toBe(true); expect(state.error.value).toBe('');
});
it('ignores late results after changing instance or resetting the sheet', async () => {
  const state = setup(); let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const pending = state.load('movies', 1);
  state.instance.value = { ...state.instance.value, name: 'Other' };
  resolve(Response.json({ records: [event], totalRecords: 1 }));
  expect(await pending).toBe(false); expect(state.records.value).toEqual([]); expect(state.loading.value).toBe(false);
});
it('times out and clears loading state', async () => {
  vi.useFakeTimers(); const state = setup();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))))));
  const pending = state.load('movies', 1); await vi.advanceTimersByTimeAsync(15000);
  expect(await pending).toBe(false); expect(state.loading.value).toBe(false); expect(state.error.value).toContain('retry');
});
