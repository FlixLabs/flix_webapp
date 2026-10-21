export interface Trailer {
  key: string;
  name: string;
  language: string;
  official: boolean;
  publishedAt: number;
}

export interface TrailerMedia {
  tmdbId?: unknown;
  tvdbId?: unknown;
}

const positiveId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
const youtubeKey = /^[\w-]{11}$/;
const invalidResponse = 'Unable to load trailers. Check TMDB and retry.';

export function selectTrailer(payload: unknown, language: string): Trailer | null {
  if (!payload || typeof payload !== 'object' || !('results' in payload) || !Array.isArray(payload.results)) {
    throw new Error(invalidResponse);
  }
  return payload.results.flatMap((video): Trailer[] => {
    if (!video || video.site !== 'YouTube' || video.type !== 'Trailer'
      || typeof video.key !== 'string' || !youtubeKey.test(video.key)
      || video.iso_639_1 !== language) return [];
    return [{ key: video.key, name: typeof video.name === 'string' ? video.name : '',
      language, official: video.official === true, publishedAt: Date.parse(video.published_at) || 0 }];
  }).sort((a, b) => Number(b.official) - Number(a.official)
    || b.publishedAt - a.publishedAt || a.key.localeCompare(b.key))[0] ?? null;
}

export function trailerUrls(key: string) {
  if (!youtubeKey.test(key)) throw new Error('Invalid trailer identifier');
  return {
    embed: `https://www.youtube-nocookie.com/embed/${key}?autoplay=0&playsinline=1&rel=0`,
    external: `https://www.youtube.com/watch?v=${key}`,
  };
}

export async function loadTrailer(item: TrailerMedia, kind: 'movies' | 'series', locale: string, signal: AbortSignal): Promise<Trailer | null> {
  let id = item.tmdbId;
  if (!positiveId(id) && !(kind === 'series' && positiveId(item.tvdbId))) return null;
  const base = import.meta.env.VITE_TMDB_BASE_URL?.replace(/\/+$/, '');
  const key = import.meta.env.VITE_TMDB_API_KEY;
  if (!base || !key) throw new Error(invalidResponse);
  async function get(path: string, language: string, extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ api_key: key, language, ...extra });
    const response = await fetch(`${base}/${path}?${params}`, { signal });
    if (!response.ok) throw new Error(invalidResponse);
    return response.json();
  }
  if (!positiveId(id)) {
    const data = await get(`find/${item.tvdbId}`, 'en-US', { external_source: 'tvdb_id' });
    if (!Array.isArray(data?.tv_results)) throw new Error(invalidResponse);
    // Never guess a series from a title or use a Sonarr ID as a TMDB ID.
    if (data.tv_results.length !== 1 || !positiveId(data.tv_results[0]?.id)) return null;
    id = data.tv_results[0].id;
  }
  const path = `${kind === 'movies' ? 'movie' : 'tv'}/${id}`;
  let preferred = locale;
  if (locale === 'original') {
    const data = await get(path, 'en-US');
    if (data?.id !== id) throw new Error(invalidResponse);
    preferred = typeof data.original_language === 'string' && /^[a-z]{2}$/.test(data.original_language)
      ? data.original_language : 'en-US';
  }
  const language = preferred.split('-')[0]!;
  const video = selectTrailer(await get(`${path}/videos`, preferred), language);
  if (video || language === 'en') return video;
  return selectTrailer(await get(`${path}/videos`, 'en-US'), 'en');
}
