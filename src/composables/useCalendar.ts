import { onScopeDispose, ref, watch } from 'vue';
import { readApiJson, requireList, requireObject } from './apiResponse';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';

export type CalendarView = 'month' | 'week' | 'day';
export type CalendarFilter = 'all' | 'monitored' | 'missing' | 'available';
export interface CalendarEvent {
  key: string; title: string; start: Date; end: Date; color: string; timed: false;
  type: MediaType; mediaId: number | null; hasFile: boolean | null; monitored: boolean | null;
  release: 'cinemas' | 'digital' | 'physical' | 'episode';
}
export function calendarDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && calendarDay(date) !== value) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}
export function calendarDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function calendarRange(value: string, view: CalendarView) {
  const anchor = calendarDate(value);
  if (!anchor) throw new Error('Invalid calendar date');
  const start = new Date(anchor); const end = new Date(anchor);
  if (view === 'month') { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  if (view !== 'day') {
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + 6 - end.getDay());
  }
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
export function moveCalendar(value: string, view: CalendarView, direction: -1 | 1) {
  const date = calendarDate(value);
  if (!date) return calendarDay(new Date());
  if (view === 'month') { date.setDate(1); date.setMonth(date.getMonth() + direction); }
  else date.setDate(date.getDate() + direction * (view === 'week' ? 7 : 1));
  return calendarDay(date);
}
const mediaId = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
const bool = (value: unknown) => typeof value === 'boolean' ? value : null;
export function calendarEvents(payload: unknown, type: MediaType, range: ReturnType<typeof calendarRange>): CalendarEvent[] {
  const records = requireList(payload, 'calendar', ['title']);
  const events: CalendarEvent[] = [];
  for (const [index, item] of records.entries()) {
    const add = (rawDate: unknown, title: string, release: CalendarEvent['release'], id: number | null, monitored: boolean | null) => {
      const date = calendarDate(rawDate);
      if (date && date >= range.start && date <= range.end) events.push({
        key: `${type}-${item.id ?? index}-${release}-${calendarDay(date)}`, title,
        start: date, end: date, timed: false, type, mediaId: id, monitored, hasFile: bool(item.hasFile), release,
        color: release === 'cinemas' ? 'blue' : 'green',
      });
    };
    if (type === 'movies') {
      add(item.inCinemas, `${item.title} (Cinemas)`, 'cinemas', mediaId(item.id), bool(item.monitored));
      add(item.digitalRelease, `${item.title} (Digital)`, 'digital', mediaId(item.id), bool(item.monitored));
      add(item.physicalRelease, `${item.title} (Physical)`, 'physical', mediaId(item.id), bool(item.monitored));
    } else {
      const series = requireObject(item.series, 'calendar series');
      if (typeof series.title !== 'string') throw new Error('Invalid calendar series response.');
      const monitored = item.monitored === false || series.monitored === false ? false
        : item.monitored === true && series.monitored === true ? true : null;
      const episode = Number.isInteger(item.seasonNumber) && Number.isInteger(item.episodeNumber)
        ? `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}` : 'Air date';
      add(item.airDate ?? item.airDateUtc, `${series.title} : ${item.title} (${episode})`, 'episode', mediaId(item.seriesId) ?? mediaId(series.id), monitored);
    }
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
}
export function matchesCalendarFilter(event: CalendarEvent, filter: CalendarFilter, today = new Date()) {
  if (filter === 'monitored') return event.monitored === true;
  if (filter === 'available') return event.hasFile === true;
  if (filter === 'missing') return event.hasFile === false && event.release !== 'cinemas' && event.start <= calendarDate(today)!;
  return true;
}

export function useCalendar(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const events = ref<CalendarEvent[]>([]); const loading = ref(false); const errors = ref<string[]>([]);
  let request = 0; let controller: AbortController | null = null;
  function reset() { request++; controller?.abort(); events.value = []; errors.value = []; loading.value = false; }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], reset, { deep: true, flush: 'sync' });
  onScopeDispose(reset);
  async function load(value: string, view: CalendarView) {
    reset(); const current = request; const abort = new AbortController(); controller = abort;
    const timer = setTimeout(() => abort.abort(), 15000); loading.value = true;
    try {
      const range = calendarRange(value, view);
      await Promise.all((['movies', 'series'] as const).map(async type => {
        try {
          const config = getConfig(type);
          if (!config.base_url || !config.api_key) throw new Error('Missing configuration');
          const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString(), unmonitored: 'true' });
          if (type === 'series') params.set('includeSeries', 'true');
          const payload = await readApiJson(await fetch(`${config.base_url}/api/v3/calendar?${params}`, {
            headers: { 'X-Api-Key': config.api_key, Accept: 'application/json' }, signal: abort.signal, cache: 'no-store',
          }));
          const records = calendarEvents(payload, type, range);
          if (current === request) events.value = [...events.value, ...records].sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
        } catch (error) {
          if (current === request) {
            const message = error instanceof Error && /^(Invalid |Unable to load data \(HTTP)/.test(error.message) ? error.message : 'Unable to load calendar. Check the service and retry.';
            errors.value.push(`${type === 'movies' ? 'Radarr' : 'Sonarr'}: ${message}`);
          }
        }
      }));
    } catch {
      if (current === request) errors.value = ['Invalid calendar date. Select a valid period and retry.'];
    } finally { clearTimeout(timer); if (current === request) loading.value = false; }
  }
  return { events, loading, errors, load, reset };
}
