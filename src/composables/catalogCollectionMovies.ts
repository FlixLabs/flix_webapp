import type { LibraryMovie } from './collections';
import type { CollectionDownloadMovie } from './useCollectionDownloads';
import type { MediaActionItem } from './useMediaActions';
import type { MediaServiceConfig } from './useMediaService';

export interface CatalogMovieLookup extends MediaActionItem {
  tmdbId: number;
  title: string;
  status?: string;
  year?: number;
  overview?: string;
  runtime?: number;
  images?: unknown;
}

const invalidLookup = 'Invalid movie lookup. No movie was added.';
const loadFailure = 'Unable to load movie library.';
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export async function lookupCatalogMovie(config: MediaServiceConfig, tmdbId: number, signal: AbortSignal): Promise<CatalogMovieLookup> {
  signal.throwIfAborted();
  if (!positiveId(tmdbId)) throw new Error(invalidLookup);
  if (!config.base_url || !config.api_key) throw new Error(loadFailure);
  const url = `${config.base_url.replace(/\/+$/, '')}/api/v3/movie/lookup/tmdb?${new URLSearchParams({ tmdbId: String(tmdbId), apikey: config.api_key })}`;
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', signal, cache: 'no-store' });
  } catch {
    signal.throwIfAborted();
    throw new Error(loadFailure);
  }
  signal.throwIfAborted();
  if (!response.ok) throw new Error(loadFailure);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    signal.throwIfAborted();
    throw new Error(invalidLookup);
  }
  signal.throwIfAborted();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(invalidLookup);
  const movie = data as Record<string, unknown>;
  if (!positiveId(movie.tmdbId) || movie.tmdbId !== tmdbId || typeof movie.title !== 'string' || !movie.title.trim()) {
    throw new Error(invalidLookup);
  }
  return { ...movie, tmdbId, title: movie.title.trim() } as CatalogMovieLookup;
}

export async function prepareCatalogMovies(
  config: MediaServiceConfig,
  members: { tmdbId: number; title: string; year?: number }[],
  library: LibraryMovie[],
  signal: AbortSignal,
): Promise<CollectionDownloadMovie[]> {
  signal.throwIfAborted();
  const seen = new Set(library.map(movie => movie.tmdbId));
  const candidates = members.filter(movie => {
    if (!positiveId(movie.tmdbId)) throw new Error(invalidLookup);
    if (seen.has(movie.tmdbId)) return false;
    seen.add(movie.tmdbId);
    return true;
  });
  const results: CollectionDownloadMovie[] = new Array(candidates.length);
  let next = 0;
  let failed = false;
  async function worker() {
    try {
      while (!failed && next < candidates.length) {
        signal.throwIfAborted();
        const index = next++;
        const movie = await lookupCatalogMovie(config, candidates[index]!.tmdbId, signal);
        signal.throwIfAborted();
        const state = movie.status === 'released' ? 'Missing'
          : movie.status === 'announced' || movie.status === 'inCinemas' ? 'Upcoming' : null;
        if (!state) throw new Error('Movie availability could not be confirmed.');
        results[index] = { tmdbId: movie.tmdbId, title: movie.title, year: movie.year, status: movie.status, state };
      }
    } catch (error) {
      // A failed batch must not schedule further lookups or expose partial results.
      failed = true;
      throw error;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, () => worker()));
  signal.throwIfAborted();
  return results;
}
