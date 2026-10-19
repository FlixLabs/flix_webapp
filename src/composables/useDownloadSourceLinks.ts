import { onScopeDispose, watch } from 'vue';
import { readApiJson, requireList, requireObject } from './apiResponse';
import { releaseSourceUrl } from './useReleaseSearch';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';

export interface DownloadSourceRecord { downloadId?: unknown; infoUrl?: unknown; data?: unknown }

export function downloadSourceUrl(record: DownloadSourceRecord): string | undefined {
  const data = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {};
  const value = Object.entries(data).find(([key]) => key.toLowerCase() === 'nzbinfourl')?.[1];
  return releaseSourceUrl({ infoUrl: typeof record.infoUrl === 'string' ? record.infoUrl : undefined })
    ?? releaseSourceUrl({ infoUrl: typeof value === 'string' ? value : undefined });
}

export function useDownloadSourceLinks(options: MediaServiceOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const cache = new Map<string, { expires: number; result: Promise<string | undefined> }>();
  const controllers = new Set<AbortController>();
  function reset() {
    controllers.forEach(controller => controller.abort());
    controllers.clear();
    cache.clear();
  }
  watch(serviceContext, reset, { flush: 'sync' });
  onScopeDispose(reset);

  function resolve(type: MediaType, record: DownloadSourceRecord): Promise<string | undefined> {
    const direct = downloadSourceUrl(record);
    if (direct) return Promise.resolve(direct);
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
    const entry = { expires: Date.now() + 60000, result: Promise.resolve<string | undefined>(undefined) };
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
          if (item.downloadId !== id || item.eventType !== 'grabbed') continue;
          const url = downloadSourceUrl(item);
          if (url) return url;
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
  return { resolve };
}
