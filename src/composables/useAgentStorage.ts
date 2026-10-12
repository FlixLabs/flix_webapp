import { readApiJson, requireList, requireObject } from '@/composables/apiResponse';
import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { MediaInstance } from "./useMediaService";
import type { StorageLocation } from "./useStorageLocations";
import { normalizeStorageIssue, storageRequestError } from './storageDiagnostics';

type LocationId = "movies" | "series" | "downloads";
class StorageRequestError extends Error {}
interface AgentLocation {
  id: LocationId;
  path: string;
  available: boolean;
  volumeId?: string;
  totalBytes?: number;
  availableBytes?: number;
  usagePercent?: number;
  code?: string;
}

export function useAgentStorage(options: {
  useAPI: Ref<boolean>;
  selectedInstanceData: Ref<MediaInstance | null>;
  interval: Ref<number>;
}) {
  const enabled = computed(() => options.useAPI.value && !!options.selectedInstanceData.value?.has_storage_agent);
  const records = ref<AgentLocation[]>([]);
  const loading = ref(false);
  const error = ref("");
  const collectedAt = ref("");
  const lastSuccessAt = ref('');
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh() {
    if (!enabled.value || !options.selectedInstanceData.value) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = "";
    try {
      const name = encodeURIComponent(options.selectedInstanceData.value.name);
      const response = await fetch(`${import.meta.env.VITE_FLIX_API_URL}/storage/${name}`, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
        cache: "no-store",
      });
      if (!response.ok) {
        let code: unknown;
        try { code = (await response.json())?.code; } catch { /* Older API versions may not provide an error body. */ }
        throw new StorageRequestError(storageRequestError(code, response.status));
      }
      const data = requireObject(await readApiJson(response), 'storage');
      requireList(data.locations, 'storage locations');
      if (!Array.isArray(data.locations) || typeof data.collectedAt !== "string"
        || data.locations.some(location => !['movies', 'series', 'downloads'].includes(location.id)
          || typeof location.path !== 'string' || typeof location.available !== 'boolean')
        || new Set(data.locations.map(location => location.id)).size !== data.locations.length) throw new Error("Invalid storage response");
      if (request.signal.aborted) return;
      records.value = data.locations;
      collectedAt.value = data.collectedAt;
      if (data.locations.some(location => location.available
        && Number.isFinite(location.totalBytes) && location.totalBytes > 0
        && Number.isFinite(location.availableBytes) && location.availableBytes >= 0 && location.availableBytes <= location.totalBytes
        && Number.isFinite(location.usagePercent) && location.usagePercent >= 0 && location.usagePercent <= 100)) {
        lastSuccessAt.value = data.collectedAt;
      }
    } catch (cause) {
      if (request.signal.aborted) return;
      records.value = [];
      collectedAt.value = "";
      error.value = cause instanceof Error && cause.message.startsWith('Invalid ')
        ? storageRequestError('AGENT_RESPONSE_INVALID')
        : cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name)
          ? storageRequestError('AGENT_TIMEOUT')
          : cause instanceof StorageRequestError ? cause.message : storageRequestError(undefined);
    } finally {
      if (controller === request) loading.value = false;
    }
  }

  watch([enabled, () => options.selectedInstanceData.value?.name], () => {
    controller?.abort();
    records.value = [];
    collectedAt.value = "";
    lastSuccessAt.value = '';
    error.value = "";
    loading.value = false;
    void refresh();
  }, { immediate: true });

  watch([enabled, options.interval], () => {
    clearInterval(timer);
    if (enabled.value && Number.isFinite(Number(options.interval.value)) && Number(options.interval.value) > 0) {
      timer = setInterval(() => void refresh(), Number(options.interval.value) * 1000);
    }
  }, { immediate: true });

  onScopeDispose(() => { controller?.abort(); clearInterval(timer); });

  function locations(id: LocationId): StorageLocation[] {
    const selected = records.value.filter(record => record.id === id);
    if (!selected.length && enabled.value && collectedAt.value && !error.value) {
      return [{ path: '', accessible: false, free: null, total: null, ratio: null, issue: 'MEASUREMENT_MISSING' }];
    }
    return selected.map(record => {
      const metrics = [record.availableBytes, record.totalBytes, record.usagePercent];
      const missing = metrics.some(value => value == null);
      const invalid = !missing && (metrics.some(value => !Number.isFinite(value))
        || record.availableBytes! < 0 || record.totalBytes! <= 0 || record.availableBytes! > record.totalBytes!
        || record.usagePercent! < 0 || record.usagePercent! > 100);
      const accessible = record.available && !invalid;
      return {
        path: record.path,
        accessible,
        free: accessible && Number.isFinite(record.availableBytes) && record.availableBytes! >= 0 ? record.availableBytes! / 1024 ** 3 : null,
        total: accessible && Number.isFinite(record.totalBytes) && record.totalBytes! > 0 ? record.totalBytes! / 1024 ** 3 : null,
        ratio: accessible && Number.isFinite(record.usagePercent) && record.usagePercent! >= 0 && record.usagePercent! <= 100 ? record.usagePercent! : null,
        issue: !record.available ? normalizeStorageIssue(record.code)
          : invalid ? 'INVALID_METRICS' as const : missing ? 'MEASUREMENT_MISSING' as const : undefined,
        sharedWith: accessible && record.volumeId
          ? records.value.filter(other => other.id !== id && other.available && other.volumeId === record.volumeId).map(other => other.id)
          : [],
      };
    });
  }

  return { enabled, loading, error, collectedAt, lastSuccessAt, locations, refresh };
}
