import { readApiJson, requireList, requireObject, optionalList } from './apiResponse';
import { rankSearchResults } from './useSearchRelevance';

export interface MediaSearchResult extends Record<string, unknown> {
  title: string;
  tmdbId?: number;
  tvdbId?: number;
  originalTitle?: string;
  alternateTitles?: { title: string }[];
}
interface TranslatedMedia {
  id: number;
  title: string;
  originalTitle?: string;
}
interface SearchOptions {
  query: string;
  type: 'movies' | 'series';
  serviceUrl: string;
  serviceKey: string;
  tmdbUrl: string;
  tmdbKey: string;
  language: string;
  signal: AbortSignal;
}
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

// TMDB contributes search aliases; actionable resources always come from Radarr/Sonarr.
export async function supplementMediaSearch(native: MediaSearchResult[], options: SearchOptions): Promise<MediaSearchResult[]> {
  if (options.signal.aborted || !options.tmdbUrl || !options.tmdbKey
    || /^(tmdb|tvdb|imdb):/i.test(options.query.trim())) return native;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 2500);
  try {
    const isMovie = options.type === 'movies';
    const tmdbUrl = options.tmdbUrl.replace(/\/$/, '');
    const serviceUrl = options.serviceUrl.replace(/\/$/, '');
    const params = new URLSearchParams({ query: options.query, api_key: options.tmdbKey, language: options.language, include_adult: 'false' });
    const titleField = isMovie ? 'title' : 'name';
    const originalField = isMovie ? 'original_title' : 'original_name';
    const json = requireObject(await readApiJson(await fetch(`${tmdbUrl}/search/${isMovie ? 'movie' : 'tv'}?${params}`, { signal: controller.signal, cache: 'no-store' })), 'translated search');
    const candidates: TranslatedMedia[] = requireList(json.results, 'translated search', [titleField])
      .filter(item => positiveId(item.id) && (item[originalField] == null || typeof item[originalField] === 'string'))
      .map(item => ({ id: item.id as number, title: item[titleField] as string, originalTitle: item[originalField] as string | undefined }));
    const aliases = new Map(candidates.map(item => [item.id, item]));
    const tvdbAliases = new Map<number, TranslatedMedia>();
    const existing = new Set(native.map(item => item.tmdbId).filter(positiveId));
    const existingTvdb = new Set(native.map(item => item.tvdbId).filter(positiveId));
    const missing = rankSearchResults(candidates, options.query)
      .filter((item, index, all) => !existing.has(item.id) && all.findIndex(other => other.id === item.id) === index)
      .slice(0, 3);
    const additions = await Promise.all(missing.map(async item => {
      try {
        if (isMovie) {
          const params = new URLSearchParams({ tmdbId: String(item.id), apikey: options.serviceKey });
          const resource = requireObject<MediaSearchResult>(await readApiJson(await fetch(`${serviceUrl}/api/v3/movie/lookup/tmdb?${params}`, { signal: controller.signal, cache: 'no-store' })), 'movie lookup');
          return resource.tmdbId === item.id && typeof resource.title === 'string' && resource.title.trim() ? resource : undefined;
        }
        const params = new URLSearchParams({ api_key: options.tmdbKey });
        const external = requireObject(await readApiJson(await fetch(`${tmdbUrl}/tv/${item.id}/external_ids?${params}`, { signal: controller.signal, cache: 'no-store' })), 'series identifiers');
        if (external.id !== item.id || !positiveId(external.tvdb_id)) return undefined;
        tvdbAliases.set(external.tvdb_id, item);
        if (existingTvdb.has(external.tvdb_id)) return undefined;
        const lookup = new URLSearchParams({ term: `tvdb:${external.tvdb_id}`, apikey: options.serviceKey });
        const resources = requireList<MediaSearchResult>(await readApiJson(await fetch(`${serviceUrl}/api/v3/series/lookup?${lookup}`, { signal: controller.signal, cache: 'no-store' })), 'series lookup', ['title']);
        const matches = resources.filter(resource => resource.tvdbId === external.tvdb_id && resource.title.trim()
          && (resource.tmdbId == null || resource.tmdbId === 0 || resource.tmdbId === item.id));
        return matches.length === 1 ? matches[0] : undefined;
      } catch { return undefined; }
    }));
    if (options.signal.aborted) return native;
    const identities = new Set(native.map(item => isMovie ? item.tmdbId : item.tvdbId).filter(positiveId));
    const unique = additions.filter((item): item is MediaSearchResult => {
      if (!item) return false;
      const id = isMovie ? item.tmdbId : item.tvdbId;
      if (!positiveId(id) || identities.has(id)) return false;
      identities.add(id);
      return true;
    });
    return [...native, ...unique].map(item => {
      const translation = (!isMovie && item.tvdbId ? tvdbAliases.get(item.tvdbId) : undefined)
        ?? (item.tmdbId ? aliases.get(item.tmdbId) : undefined);
      if (!translation) return item;
      const titles = optionalList<{ title: string }>(item.alternateTitles, 'alternate titles');
      return { ...item, alternateTitles: [...titles, { title: translation.title }, { title: translation.originalTitle ?? translation.title }] };
    });
  } catch {
    return native;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
  }
}
