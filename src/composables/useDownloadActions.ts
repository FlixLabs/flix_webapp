import { ref, watch, getCurrentScope, onScopeDispose } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { queueImportBlock, commandImportBlock, readRemovalQueue } from './queueImportProtection';
import { readApiJson } from './apiResponse';

interface DownloadActionsOptions extends MediaServiceOptions {
  showSuccessAlert: (message: string) => void;
  showErrorAlert: (message: string) => void;
  refreshDownloads: (type: MediaType) => void;
}

export function useDownloadActions(options: DownloadActionsOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const isRemoving = ref(false);
  let controller: AbortController | undefined;
  watch(serviceContext, () => controller?.abort(), { flush: 'sync' });
  if (getCurrentScope()) onScopeDispose(() => controller?.abort());

  async function removeDownload(type: MediaType, item: { id?: number; title: string; downloadId?: unknown }) {
    if (isRemoving.value) return;
    const { base_url, api_key } = getConfig(type);
    // Queue IDs are service-generated integers, not movie or series IDs.
    if (!Number.isInteger(item.id) || !base_url || !api_key) {
      options.showErrorAlert('Unable to remove this download: missing queue ID or service configuration.');
      return;
    }

    isRemoving.value = true;
    const context = serviceContext();
    const abort = new AbortController();
    controller = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    let requested = false;
    try {
      const downloadId = typeof item.downloadId === 'string' ? item.downloadId.trim().toLowerCase() : '';
      if (!downloadId) throw new Error('Import status unavailable');
      let found = false;
      for (const serviceType of ['movies', 'series'] as const) {
        const config = { ...getConfig(serviceType) };
        if (!config.base_url || !config.api_key || abort.signal.aborted || context !== serviceContext()) throw new Error('Import status unavailable');
        const queue = await readRemovalQueue(config, abort.signal);
        for (const record of queue) {
          if (serviceType === type && record.id === item.id) {
            if (typeof record.downloadId !== 'string' || record.downloadId.trim().toLowerCase() !== downloadId) throw new Error('Import status unavailable');
            found = true;
          }
          if (typeof record.downloadId !== 'string' || !record.downloadId.trim()) throw new Error('Import status unavailable');
          if (record.downloadId.trim().toLowerCase() === downloadId) {
            const reason = queueImportBlock(record.trackedDownloadState);
            if (reason) throw new Error(reason);
          }
        }
        if (abort.signal.aborted || context !== serviceContext()) throw new Error('Import status unavailable');
        const response = await fetch(`${config.base_url}/api/v3/command`, { headers: { 'X-Api-Key': config.api_key }, signal: abort.signal, cache: 'no-store', redirect: 'error' });
        const reason = commandImportBlock(await readApiJson(response), downloadId);
        if (reason) throw new Error(reason);
      }
      if (!found || abort.signal.aborted || context !== serviceContext()) throw new Error('Import status unavailable');
      requested = true;
      const response = await fetch(
        `${base_url}/api/v3/queue/${item.id}?removeFromClient=true&blocklist=false&skipRedownload=true`,
        { method: 'DELETE', headers: { 'X-Api-Key': api_key }, signal: abort.signal },
      );
      if (!response.ok) throw new Error('Download removal failed');
      if (context !== serviceContext()) return;
      options.showSuccessAlert(`Download removed: ${item.title}`);
      options.refreshDownloads(type);
    } catch (cause) {
      if (context !== serviceContext()) return;
      options.showErrorAlert(requested ? `Unable to remove download: ${item.title}`
        : `${cause instanceof Error && ['Import in progress', 'Import queued'].includes(cause.message) ? cause.message : 'Import status unavailable'}. Removal is blocked, including forced removal.`);
    } finally {
      clearTimeout(timer);
      if (controller === abort) controller = undefined;
      isRemoving.value = false;
    }
  }

  return { isRemoving, removeDownload };
}
