import { onScopeDispose, watch } from 'vue';
import { readApiJson, requireList, requireObject } from './apiResponse';
import { releaseSourceUrl } from './useReleaseSearch';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';

export interface DownloadSourceRecord { downloadId?: unknown; infoUrl?: unknown; data?: unknown; indexer?: unknown }
export interface DownloadSource { url?: string; indexer?: string }

export function downloadSourceIndexer(record: DownloadSourceRecord): string | undefined {
  const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {};
  const value = Object.entries(data).find(([key]) => key.toLowerCase() === 'indexer')?.[1];
  return [record.indexer, value].find(value => typeof value === 'string' && value.trim())?.toString().trim();
}

export function downloadSourceUrl(record: DownloadSourceRecord): string | undefined {
  const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {};
  const value = Object.entries(data).find(([key]) => key.toLowerCase() === 'nzbinfourl')?.[1];
  return releaseSourceUrl({ infoUrl: typeof record.infoUrl === 'string' ? record.infoUrl : undefined })
    ?? releaseSourceUrl({ infoUrl: typeof value === 'string' ? value : undefined });
}

export function useDownloadSourceLinks(options: MediaServiceOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const cache = new Map<string, { expires: number; result: Promise<DownloadSource | undefined> }>();
  const controllers = new Set<AbortController>();
  function reset() {
    controllers.forEach(controller => controller.abort());
    controllers.clear();
    cache.clear();
  }
  watch(serviceContext, reset, { flush: 'sync' });
  onScopeDispose(reset);

  function resolveInfo(type: MediaType, record: DownloadSourceRecord): Promise<DownloadSource | undefined> {
    const direct = downloadSourceUrl(record);
    if (direct) return Promise.resolve({ url: direct, indexer: downloadSourceIndexer(record) });
    const id = typeof record.downloadId === 'string' ? record.downloadId.trim() : '';
    const config = getConfig(type);
    if (!id || !config.base_url || !config.api_key) return Promise.resolve(undefined);
    const key = JSON.stringify([type, id]);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    const params = new URLSearchParams({ downloadId: id, eventType: '1', page: '1', pageSize: '20' });
    const entry = { expires: Date.now() + 60000, result: Promise.resolve<DownloadSource | undefined>(undefined) };
    entry.result = (async () => {
      try {
        const response = await fetch(`${config.base_url}/api/v3/history?${params}`, {
          headers: { 'X-Api-Key': config.api_key }, signal: controller.signal, cache: 'no-store',
        });
        const payload = requireObject(await readApiJson(response), 'download history');
        const records = requireList<Record<string, unknown>>(payload.records, 'download history');
        if (controller.signal.aborted) return;
        // Never match by title: another release of the same media may have a different source.
        for (const item of records) {
          const sameId = item.downloadId === id || (/^[a-f0-9]{40}$/i.test(id)
            && typeof item.downloadId === 'string' && item.downloadId.toLowerCase() === id.toLowerCase());
          if (!sameId || item.eventType !== 'grabbed') continue;
          const url = downloadSourceUrl(item);
          const indexer = downloadSourceIndexer(item);
          if (url || indexer) return { url, indexer };
        }
      } catch {
        // A missing source must not prevent reading or managing the download.
        entry.expires = Date.now() + 10000;
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
      }
    })();
    cache.set(key, entry);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return entry.result;
  }
  async function resolve(type: MediaType, record: DownloadSourceRecord) {
    return (await resolveInfo(type, record))?.url;
  }
  return { resolve, resolveInfo };
}
