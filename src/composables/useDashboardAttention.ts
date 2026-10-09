import { readApiJson, requireList, requireObject } from '@/composables/apiResponse';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { useStorageLocations, type RootFolder } from './useStorageLocations';

interface QueueItem { id: number; title: string; status?: string; trackedDownloadStatus?: string; errorMessage?: string }
interface MissingEpisode { id: number; seriesId: number; seasonNumber: number; episodeNumber: number; title: string; series?: { title: string } }
export function needsAttention(item: QueueItem) {
  return !!item.errorMessage || ['warning', 'error'].includes((item.trackedDownloadStatus ?? '').toLowerCase())
    || ['failed', 'error'].includes((item.status ?? '').toLowerCase());
}
export function useDashboardAttention(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const loading = ref(false);
  const errors = ref<string[]>([]);
  const queues = ref<{ type: MediaType; item: QueueItem }[]>([]);
  const episodes = ref<MissingEpisode[]>([]);
  const missingCount = ref<number | null>(null);
  const movieRoots = ref<RootFolder[]>([]);
  const seriesRoots = ref<RootFolder[]>([]);
  const movieDisks = ref<{ path: string; free_space: number; total_space: number }[]>([]);
  const seriesDisks = ref<{ path: string; free_space: number; total_space: number }[]>([]);
  const movieStorage = useStorageLocations(movieRoots, movieDisks);
  const seriesStorage = useStorageLocations(seriesRoots, seriesDisks);
  const blocked = computed(() => queues.value.filter(record => needsAttention(record.item)));
  let controller: AbortController | undefined;

  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    errors.value = [];
    queues.value = []; episodes.value = []; missingCount.value = null;
    movieRoots.value = []; seriesRoots.value = []; movieDisks.value = []; seriesDisks.value = [];
    async function load(type: MediaType, endpoint: string) {
      const config = getConfig(type);
      if (!config.base_url || !config.api_key) throw new Error('Service not configured');
      const response = await fetch(`${config.base_url}/api/v3/${endpoint}`, {
        headers: { 'X-Api-Key': config.api_key },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Service unavailable');
      return readApiJson(response);
    }
    async function task(label: string, action: () => Promise<void>) {
      try { await action(); }
      catch { if (!request.signal.aborted) errors.value.push(`Unable to load ${label}.`); }
    }
    const jobs: Promise<void>[] = (['movies', 'series'] as const).map(type => task(`${type} downloads`, async () => {
      const data = requireObject(await load(type, 'queue?page=1&pageSize=1000'), 'queue');
      const records = requireList<QueueItem>(data.records, 'queue');
      if (!request.signal.aborted) queues.value.push(...records.map(item => ({ type, item })));
    }));
    jobs.push(task('missing episodes', async () => {
      const data = requireObject(await load('series', 'wanted/missing?page=1&pageSize=5&includeSeries=true&monitored=true'), 'missing episodes');
      const records = requireList<MissingEpisode>(data.records, 'missing episodes');
      if (typeof data.totalRecords !== 'number') throw new Error('Invalid episodes');
      if (!request.signal.aborted) { episodes.value = records; missingCount.value = data.totalRecords; }
    }));
    if (!options.useAPI.value || !options.selectedInstanceData.value?.has_storage_agent) {
      for (const type of ['movies', 'series'] as const) jobs.push(task(`${type} storage`, async () => {
        const [roots, disks] = await Promise.all([load(type, 'rootfolder'), load(type, 'diskspace')]);
        const rootFolders = requireList<RootFolder>(roots, 'root folders');
        const diskSpaces = requireList<{ path: string; freeSpace: number; totalSpace: number }>(disks, 'disk space');
        if (request.signal.aborted) return;
        (type === 'movies' ? movieRoots : seriesRoots).value = rootFolders;
        (type === 'movies' ? movieDisks : seriesDisks).value = diskSpaces.map(disk => ({ path: disk.path, free_space: disk.freeSpace / 1024 ** 3, total_space: disk.totalSpace / 1024 ** 3 }));
      }));
    }
    await Promise.all(jobs);
    if (controller === request) loading.value = false;
  }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], () => void refresh(), { immediate: true, flush: 'sync' });
  onScopeDispose(() => controller?.abort());
  return { loading, errors, blocked, episodes, missingCount, movieStorage, seriesStorage, refresh };
}
