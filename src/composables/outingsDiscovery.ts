import { fetchTmdbPage, localizedTmdbUrl, type TmdbItem } from './fetchTmdbPage';

type MediaType = 'movies' | 'series';
export interface OutingsWindow { from: string; to: string }

export function outingsWindow(now = new Date()): OutingsWindow {
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const offset = (days: number) => new Date(day.getTime() + days * 86400000).toISOString().slice(0, 10);
  return { from: offset(-30), to: offset(90) };
}

export function outingsUrl(base: string, apiKey: string, type: MediaType, window: OutingsWindow) {
  const url = new URL(`${base.replace(/\/$/, '')}/discover/${type === 'movies' ? 'movie' : 'tv'}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('include_adult', 'false');
  const date = type === 'movies' ? 'release_date' : 'first_air_date';
  url.searchParams.set(`${date}.gte`, window.from);
  url.searchParams.set(`${date}.lte`, window.to);
  url.searchParams.set('sort_by', type === 'movies' ? 'primary_release_date.asc' : 'first_air_date.asc');
  if (type === 'movies') {
    url.searchParams.set('include_video', 'false');
    url.searchParams.set('with_release_type', '3|2');
  } else {
    url.searchParams.set('include_null_first_air_dates', 'false');
  }
  return localizedTmdbUrl(url.toString());
}

function dateOf(item: TmdbItem, type: MediaType) {
  return (type === 'movies' ? item.release_date : item.first_air_date) ?? '';
}

export function orderOutings(pages: TmdbItem[][], type: MediaType, window: OutingsWindow) {
  const unique = new Map<number, TmdbItem>();
  for (const item of pages.flat()) {
    const date = dateOf(item, type);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
      || date < window.from || date > window.to || unique.has(item.id)) continue;
    unique.set(item.id, item);
  }
  // ID is a stable tie-breaker, independent of response timing and translated titles.
  return [...unique.values()].sort((a, b) => dateOf(a, type).localeCompare(dateOf(b, type)) || a.id - b.id);
}

export async function loadOutings(url: string, type: MediaType, window: OutingsWindow, signal: AbortSignal) {
  const controller = new AbortController();
  const requestSignal = AbortSignal.any([signal, controller.signal]);
  try {
    const first = await fetchTmdbPage(url, { signal: requestSignal });
    // TMDB does not expose discover pages beyond 500. Never silently truncate a list.
    if (first.total_pages > 500) throw new Error('Too many upcoming media results. Please try again later.');
    const pages: TmdbItem[][] = [first.results];
    let nextPage = 2;
    const worker = async () => {
      while (nextPage <= first.total_pages) {
        requestSignal.throwIfAborted();
        const page = nextPage++;
        const pageUrl = new URL(url);
        pageUrl.searchParams.set('page', String(page));
        const response = await fetchTmdbPage(pageUrl.toString(), { signal: requestSignal });
        pages[page - 1] = response.results;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, first.total_pages - 1) }, worker));
    requestSignal.throwIfAborted();
    return orderOutings(pages, type, window);
  } finally {
    controller.abort();
  }
}
