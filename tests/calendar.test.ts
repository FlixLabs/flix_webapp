import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { calendarDate, calendarDay, calendarEvents, calendarRange, matchesCalendarFilter, moveCalendar, useCalendar } from '@/composables/useCalendar';

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
function setup(useAPI = true) {
  const scope = effectScope(); scopes.push(scope);
  const config = { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/media' };
  const instance = ref({ name: 'Test', radarr: config, sonarr: { ...config, base_url: 'http://sonarr.test' } });
  return { instance, ...scope.run(() => useCalendar({ useAPI: ref(useAPI), selectedInstanceData: instance }))! };
}
const movie = { id: 1, title: 'Movie', digitalRelease: '2026-10-05', hasFile: false, monitored: true };
const range = calendarRange('2026-10-12', 'month');

it('covers month boundary days and ends at the end of the final day', () => {
  expect(calendarDay(range.start)).toBe('2026-09-27'); expect(calendarDay(range.end)).toBe('2026-10-31');
  expect(range.end.getHours()).toBe(23); expect(range.end.getMilliseconds()).toBe(999);
  const week = calendarRange('2026-12-31', 'week');
  expect(calendarDay(week.start)).toBe('2026-12-27'); expect(calendarDay(week.end)).toBe('2027-01-02');
});
it('navigates months without skipping February and crosses years', () => {
  expect(moveCalendar('2026-01-31', 'month', 1)).toBe('2026-02-01');
  expect(moveCalendar('2026-01-31', 'month', -1)).toBe('2025-12-01');
  expect(moveCalendar('2026-12-31', 'week', 1)).toBe('2027-01-07');
  expect(moveCalendar('2026-12-31', 'day', 1)).toBe('2027-01-01');
});
it('interprets date-only releases as local dates and rejects malformed days', () => {
  expect(calendarDay(calendarDate('2026-10-05')!)).toBe('2026-10-05');
  expect(calendarDate('2026-02-30')).toBeNull(); expect(calendarDate('bad')).toBeNull();
});
it('keeps release types and service IDs and excludes the same month in another year', () => {
  const events = calendarEvents([{ ...movie, inCinemas: '2025-10-05', physicalRelease: '2026-10-31' }], 'movies', range);
  expect(events.map(event => event.release)).toEqual(['digital', 'physical']);
  expect(events[0]).toMatchObject({ mediaId: 1, type: 'movies', hasFile: false, monitored: true, timed: false });
});
it('links episodes to the series rather than episode IDs and retains specials', () => {
  const event = calendarEvents([{ id: 22, seriesId: 2, title: 'Special', airDate: '2026-10-05', seasonNumber: 0, episodeNumber: 1, monitored: true, hasFile: true, series: { id: 2, title: 'Series', monitored: true } }], 'series', range)[0]!;
  expect(event).toMatchObject({ mediaId: 2, monitored: true, hasFile: true }); expect(event.title).toContain('S00E01');
});
it('filters confirmed file states without treating upcoming or cinema releases as missing', () => {
  const event = calendarEvents([movie], 'movies', range)[0]!;
  const today = calendarDate('2026-10-12')!;
  expect(matchesCalendarFilter(event, 'monitored', today)).toBe(true);
  expect(matchesCalendarFilter(event, 'missing', today)).toBe(true);
  expect(matchesCalendarFilter({ ...event, release: 'cinemas' }, 'missing', today)).toBe(false);
  expect(matchesCalendarFilter({ ...event, start: calendarDate('2026-10-20')! }, 'missing', today)).toBe(false);
  expect(matchesCalendarFilter({ ...event, hasFile: true }, 'available', today)).toBe(true);
  expect(matchesCalendarFilter({ ...event, hasFile: null }, 'missing', today)).toBe(false);
  expect(matchesCalendarFilter({ ...event, monitored: null }, 'monitored', today)).toBe(false);
});
it('rejects invalid records and tolerates missing optional states', () => {
  expect(() => calendarEvents(null, 'movies', range)).toThrow('Invalid');
  expect(() => calendarEvents([{ title: 'Episode', series: null }], 'series', range)).toThrow('Invalid');
  expect(calendarEvents([{ title: 'Unknown', digitalRelease: '2026-10-05' }], 'movies', range)[0]).toMatchObject({ mediaId: null, monitored: null, hasFile: null });
});
it('requests the visible range with unmonitored media and included series', async () => {
  const state = setup(); const fetchMock = vi.fn().mockResolvedValue(Response.json([])); vi.stubGlobal('fetch', fetchMock);
  await state.load('2026-12-31', 'week'); expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [url, options] of fetchMock.mock.calls) {
    const params = new URL(url).searchParams;
    expect(params.get('start')).toBe(calendarRange('2026-12-31', 'week').start.toISOString());
    expect(params.get('unmonitored')).toBe('true'); expect(options.headers['X-Api-Key']).toBe('test-only');
    if (url.includes('sonarr')) expect(params.get('includeSeries')).toBe('true');
  }
});
it('supports direct standalone mode for both services', async () => {
  for (const prefix of ['RADARR', 'SONARR']) { vi.stubEnv(`VITE_${prefix}_BASE_URL`, `http://${prefix.toLowerCase()}.direct`); vi.stubEnv(`VITE_${prefix}_API_KEY`, 'direct-only'); }
  const state = setup(false); const fetchMock = vi.fn().mockResolvedValue(Response.json([])); vi.stubGlobal('fetch', fetchMock);
  await state.load('2026-10-12', 'day'); expect(fetchMock.mock.calls.every(call => call[0].includes('.direct/api/v3/calendar'))).toBe(true);
});
it('retains available events when one service fails and supports retry', async () => {
  const state = setup(); let fail = true;
  vi.stubGlobal('fetch', vi.fn(async url => url.includes('sonarr') ? fail ? new Response('secret', { status: 503 }) : Response.json([]) : Response.json([movie])));
  await state.load('2026-10-12', 'month'); expect(state.events.value).toHaveLength(1);
  expect(state.errors.value[0]).toContain('Sonarr'); expect(state.errors.value.join()).not.toContain('secret');
  fail = false; await state.load('2026-10-12', 'month'); expect(state.errors.value).toEqual([]);
});
it('ignores late results after changing period', async () => {
  const state = setup(); const resolvers: ((response: Response) => void)[] = [];
  const fetchMock = vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve))); vi.stubGlobal('fetch', fetchMock);
  const old = state.load('2026-10-12', 'month');
  fetchMock.mockResolvedValue(Response.json([])); await state.load('2026-11-12', 'month');
  resolvers.forEach(resolve => resolve(Response.json([movie]))); await old;
  expect(state.events.value).toEqual([]); expect(state.loading.value).toBe(false);
});
it('invalidates outstanding reads when the instance changes', async () => {
  const state = setup(); const resolvers: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve))));
  const pending = state.load('2026-10-12', 'month'); state.instance.value = { ...state.instance.value, name: 'Other' };
  resolvers.forEach(resolve => resolve(Response.json([movie]))); await pending;
  expect(state.events.value).toEqual([]); expect(state.errors.value).toEqual([]);
});
it('ends pending state after timeouts', async () => {
  vi.useFakeTimers(); const state = setup();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timeout'))))));
  const pending = state.load('2026-10-12', 'month'); await vi.advanceTimersByTimeAsync(15000); await pending;
  expect(state.loading.value).toBe(false); expect(state.errors.value).toHaveLength(2);
});
