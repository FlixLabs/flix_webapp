import { apiFetch } from '@/composables/apiSession';
import { onScopeDispose, ref, watch, type Ref } from 'vue';

export interface ClientTorrent {
  id: string; name: string; state: string; progress: number; completed: boolean;
  sizeBytes: number; path: string; ratio: number | null; tracked: boolean; removable: boolean;
  removalBlockedReason?: 'Import in progress' | 'Import queued' | 'Import status unavailable' | null;
}
export interface DownloadClient {
  id: string; name: string; type: string; allowDeleteData: boolean; allowForceRemoval?: boolean; torrents: ClientTorrent[];
}
export function canRemoveClientTorrent(client: DownloadClient, item: ClientTorrent, force = false): boolean {
  return item.removalBlockedReason === null && item.completed
    && (item.tracked ? force && client.allowForceRemoval === true : item.removable);
}
export function parseDownloadClients(value: unknown): DownloadClient[] {
  const data = value as { clients?: DownloadClient[] } | null;
  if (!Array.isArray(data?.clients)) throw new Error('Invalid client response.');
  const ids = new Set<string>();
  for (const client of data.clients) {
    if (!client || typeof client.id !== 'string' || ids.has(client.id) || typeof client.name !== 'string'
      || (client.allowForceRemoval !== undefined && typeof client.allowForceRemoval !== 'boolean') || typeof client.type !== 'string' || typeof client.allowDeleteData !== 'boolean' || !Array.isArray(client.torrents)) throw new Error('Invalid client response.');
    ids.add(client.id);
    const torrents = new Set<string>();
    for (const item of client.torrents) {
      if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(item.id) || torrents.has(item.id) || typeof item.name !== 'string'
        || typeof item.state !== 'string' || typeof item.path !== 'string' || !Number.isFinite(item.sizeBytes) || item.sizeBytes < 0
        || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 100
        || (item.ratio !== null && (!Number.isFinite(item.ratio) || item.ratio < 0))
        || (item.completed && item.progress !== 100)
        || !['completed', 'tracked', 'removable'].every(key => typeof item[key as keyof ClientTorrent] === 'boolean')
        || (item.removable && (!item.completed || item.tracked))) throw new Error('Invalid torrent response.');
      if (item.removalBlockedReason === undefined) {
        item.removalBlockedReason = 'Import status unavailable';
        item.removable = false;
      }
      if (item.removalBlockedReason !== null && !['Import in progress', 'Import queued', 'Import status unavailable'].includes(item.removalBlockedReason)) throw new Error('Invalid import protection response.');
      if (item.removalBlockedReason && item.removable) throw new Error('Invalid removal protection.');
      torrents.add(item.id);
    }
  }
  return data.clients;
}

export function useDownloadClients(instance: Ref<string | null>) {
  const clients = ref<DownloadClient[]>([]);
  const loading = ref(false);
  const removing = ref(false);
  const error = ref('');
  const message = ref('');
  const uncertain = ref(false);
  let generation = 0;
  let controller: AbortController | null = null;
  const endpoint = () => `${import.meta.env.VITE_FLIX_API_URL}/download-clients/${encodeURIComponent(instance.value ?? '')}`;
  function reset() {
    generation++; controller?.abort(); controller = null;
    clients.value = []; error.value = ''; message.value = '';
    loading.value = false; removing.value = false; uncertain.value = false;
  }
  async function responseError(response: Response) {
    const data = await response.json().catch(() => null);
    return typeof data?.error === 'string' ? data.error : `Client request failed (${response.status}).`;
  }
  async function load() {
    if (loading.value || removing.value || !instance.value) return;
    const active = ++generation;
    controller?.abort(); const abort = new AbortController(); controller = abort;
    const timer = setTimeout(() => abort.abort(), 60000);
    loading.value = true; error.value = ''; clients.value = [];
    try {
      const response = await apiFetch(endpoint(), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response));
      const data = parseDownloadClients(await response.json());
      if (active !== generation) return;
      clients.value = data; uncertain.value = false;
    } catch (cause) {
      if (active === generation) error.value = cause instanceof Error ? cause.message : 'Unable to load download clients.';
    } finally { clearTimeout(timer); if (active === generation) loading.value = false; }
  }
  async function remove(client: DownloadClient, item: ClientTorrent, deleteData: boolean, force = false) {
    if (removing.value || loading.value || uncertain.value || !canRemoveClientTorrent(client, item, force) || !instance.value || (deleteData && !client.allowDeleteData)) return false;
    const active = generation;
    const abort = new AbortController(); controller = abort;
    const timer = setTimeout(() => abort.abort(), 60000);
    removing.value = true; error.value = ''; message.value = '';
    try {
      const response = await apiFetch(`${endpoint()}/${encodeURIComponent(client.id)}/${encodeURIComponent(item.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name, deleteData, ...(force ? { force: true } : {}) }), signal: abort.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (active !== generation) return false;
      client.torrents = client.torrents.filter(torrent => torrent.id !== item.id);
      message.value = deleteData ? 'Torrent removed. Data deletion requested.' : 'Torrent removed. Its data was kept.';
      return true;
    } catch (cause) {
      if (active === generation) {
        uncertain.value = true;
        error.value = `${cause instanceof Error ? cause.message : 'Removal could not be confirmed.'} Refresh before another removal. No automatic retry was made.`;
      }
      return false;
    } finally { clearTimeout(timer); if (active === generation) removing.value = false; }
  }
  watch(instance, reset, { flush: 'sync' });
  onScopeDispose(reset);
  return { clients, loading, removing, error, message, uncertain, load, remove, reset };
}
