import { readApiJson, requireList, requireObject, optionalList } from '@/composables/apiResponse';
import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceConfig, type MediaServiceOptions, type MediaType } from './useMediaService';
import { rememberImport, findRunningImport, checkTrackedImport } from './manualImportTracking';
import { queueImportBlock, commandImportBlock, readRemovalQueue } from './queueImportProtection';

export interface ImportDownload {
  title: string;
  downloadId?: string;
  outputPath?: string;
  status?: string;
  trackedDownloadState?: string;
}
interface Media { id: number; title: string; year?: number }
interface Quality { id: number; name: string }
interface Language { id: number; name: string }
class ImportRequestError extends Error {
  constructor(public status: number, public unparsedMoviePath?: string) { super(`Service request failed (${status}).`); }
}
class ImportProtectionError extends Error {}
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
  quality?: { quality?: Quality; revision?: Record<string, number | boolean> };
  languages?: Language[];
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
  const languages = ref<Language[]>([]);
  const episodes = ref<Record<number, Episode[]>>({});
  const loadingEpisodes = ref<Record<number, boolean>>({});
  const loading = ref(false);
  const busy = ref(false);
  const error = ref('');
  const parsingFailureSelection = ref('');
  const manualReview = ref(false);
  const commandId = ref<number | null>(null);
  const commandState = ref('');
  let trackingKey = '';
  const submissionAttempted = ref(false);
  const selected = computed(() => files.value.filter(file => file.selected));
  const canReview = computed(() => !submissionAttempted.value && selected.value.length > 0 && selected.value.every(validFile));
  let context: { type: MediaType; download: ImportDownload; config: MediaServiceConfig } | null = null;
  let controller: AbortController | null = null;
  const canContinueManually = computed(() => dialog.value && type.value === 'movies' && !!context && current(context)
    && canReview.value && selected.value.length === 1 && selected.value.every(file =>
      !!file.languages?.length && file.languages.every(language => languages.value.some(item => item.id === language.id)))
    && !!parsingFailureSelection.value && JSON.stringify(selected.value.map(payload)) === parsingFailureSelection.value);

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
    if (!response.ok) {
      let unparsedMoviePath: string | undefined;
      if (response.status === 500 && path === 'manualimport' && body !== undefined && active.type === 'movies') {
        try {
          const failure = await response.json();
          const prefix = 'Unable to parse movie info from path: ';
          if (typeof failure?.message === 'string' && failure.message.startsWith(prefix)
            && typeof failure.description === 'string'
            && failure.description.startsWith('NzbDrone.Core.MediaFiles.MovieImport.Aggregation.AugmentingFailedException:')) {
            unparsedMoviePath = failure.message.slice(prefix.length);
          }
        } catch { /* An unknown service error must never enable manual continuation. */ }
      }
      throw new ImportRequestError(response.status, unparsedMoviePath);
    }
    return readApiJson(response);
  }
  function validFile(file: ImportFile) {
    return !!file.path && media.value.some(item => item.id === file.mediaId)
      && qualities.value.some(item => item.id === file.qualityId)
      && (type.value === 'movies' || (!!file.episodeIds.length && file.episodeIds.every(id =>
        episodes.value[file.mediaId!]?.some(episode => episode.id === id))));
  }
  async function verifyImportAvailable(active: NonNullable<typeof context>) {
    const verificationController = controller;
    const timeout = setTimeout(() => verificationController?.abort(), 15000);
    try {
      if (!controller || !current(active)) throw new Error('Import context changed');
      const queue = await readRemovalQueue(active.config, controller.signal);
      if (!current(active)) throw new Error('Import context changed');
      const id = active.download.downloadId!.trim().toLowerCase();
      const records = queue.filter(record => typeof record.downloadId === 'string' && record.downloadId.trim().toLowerCase() === id);
      if (!records.length) throw new Error('Download no longer available');
      for (const record of records) {
        // ImportPending alone is not an active command; it also follows unsuccessful automatic attempts.
        const reason = String(record.trackedDownloadState).toLowerCase() === 'importpending'
          ? null : queueImportBlock(record.trackedDownloadState);
        if (reason) throw new ImportProtectionError(`${reason}. No new import was requested.`);
        if (!canManualImport({ title: active.download.title, downloadId: id,
          status: typeof record.status === 'string' ? record.status : undefined,
          trackedDownloadState: typeof record.trackedDownloadState === 'string' ? record.trackedDownloadState : undefined })) throw new Error('Download is not importable');
      }
      const reason = commandImportBlock(await request(active, 'command'), id);
      if (reason) throw new ImportProtectionError(`${reason}. No new import was requested.`);
      if (!current(active)) throw new Error('Import context changed');
    } catch (cause) {
      throw cause instanceof ImportProtectionError ? cause : new ImportProtectionError('Import status unavailable. No new import was requested.');
    } finally {
      clearTimeout(timeout);
    }
  }
  function close() {
    controller?.abort();
    controller = null;
    context = null;
    dialog.value = false;
    confirming.value = false;
    loading.value = false;
    busy.value = false;
  }
  function resetForm() {
    // Keep the final status visible during the closing transition.
    files.value = [];
    media.value = [];
    qualities.value = [];
    languages.value = [];
    episodes.value = {};
    loadingEpisodes.value = {};
    loading.value = false;
    busy.value = false;
    commandId.value = null;
    commandState.value = '';
    trackingKey = '';
    submissionAttempted.value = false;
    error.value = '';
    parsingFailureSelection.value = '';
    manualReview.value = false;
  }
  async function loadEpisodes(seriesId: number) {
    const active = context;
    if (!active || !current(active) || episodes.value[seriesId] || loadingEpisodes.value[seriesId]) return;
    loadingEpisodes.value[seriesId] = true;
    try {
      const data = requireList<Episode>(await request(active, `episode?seriesId=${seriesId}`), 'episodes');
      if (current(active)) episodes.value[seriesId] = data;
    } catch {
      if (current(active)) error.value = 'Unable to load episodes. Reopen the import to try again.';
    } finally {
      if (current(active)) loadingEpisodes.value[seriesId] = false;
    }
  }
  async function open(mediaType: MediaType, download: ImportDownload) {
    close();
    resetForm();
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
    const running = findRunningImport(mediaType, config, download.downloadId!);
    if (running) {
      trackingKey = running.key;
      commandId.value = running.commandId;
      commandState.value = running.status;
      return;
    }
    loading.value = true;
    try {
      await verifyImportAvailable(active);
      // Sonarr's seriesId query scans the library instead of the download directory.
      const params = new URLSearchParams({ downloadId: download.downloadId!, filterExistingFiles: 'true' });
      if (download.outputPath) params.set('folder', download.outputPath);
      const [candidates, library, definitions, languageData] = await Promise.all([
        request(active, `manualimport?${params}`),
        request(active, mediaType === 'movies' ? 'movie' : 'series'),
        request(active, 'qualitydefinition'),
        request(active, 'language'),
      ]);
      const importFiles = requireList<ImportFile>(candidates, 'import files');
      for (const file of importFiles) {
        optionalList(file.languages, 'import languages');
        optionalList(file.rejections, 'import rejections');
      }
      const importMedia = requireList<Media>(library, 'import media');
      const qualityDefinitions = requireList<{ quality: Quality }>(definitions, 'quality definitions');
      const availableLanguages = requireList<Language>(languageData, 'languages', ['name']);
      if (availableLanguages.some(language => !Number.isInteger(language.id))) throw new Error('Invalid languages.');
      if (!current(active)) return;
      media.value = importMedia;
      qualities.value = qualityDefinitions.map(definition => definition.quality).filter(quality => quality?.id > 0);
      languages.value = availableLanguages.filter(language => language.id > 0);
      files.value = importFiles.filter(file => typeof file.path === 'string' && file.path.length > 0).map(file => ({
        ...file, mediaId: (mediaType === 'movies' ? file.movie?.id : file.series?.id) ?? null,
        qualityId: file.quality?.quality?.id ?? null,
        episodeIds: optionalList<Episode>(file.episodes, 'import episodes').map(episode => episode.id), selected: false,
      }));
      if (mediaType === 'series') await Promise.all([...new Set(files.value.map(file => file.mediaId).filter((id): id is number => id !== null))].map(loadEpisodes));
    } catch (cause) {
      if (current(active)) error.value = cause instanceof ImportProtectionError ? cause.message : 'Unable to inspect this download. Check the service and download path, then reopen the import.';
    } finally {
      if (current(active)) loading.value = false;
    }
  }
  function payload(file: ImportFile) {
    const revision = file.quality?.revision;
    return {
      id: file.id, path: file.path, folderName: file.folderName,
      downloadId: context!.download.downloadId,
      quality: { ...file.quality, quality: qualities.value.find(quality => quality.id === file.qualityId), revision: {
        version: typeof revision?.version === 'number' && Number.isInteger(revision.version) && revision.version > 0 ? revision.version : 1,
        real: typeof revision?.real === 'number' && Number.isInteger(revision.real) && revision.real >= 0 ? revision.real : 0,
        isRepack: revision?.isRepack === true || revision?.isRepack === 1,
      } },
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
    parsingFailureSelection.value = '';
    manualReview.value = false;
    const selection = selected.value.map(payload);
    try {
      const result = requireList<ImportFile>(await request(active, 'manualimport', selection), 'import review');
      if (!current(active)) return;
      if (result.length !== selection.length) throw new Error('Invalid review response.');
      for (const file of selected.value) {
        const updated = result.find((item: ImportFile) => item.path === file.path);
        if (!updated) throw new Error('Missing reviewed file.');
        file.rejections = optionalList(updated.rejections, 'import rejections');
        optionalList(updated.languages, 'import languages');
        file.languages = updated.languages ?? file.languages;
        file.quality = updated.quality ?? file.quality;
      }
      reviewed = selected.value.map(payload);
      confirming.value = true;
    } catch (cause) {
      if (current(active)) {
        if (cause instanceof ImportRequestError && selection.length === 1
          && cause.unparsedMoviePath === selection[0]!.path) {
          parsingFailureSelection.value = JSON.stringify(selection);
          error.value = 'Radarr could not parse this filename. No import was requested.';
        } else error.value = cause instanceof ImportRequestError
          ? `Unable to review the selected files (HTTP ${cause.status}). Check the media, quality and languages. No import was requested.`
          : 'Unable to review the selected files. No import was requested.';
      }
    } finally {
      if (current(active)) busy.value = false;
    }
  }
  function continueManually() {
    if (!canContinueManually.value || busy.value || commandId.value !== null) return;
    reviewed = selected.value.map(payload);
    manualReview.value = true;
    error.value = '';
    confirming.value = true;
  }
  async function submit(): Promise<boolean> {
    const active = context;
    if (!active || !current(active) || busy.value || !confirming.value || !canReview.value || commandId.value !== null) return false;
    busy.value = true;
    error.value = '';
    try {
      if (JSON.stringify(selected.value.map(payload)) !== JSON.stringify(reviewed)) throw new Error('Selection changed. Review it again before importing.');
      if (manualReview.value && !canContinueManually.value) throw new Error('Selection changed. Review it again before importing.');
      await verifyImportAvailable(active);
      if (!current(active)) return false;
      submissionAttempted.value = true;
      const command = requireObject<{ id: number; status?: string; result?: string }>(await request(active, 'command', { name: 'ManualImport', files: reviewed, importMode: 'auto' }), 'import command');
      if (!current(active)) return false;
      if (!Number.isInteger(command.id) || command.id <= 0) throw new Error('Invalid import command response.');
      commandId.value = command.id;
      const tracked = rememberImport(active.type, active.config, active.download.downloadId!, active.download.title, command);
      trackingKey = tracked.key;
      commandState.value = tracked.status;
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
      const command = await checkTrackedImport(trackingKey, active.config);
      if (!current(active)) return false;
      if (!command || command.error) throw new Error('Invalid command status.');
      commandState.value = command.status;
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
  return { dialog, confirming, type, title, files, media, qualities, languages, episodes, loadingEpisodes, loading, busy, error,
    commandId, commandState, selected, canReview, canContinueManually, manualReview, continueManually, open, close, loadEpisodes, review, submit, checkStatus };
}
