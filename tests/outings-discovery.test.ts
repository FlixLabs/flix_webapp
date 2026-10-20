import { afterEach, expect, it, vi } from 'vitest';
import { loadOutings, orderOutings, outingsUrl, outingsWindow } from '@/composables/outingsDiscovery';
import { region } from '@/i18n/preferences';

const window = { from: '2026-09-20', to: '2027-01-18' };
afterEach(() => vi.unstubAllGlobals());

it('uses calendar days across year boundaries and daylight saving changes', () => {
  expect(outingsWindow(new Date(2026, 9, 20, 12))).toEqual(window);
  expect(outingsWindow(new Date(2026, 2, 29, 12))).toEqual({ from: '2026-02-27', to: '2026-06-27' });
});

it('requests regional cinema dates and new series premieres, not currently airing shows', () => {
  const movies = new URL(outingsUrl('https://tmdb.test/3/', 'test-only', 'movies', window));
  expect(movies.pathname).toBe('/3/discover/movie');
  expect(movies.searchParams.get('region')).toBe(region.value);
  expect(movies.searchParams.get('with_release_type')).toBe('3|2');
  expect(movies.searchParams.get('release_date.gte')).toBe(window.from);
  expect(movies.searchParams.get('release_date.lte')).toBe(window.to);
  expect(movies.searchParams.get('sort_by')).toBe('primary_release_date.asc');
  const series = new URL(outingsUrl('https://tmdb.test', 'test-only', 'series', window));
  expect(series.pathname).toBe('/discover/tv');
  expect(series.searchParams.get('first_air_date.gte')).toBe(window.from);
  expect(series.searchParams.get('first_air_date.lte')).toBe(window.to);
  expect(series.searchParams.has('air_date.gte')).toBe(false);
  expect(series.searchParams.get('sort_by')).toBe('first_air_date.asc');
});

it('sorts by displayed date and stable ID, deduplicates and excludes undated/out-of-window results', () => {
  const pages = [
    [{ id: 8, release_date: '2026-12-01' }, { id: 3, release_date: window.from }, { id: 10 }],
    [{ id: 8, release_date: '2026-12-01' }, { id: 2, release_date: window.from },
      { id: 1, release_date: '2020-01-01' }, { id: 11, release_date: 'invalid' },
      { id: 12, release_date: '2027-02-01' }, { id: 9, release_date: window.to }],
  ];
  expect(orderOutings(pages, 'movies', window).map(item => item.id)).toEqual([2, 3, 8, 9]);
  expect(orderOutings([[{ id: 1, first_air_date: '2010-01-01' }, { id: 2, first_air_date: '2026-10-20' }]], 'series', window))
    .toEqual([{ id: 2, first_air_date: '2026-10-20' }]);
});

it('bounds parallel requests and keeps chronological order despite inverted page completion', async () => {
  let active = 0, peak = 0;
  const completed: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const page = Number(new URL(input).searchParams.get('page') ?? '1');
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, page === 2 ? 40 : 1));
    active--; completed.push(page);
    return { ok: true, json: async () => ({ total_pages: 8,
      results: [{ id: page, release_date: `2026-10-${String(page).padStart(2, '0')}` }] }) };
  }));
  const results = await loadOutings('https://tmdb.test/discover/movie', 'movies', window, new AbortController().signal);
  expect(peak).toBe(4);
  expect(completed.indexOf(3)).toBeLessThan(completed.indexOf(2));
  expect(results.map(item => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

it('fails the whole read on a broken page instead of presenting partial results', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => ({ ok: true,
    json: async () => new URL(input).searchParams.get('page') === '2' ? null : { results: [], total_pages: 2 },
  })));
  await expect(loadOutings('https://tmdb.test/discover/movie', 'movies', window, new AbortController().signal))
    .rejects.toThrow('Invalid upcoming media response');
});

it('does not return results after cancellation or silently truncate inaccessible pages', async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [], total_pages: 1 }) })));
  await expect(loadOutings('https://tmdb.test/discover/movie', 'movies', window, controller.signal)).rejects.toThrow();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [], total_pages: 501 }) })));
  await expect(loadOutings('https://tmdb.test/discover/movie', 'movies', window, new AbortController().signal))
    .rejects.toThrow('Too many upcoming media results');
});
