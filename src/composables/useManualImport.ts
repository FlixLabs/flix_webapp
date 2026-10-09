import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceConfig, type MediaServiceOptions, type MediaType } from './useMediaService';

export interface ImportDownload {
  title: string;
  downloadId?: string;
  outputPath?: string;
  status?: string;
  trackedDownloadState?: string;
}
interface Media { id: number; title: string; year?: number }
interface Quality { id: number; name: string }
interface Episode { id: number; seasonNumber: number; episodeNumber: number; title: string }
export interface ImportFile {
  id: number;
  path: string;
  relativePath?: string;
  name?: string;
  folderName?: string;
  size?: number;
  movie?: Media;
  series?: Media;
  episodes?: Episode[];
  quality?: { quality?: Quality; revision?: Record<string, number> };
  languages?: { id: number; name: string }[];
  releaseGroup?: string;
  indexerFlags?: number;
  releaseType?: string;
  rejections?: { reason: string; type?: string }[];
  mediaId: number | null;
  qualityId: number | null;
  episodeIds: number[];
  selected: boolean;
}

export function canManualImport(download: ImportDownload) {
  return typeof download.downloadId === 'string' && !!download.downloadId.trim()
    && !['importing', 'imported'].includes(download.trackedDownloadState?.toLowerCase() ?? '') && (
    download.status?.toLowerCase() === 'completed'
    || ['importpending', 'importblocked', 'importfailed']
      .includes(download.trackedDownloadState?.toLowerCase() ?? '')
  );
}

