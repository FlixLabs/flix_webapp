import { onScopeDispose, ref, watch } from 'vue';
import { readApiJson, requireObject } from './apiResponse';
import { parseCollections } from './collections';
import { useMediaService, type MediaServiceOptions } from './useMediaService';

export interface RemovableCollectionMovie { tmdbId: number; localId?: number; title: string; year?: number }
export interface CollectionRemovalTarget { id: number; tmdbId: number; title: string }
export interface CollectionRemovalResult { tmdbId: number; title: string; state: 'removed' | 'skipped' | 'failed' | 'unconfirmed'; message: string }
const positiveId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;
export function removableCollectionMovies(movies: RemovableCollectionMovie[]) {
  const seen = new Set<number>();
  const localIds = new Set<number>();
  return movies.filter(movie => {
    if (!positiveId(movie.localId) || !positiveId(movie.tmdbId) || seen.has(movie.tmdbId) || localIds.has(movie.localId)) return false;
    seen.add(movie.tmdbId); localIds.add(movie.localId); return true;
  });
}

export function useCollectionRemoval(options: MediaServiceOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const pending = ref(false);
  const results = ref<CollectionRemovalResult[]>([]);
  const error = ref('');
  let generation = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  function invalidate() { generation++; controller?.abort(); pending.value = false; }
  watch(serviceContext, () => { invalidate(); results.value = []; error.value = ''; }, { flush: 'sync' });
  onScopeDispose(() => { disposed = true; invalidate(); });

  async function run(target: CollectionRemovalTarget, selection: RemovableCollectionMovie[], deleteFiles: boolean) {
    if (pending.value || disposed) return;
    const movies = removableCollectionMovies(selection).map(movie => ({ ...movie }));
    const config = getConfig('movies');
    if (!positiveId(target.id) || !positiveId(target.tmdbId) || !movies.length || !config.base_url || !config.api_key || typeof deleteFiles !== 'boolean') {
      error.value = 'Select a configured instance and valid library movies before removing.'; return;
    }
    const current = ++generation;
    const expected = { ...target };
    const context = serviceContext();
    const abort = new AbortController(); controller = abort;
    const active = () => !disposed && current === generation && serviceContext() === context;
    const headers = { 'X-Api-Key': config.api_key };
    const url = `${config.base_url}/api/v3`;
    async function request(path: string, method = 'GET') {
      const timer = setTimeout(() => abort.abort(), 20000);
      try {
        const response = await fetch(`${url}/${path}`, { method, headers, signal: abort.signal, cache: 'no-store' });
        return { response, data: method === 'GET' && response.status !== 404 ? await readApiJson(response) : undefined };
      }
      finally { clearTimeout(timer); }
    }
    pending.value = true; results.value = []; error.value = '';
    try {
      const fresh = parseCollections([(await request(`collection/${expected.id}`)).data])[0]!;
      if (!active()) return;
      if (fresh.id !== expected.id || fresh.tmdbId !== expected.tmdbId) throw new Error('The collection changed. Reload it before removing movies.');
      const members = new Set(fresh.movies.map(movie => movie.tmdbId));
      for (const movie of movies) {
        if (!active() || abort.signal.aborted) break;
        let writing = false;
        try {
          if (!members.has(movie.tmdbId)) {
            results.value.push({ ...movie, state: 'skipped', message: 'No longer belongs to this collection.' }); continue;
          }
          const response = await request(`movie/${movie.localId}`);
          if (!active()) return;
          if (response.response.status === 404) {
            results.value.push({ ...movie, state: 'skipped', message: 'Already absent from the library.' }); continue;
          }
          const resource = requireObject(response.data, 'movie');
          const collection = resource.collection as { tmdbId?: unknown } | null | undefined;
          if (!active() || abort.signal.aborted) return;
          if (resource.id !== movie.localId || resource.tmdbId !== movie.tmdbId
            || (positiveId(collection?.tmdbId) && collection.tmdbId !== expected.tmdbId)) {
            results.value.push({ ...movie, state: 'skipped', message: 'Movie identity or collection changed. Nothing removed.' }); continue;
          }
          writing = true;
          const removed = await request(`movie/${movie.localId}?deleteFiles=${deleteFiles}&addImportExclusion=false`, 'DELETE');
          if (!active()) return;
          if (!removed.response.ok) throw new Error('Removal could not be confirmed.');
          results.value.push({ ...movie, state: 'removed', message: deleteFiles ? 'Removed from library; file deletion requested.' : 'Removed from library; files kept.' });
        } catch {
          if (!active()) return;
          results.value.push({ ...movie, state: writing ? 'unconfirmed' : 'failed', message: writing
            ? 'Removal not confirmed. Reload the library before trying again. Remaining films were not processed.'
            : 'Unable to verify this movie. Nothing removed.' });
          if (writing || abort.signal.aborted) break;
        }
      }
    } catch (cause) {
      if (active()) error.value = cause instanceof Error ? cause.message : 'Unable to verify the collection. Nothing removed.';
    } finally { if (active()) pending.value = false; }
  }
  return { pending, results, error, run };
}
