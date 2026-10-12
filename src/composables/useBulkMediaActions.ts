import { onScopeDispose, ref, watch } from 'vue';
import { useMediaActions, canSearchItem, type MediaActionItem } from './useMediaActions';
import { useMediaMonitoring, type MonitoredMedia } from './useMediaMonitoring';
import type { MediaServiceOptions, MediaType } from './useMediaService';

export type BulkAction = 'monitor' | 'unmonitor' | 'search' | 'delete';
export type BulkMedia = MediaActionItem & MonitoredMedia;

export function useBulkMediaActions(options: MediaServiceOptions) {
  const pending = ref(false);
  const completed = ref(0);
  const total = ref(0);
  const stopRequested = ref(false);
  let context = 0;
  const actions = useMediaActions({ ...options, requestTimeoutMs: 15000, showSuccessAlert: () => {}, showErrorAlert: () => {}, refreshContent: () => {} });
  const monitoring = useMediaMonitoring(options);
  function reset() { context++; stopRequested.value = true; monitoring.reset(); }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], reset, { deep: true, flush: 'sync' });
  onScopeDispose(reset);

  async function run(type: MediaType, items: BulkMedia[], action: BulkAction) {
    if (pending.value) return null;
    const ids = new Set<number>();
    const snapshot = items.filter(item => {
      if (!Number.isInteger(item.id) || !item.id || item.id <= 0 || ids.has(item.id)) return false;
      ids.add(item.id); return true;
    });
    if (!snapshot.length) return null;
    const current = context;
    const result = { succeeded: [] as number[], failed: [] as number[], skipped: [] as number[], stopped: false, stale: false };
    pending.value = true; completed.value = 0; total.value = snapshot.length; stopRequested.value = false;
    try {
      for (const item of snapshot) {
        if (stopRequested.value || current !== context) break;
        if ((action === 'search' && !canSearchItem(type, item))
          || ((action === 'monitor' || action === 'unmonitor') && typeof item.monitored !== 'boolean')) {
          result.skipped.push(item.id!);
        } else {
          let success = false;
          try {
            success = action === 'monitor' || action === 'unmonitor'
              ? await monitoring.setMonitoring(type, item, action === 'monitor')
              : !!await (action === 'search' ? actions.searchItem(type, item) : actions.deleteItem(type, item));
          } catch { /* Keep processing other media after a failed request. */ }
          (success ? result.succeeded : result.failed).push(item.id!);
        }
        completed.value++;
      }
      result.stale = current !== context;
      result.stopped = completed.value < total.value;
      return result;
    } finally { pending.value = false; }
  }
  return { pending, completed, total, stopRequested, run, invalidate: reset, stop: () => { stopRequested.value = true; } };
}
