import { ref, onScopeDispose } from 'vue';
import { useMediaService, type MediaServiceOptions } from './useMediaService';
import { useMediaActions } from './useMediaActions';
import { readApiJson, requireList } from './apiResponse';
import { useReadRequest } from './useReadRequest';

export interface CollectionDownloadMovie {
  tmdbId: number;
  title: string;
  year?: number;
  localId?: number;
  status?: string;
  state: string;
}
export interface CollectionDownloadResult {
  tmdbId: number;
  title: string;
  state: 'requested' | 'skipped' | 'failed';
  message: string;
}
export function downloadableCollectionMovies(movies: CollectionDownloadMovie[]) {
  return movies.filter(movie => movie.state === 'Missing' && movie.status === 'released'
    && Number.isSafeInteger(movie.tmdbId) && movie.tmdbId > 0);
}

export function useCollectionDownloads(options: MediaServiceOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const actionContext = () => JSON.stringify([serviceContext(), getConfig('movies').root_folder_path]);
  const read = useReadRequest(actionContext);
  const pending = ref(false);
  const results = ref<CollectionDownloadResult[]>([]);
  let disposed = false;
  onScopeDispose(() => { disposed = true; });
  const actions = useMediaActions({ ...options, requestTimeoutMs: 20000,
    showSuccessAlert: () => {}, showErrorAlert: () => {}, refreshContent: () => {} });

  async function run(movies: CollectionDownloadMovie[], qualityProfileId: number | null) {
    if (pending.value) return;
    const context = actionContext();
    const current = () => !disposed && context === actionContext();
    const config = getConfig('movies');
    if (!config.base_url || !config.api_key) return;
    const candidates = [...new Map(downloadableCollectionMovies(movies).map(movie => [movie.tmdbId, movie])).values()];
    pending.value = true;
    results.value = [];
    try {
      for (const movie of candidates) {
        if (!current()) break;
        const request = read.begin();
        try {
          const get = async (path: string, params: Record<string, string>) => {
            const url = `${config.base_url}/api/v3/${path}?${new URLSearchParams({ ...params, apikey: config.api_key })}`;
            const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
            if (!response.ok) throw new Error(`Unable to verify movie (${response.status}). No search was requested.`);
            return readApiJson(response);
          };
          const matches = requireList<{ id: number; tmdbId: number; title: string; status?: string; hasFile?: boolean }>(
            await get('movie', { tmdbId: String(movie.tmdbId) }), 'movie library', ['title']);
          if (!current() || !request.isCurrent()) break;
          if (matches.some(item => item.tmdbId !== movie.tmdbId) || matches.length > 1) throw new Error('Invalid movie identity. No search was requested.');
          const local = matches[0];
          if (local && (!Number.isSafeInteger(local.id) || local.id <= 0)) throw new Error('Invalid movie ID. No search was requested.');
          if (local && (local.hasFile !== false || local.status !== 'released')) {
            results.value.push({ ...movie, state: 'skipped', message: 'Already available or availability could not be confirmed.' });
            request.success();
            continue;
          }
          let response: Response | null | void;
          if (local) {
            request.success();
            request.finish();
            response = await actions.searchItem('movies', local);
          } else {
            if (!config.root_folder_path || !Number.isSafeInteger(qualityProfileId) || Number(qualityProfileId) <= 0) {
              throw new Error('Choose a quality profile and configure a root folder before adding this movie.');
            }
            const lookup = await get('movie/lookup/tmdb', { tmdbId: String(movie.tmdbId) }) as Record<string, unknown> | null;
            if (!current() || !request.isCurrent()) break;
            if (!lookup || lookup.tmdbId !== movie.tmdbId || typeof lookup.title !== 'string' || !lookup.title.trim()) throw new Error('Invalid movie lookup. No movie was added.');
            if (lookup.status !== 'released') {
              results.value.push({ ...movie, state: 'skipped', message: 'The movie is not released.' });
              request.success();
              continue;
            }
            request.success();
            request.finish();
            response = await actions.addItem('movies', { ...movie, title: lookup.title, qualityProfileId: qualityProfileId! });
          }
          if (!current()) break;
          results.value.push({ ...movie, state: response ? 'requested' : 'failed', message: response
            ? 'Search requested. Download depends on available releases and the quality profile.'
            : 'Request failed or its outcome is uncertain. Refresh before trying again.' });
        } catch (error) {
          if (!current()) break;
          results.value.push({ ...movie, state: 'failed', message: error instanceof Error ? error.message : 'Unable to request this movie.' });
        } finally { request.finish(); }
      }
    } finally { pending.value = false; }
  }
  return { pending, results, run };
}
