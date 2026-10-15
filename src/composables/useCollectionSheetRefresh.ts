import { useReadRequest } from './useReadRequest';
import { useSheetRefreshSchedule } from './useSheetRefreshSchedule';
import { useMediaService, type MediaServiceOptions } from './useMediaService';
import { parseCollections, type MovieCollection } from './collections';
import { parseLibraryMedia } from './libraryMedia';
import { readApiJson } from './apiResponse';

export interface CollectionSheetUpdate {
  collection: MovieCollection;
  movies: ReturnType<typeof parseLibraryMedia>;
}
export function useCollectionSheetRefresh(options: MediaServiceOptions & {
  open: () => boolean;
  collection: () => MovieCollection | undefined;
  blocked: () => boolean;
  refreshed: (update: CollectionSheetUpdate) => void;
}) {
  const { getConfig, serviceContext } = useMediaService(options);
  const context = () => [options.open(), options.collection()?.id, options.collection()?.tmdbId, serviceContext()];
  const read = useReadRequest(context);
  const eligible = () => options.open() && Number.isSafeInteger(options.collection()?.id) && Number(options.collection()?.id) > 0;
  const schedule = useSheetRefreshSchedule({ context, enabled: eligible, refresh });
  async function refresh() {
    if (!eligible() || options.blocked() || !schedule.active() || read.state.loading) return;
    const selected = options.collection()!;
    const { base_url, api_key } = getConfig('movies');
    const request = read.begin();
    try {
      if (!base_url || !api_key) throw new Error('Select a configured instance to refresh this collection.');
      const load = async (path: string) => readApiJson(await fetch(`${base_url}/api/v3/${path}`, {
        headers: { 'X-Api-Key': api_key }, signal: request.signal, cache: 'no-store',
      }));
      const [rawCollection, rawMovies] = await Promise.all([load(`collection/${selected.id}`), load('movie')]);
      const collection = parseCollections([rawCollection])[0]!;
      const movies = parseLibraryMedia(rawMovies, 'movies');
      if (collection.id !== selected.id || collection.tmdbId !== selected.tmdbId) throw new Error('Collection identity changed. Reopen the sheet from your library.');
      if (!request.isCurrent() || !eligible() || options.blocked()) return;
      // Commit both reads together so badges and membership cannot disagree.
      options.refreshed({ collection, movies });
      request.success();
    } catch (error) {
      if (request.isCurrent()) {
        request.fail(error);
        // The other parallel read may still be running after the first failed.
        read.cancel();
      }
    }
    finally { request.finish(); }
  }
  return { state: read.state, refresh };
}
