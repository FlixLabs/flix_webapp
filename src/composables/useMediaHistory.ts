import { onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { readApiJson, requireList, requireObject } from './apiResponse';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const labels: Record<string, string> = {
  grabbed: 'Release grabbed', downloadFolderImported: 'File imported',
  downloadFailed: 'Download failed', movieFileDeleted: 'File deleted',
  episodeFileDeleted: 'File deleted', movieFileRenamed: 'File renamed',
  episodeFileRenamed: 'File renamed', seriesFolderImported: 'Existing file imported',
  movieFolderImported: 'Existing file imported', downloadIgnored: 'Download ignored', unknown: 'Unknown event',
};
const numericEvents = {
  movies: ['unknown', 'grabbed', 'unknown', 'downloadFolderImported', 'downloadFailed', 'unknown', 'movieFileDeleted', 'movieFolderImported', 'movieFileRenamed', 'downloadIgnored'],
  series: ['unknown', 'grabbed', 'seriesFolderImported', 'downloadFolderImported', 'downloadFailed', 'episodeFileDeleted', 'episodeFileRenamed', 'downloadIgnored'],
};

export function historyEvent(record: Record<string, unknown>, type: MediaType) {
  const event = typeof record.eventType === 'number' ? numericEvents[type][record.eventType] ?? 'unknown' : text(record.eventType);
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
  const episode = record.episode && typeof record.episode === 'object' ? record.episode as Record<string, unknown> : {};
  const quality = record.quality && typeof record.quality === 'object' ? record.quality as { quality?: { name?: unknown } } : {};
  return {
    id: record.id,
    label: labels[event] ?? (event || 'Unknown event'),
    failed: event === 'downloadFailed',
    title: text(record.sourceTitle) || 'Release title not provided',
    date: text(record.date),
    quality: text(quality.quality?.name),
    episode: Number.isInteger(episode.seasonNumber) && Number.isInteger(episode.episodeNumber)
      ? `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}${text(episode.title) ? ` - ${text(episode.title)}` : ''}` : '',
    details: [
      ['Download client', 'downloadClient'], ['Indexer', 'indexer'], ['Message', 'message'],
      ['Reason', 'reason'], ['Deletion reason', 'reasonDescription'],
    ].flatMap(([label, key]) => text(data[key!]) ? [{ label: label!, value: text(data[key!]) }] : []),
  };
}

export const HISTORY_PAGE_SIZE = 10;
export function useMediaHistory(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const records = ref<ReturnType<typeof historyEvent>[]>([]);
  const total = ref(0);
  const page = ref(1);
  const loading = ref(false);
  const error = ref('');
  let request = 0;
  let controller: AbortController | null = null;
  function reset() {
    request++;
    controller?.abort();
    records.value = []; total.value = 0; page.value = 1;
    loading.value = false; error.value = '';
  }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], reset, { deep: true, flush: 'sync' });
  onScopeDispose(reset);

  async function load(type: MediaType, id: number, targetPage = 1) {
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(targetPage) || targetPage <= 0) return false;
    controller?.abort();
    const current = ++request;
    const abort = new AbortController(); controller = abort;
    records.value = []; loading.value = true; error.value = '';
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const config = getConfig(type);
      if (!config.base_url || !config.api_key) throw new Error('Missing configuration');
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(HISTORY_PAGE_SIZE), sortKey: 'date', sortDirection: 'descending', [type === 'movies' ? 'movieIds' : 'seriesIds']: String(id) });
      if (type === 'series') params.set('includeEpisode', 'true');
      const payload = requireObject(await readApiJson(await fetch(`${config.base_url}/api/v3/history?${params}`, {
        headers: { 'X-Api-Key': config.api_key, Accept: 'application/json' }, signal: abort.signal, cache: 'no-store',
      })), 'history');
      const items = requireList(payload.records, 'history');
      if (!Number.isInteger(payload.totalRecords) || (payload.totalRecords as number) < 0
        || items.length > HISTORY_PAGE_SIZE || items.some(item => item[type === 'movies' ? 'movieId' : 'seriesId'] !== id)) {
        throw new Error('Invalid history response');
      }
      if (current !== request) return false;
      records.value = items.map(item => historyEvent(item, type));
      total.value = payload.totalRecords as number; page.value = targetPage;
      return true;
    } catch {
      if (current === request) error.value = 'Unable to load media history. Check the service and retry.';
      return false;
    } finally {
      clearTimeout(timer);
      if (current === request) loading.value = false;
    }
  }
  return { records, total, page, loading, error, load, reset };
}