export function useManualImport(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const dialog = ref(false);
  const confirming = ref(false);
  const type = ref<MediaType>('movies');
  const title = ref('');
  const files = ref<ImportFile[]>([]);
  const media = ref<Media[]>([]);
  const qualities = ref<Quality[]>([]);
  const episodes = ref<Record<number, Episode[]>>({});
  const loadingEpisodes = ref<Record<number, boolean>>({});
  const loading = ref(false);
  const busy = ref(false);
  const error = ref('');
  const commandId = ref<number | null>(null);
  const commandState = ref('');
  const submissionAttempted = ref(false);
  const selected = computed(() => files.value.filter(file => file.selected));
  const canReview = computed(() => !submissionAttempted.value && selected.value.length > 0 && selected.value.every(validFile));
  let context: { type: MediaType; download: ImportDownload; config: MediaServiceConfig } | null = null;
  let controller: AbortController | null = null;

  function current(active: NonNullable<typeof context>) {
    const config = getConfig(active.type);
    return context === active && config.base_url === active.config.base_url && config.api_key === active.config.api_key;
  }
  async function request(active: NonNullable<typeof context>, path: string, body?: unknown) {
    const response = await fetch(`${active.config.base_url}/api/v3/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Api-Key': active.config.api_key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`Service request failed (${response.status}).`);
    return response.json();
  }
  function validFile(file: ImportFile) {
    return !!file.path && media.value.some(item => item.id === file.mediaId)
      && qualities.value.some(item => item.id === file.qualityId)
      && (type.value === 'movies' || (!!file.episodeIds.length && file.episodeIds.every(id =>
        episodes.value[file.mediaId!]?.some(episode => episode.id === id))));
  }
  function close() {
    controller?.abort();
    controller = null;
    context = null;
    dialog.value = false;
    confirming.value = false;
    files.value = [];
    media.value = [];
    qualities.value = [];
    episodes.value = {};
    loadingEpisodes.value = {};
    loading.value = false;
    busy.value = false;
    commandId.value = null;
    commandState.value = '';
    submissionAttempted.value = false;
    error.value = '';
  }
  async function loadEpisodes(seriesId: number) {
    const active = context;
    if (!active || !current(active) || episodes.value[seriesId] || loadingEpisodes.value[seriesId]) return;
    loadingEpisodes.value[seriesId] = true;
    try {
      const data = await request(active, `episode?seriesId=${seriesId}`);
      if (!Array.isArray(data)) throw new Error('Invalid episode response.');
      if (current(active)) episodes.value[seriesId] = data;
    } catch {
      if (current(active)) error.value = 'Unable to load episodes. Reopen the import to try again.';
    } finally {
      if (current(active)) loadingEpisodes.value[seriesId] = false;
    }
  }
  async function open(mediaType: MediaType, download: ImportDownload) {
    close();
    type.value = mediaType;
    title.value = download.title;
    dialog.value = true;
    const config = getConfig(mediaType);
    if (!canManualImport(download) || !config.base_url || !config.api_key) {
      error.value = 'Manual import requires a completed download and a configured service.';
      return;
    }
    const active = { type: mediaType, download: { ...download }, config: { ...config } };
    context = active;
    controller = new AbortController();
    loading.value = true;
    try {
      // Sonarr's seriesId query scans the library instead of the download directory.
      const params = new URLSearchParams({ downloadId: download.downloadId!, filterExistingFiles: 'true' });
      if (download.outputPath) params.set('folder', download.outputPath);
      const [candidates, library, definitions] = await Promise.all([
        request(active, `manualimport?${params}`),
        request(active, mediaType === 'movies' ? 'movie' : 'series'),
        request(active, 'qualitydefinition'),
      ]);
      if (![candidates, library, definitions].every(Array.isArray)) throw new Error('Invalid import response.');
      if (!current(active)) return;
      media.value = library;
      qualities.value = definitions.map((definition: { quality: Quality }) => definition.quality).filter((quality: Quality) => quality?.id > 0);
      files.value = candidates.filter((file: ImportFile) => typeof file.path === 'string' && file.path.length > 0).map((file: ImportFile) => ({
        ...file, mediaId: (mediaType === 'movies' ? file.movie?.id : file.series?.id) ?? null,
        qualityId: file.quality?.quality?.id ?? null,
        episodeIds: file.episodes?.map(episode => episode.id) ?? [], selected: false,
      }));
      if (mediaType === 'series') await Promise.all([...new Set(files.value.map(file => file.mediaId).filter((id): id is number => id !== null))].map(loadEpisodes));
    } catch {
      if (current(active)) error.value = 'Unable to inspect this download. Check the service and download path, then reopen the import.';
    } finally {
      if (current(active)) loading.value = false;
    }
  }
  function payload(file: ImportFile) {
    return {
      id: file.id, path: file.path, folderName: file.folderName,
      downloadId: context!.download.downloadId,
      quality: { ...file.quality, quality: qualities.value.find(quality => quality.id === file.qualityId) },
      languages: file.languages ?? [], releaseGroup: file.releaseGroup, indexerFlags: file.indexerFlags,
      ...(type.value === 'movies' ? { movieId: file.mediaId } : {
        seriesId: file.mediaId, episodeIds: [...file.episodeIds], releaseType: file.releaseType,
      }),
    };
  }
  let reviewed: ReturnType<typeof payload>[] = [];
  async function review() {
    const active = context;
    if (!active || !current(active) || !canReview.value || busy.value || commandId.value !== null) return;
    busy.value = true;
    error.value = '';
    try {
      const selection = selected.value.map(payload);
      const result = await request(active, 'manualimport', selection);
      if (!current(active)) return;
      if (!Array.isArray(result) || result.length !== selection.length) throw new Error('Invalid review response.');
      for (const file of selected.value) {
        const updated = result.find((item: ImportFile) => item.path === file.path);
        if (!updated) throw new Error('Missing reviewed file.');
        file.rejections = updated.rejections ?? [];
        file.languages = updated.languages ?? file.languages;
        file.quality = updated.quality ?? file.quality;
      }
      reviewed = selected.value.map(payload);
      confirming.value = true;
    } catch {
      if (current(active)) error.value = 'Unable to review the selected files. No import was requested.';
    } finally {
      if (current(active)) busy.value = false;
    }
  }
  async function submit(): Promise<boolean> {
    const active = context;
    if (!active || !current(active) || busy.value || !confirming.value || !canReview.value || commandId.value !== null) return false;
    busy.value = true;
    error.value = '';
    try {
      if (JSON.stringify(selected.value.map(payload)) !== JSON.stringify(reviewed)) throw new Error('Selection changed. Review it again before importing.');
      submissionAttempted.value = true;
      const command = await request(active, 'command', { name: 'ManualImport', files: reviewed, importMode: 'auto' });
      if (!current(active)) return false;
      if (!Number.isInteger(command.id) || command.id <= 0) throw new Error('Invalid import command response.');
      commandId.value = command.id;
      commandState.value = command.status ?? 'queued';
      confirming.value = false;
      return true;
    } catch (cause) {
      if (current(active)) error.value = submissionAttempted.value
        ? 'Unable to verify whether the import was accepted. Check Downloads or the service before reopening this import; do not submit it again blindly.'
        : cause instanceof Error ? cause.message : 'Unable to request the import.';
      return false;
    } finally {
      if (current(active)) busy.value = false;
    }
  }
  async function checkStatus(): Promise<boolean> {
    const active = context;
    if (!active || !current(active) || busy.value || commandId.value === null) return false;
    busy.value = true;
    error.value = '';
    try {
      const command = await request(active, `command/${commandId.value}`);
      if (!current(active)) return false;
      if (typeof command.status !== 'string') throw new Error('Invalid command status.');
      commandState.value = command.status;
      if (['failed', 'aborted', 'cancelled'].includes(command.status)) error.value = 'Import failed. Check the remaining download messages in Radarr or Sonarr.';
      return command.status === 'completed';
    } catch {
      if (current(active)) error.value = 'Unable to check the import status. The command may still be running.';
      return false;
    } finally {
      if (current(active)) busy.value = false;
    }
  }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], close, { flush: 'sync' });
  if (getCurrentScope()) onScopeDispose(close);
  return { dialog, confirming, type, title, files, media, qualities, episodes, loadingEpisodes, loading, busy, error,
    commandId, commandState, selected, canReview, open, close, loadEpisodes, review, submit, checkStatus };
}
