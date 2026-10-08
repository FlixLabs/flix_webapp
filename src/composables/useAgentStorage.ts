import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { MediaInstance } from "./useMediaService";
import type { StorageLocation } from "./useStorageLocations";

type LocationId = "movies" | "series" | "downloads";
interface AgentLocation {
  id: LocationId;
  path: string;
  available: boolean;
  volumeId?: string;
  totalBytes?: number;
  availableBytes?: number;
  usagePercent?: number;
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
      if (!response.ok) throw new Error("Storage agent unavailable");
      const data = await response.json();
      if (!Array.isArray(data.locations) || typeof data.collectedAt !== "string") throw new Error("Invalid storage response");
      if (request.signal.aborted) return;
      records.value = data.locations;
      collectedAt.value = data.collectedAt;
    } catch {
      if (request.signal.aborted) return;
      records.value = [];
      collectedAt.value = "";
      error.value = "Unable to load storage measurements from the agent.";
    } finally {
      if (controller === request) loading.value = false;
    }
  }

  watch([enabled, () => options.selectedInstanceData.value?.name], () => {
    controller?.abort();
    records.value = [];
    collectedAt.value = "";
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
    return records.value.filter(record => record.id === id).map(record => ({
      path: record.path,
      accessible: record.available,
      free: record.available && record.availableBytes != null ? record.availableBytes / 1024 ** 3 : null,
      total: record.available && record.totalBytes != null ? record.totalBytes / 1024 ** 3 : null,
      ratio: record.available ? record.usagePercent ?? null : null,
      sharedWith: record.available && record.volumeId
        ? records.value.filter(other => other.id !== id && other.available && other.volumeId === record.volumeId).map(other => other.id)
        : [],
    }));
  }

  return { enabled, loading, error, collectedAt, locations, refresh };
}
