import { ref } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';

interface DownloadActionsOptions extends MediaServiceOptions {
  showSuccessAlert: (message: string) => void;
  showErrorAlert: (message: string) => void;
  refreshDownloads: (type: MediaType) => void;
}

export function useDownloadActions(options: DownloadActionsOptions) {
  const { getConfig } = useMediaService(options);
  const isRemoving = ref(false);

  async function removeDownload(type: MediaType, item: { id?: number; title: string }) {
    if (isRemoving.value) return;
    const { base_url, api_key } = getConfig(type);
    // Queue IDs are service-generated integers, not movie or series IDs.
    if (!Number.isInteger(item.id) || !base_url || !api_key) {
      options.showErrorAlert('Unable to remove this download: missing queue ID or service configuration.');
      return;
    }

    isRemoving.value = true;
    try {
      const response = await fetch(
        `${base_url}/api/v3/queue/${item.id}?removeFromClient=true&blocklist=false&skipRedownload=true`,
        { method: 'DELETE', headers: { 'X-Api-Key': api_key } },
      );
      if (!response.ok) throw new Error('Download removal failed');
      options.showSuccessAlert(`Download removed: ${item.title}`);
      options.refreshDownloads(type);
    } catch {
      options.showErrorAlert(`Unable to remove download: ${item.title}`);
    } finally {
      isRemoving.value = false;
    }
  }

  return { isRemoving, removeDownload };
}
