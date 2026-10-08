import { shallowReactive, watch, onScopeDispose } from 'vue';
import type { Ref } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { useMediaActions, type MediaActionItem } from './useMediaActions';

interface DashboardItem extends MediaActionItem {
  selected_quality?: number;
}
interface Options extends MediaServiceOptions {
  movies: Ref<DashboardItem[]>;
  series: Ref<DashboardItem[]>;
  showSuccessAlert: (message: string) => void;
  showErrorAlert: (message: string) => void;
}

export function useDashboardActions(options: Options) {
  const pending = shallowReactive(new Set<string>());
  const { getConfig } = useMediaService(options);
  const actions = useMediaActions({ ...options, refreshContent: () => {} });
  let context = 0;
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], () => context++, { flush: 'sync', deep: true });
  onScopeDispose(() => context++);

  function identity(type: MediaType, item: DashboardItem) {
    return type === 'movies' ? item.tmdbId : item.tvdbId;
  }
  function key(type: MediaType, item: DashboardItem) {
    const config = getConfig(type);
    return JSON.stringify([context, config.base_url, type, identity(type, item) ?? item.id]);
  }
  function isPending(type: MediaType, item: DashboardItem) {
    return pending.has(key(type, item));
  }

  async function run(type: MediaType, item: DashboardItem, remove: boolean) {
    const requestKey = key(type, item);
    if (pending.has(requestKey)) return;
    const currentContext = context;
    pending.add(requestKey);
    try {
      const response = remove
        ? await actions.deleteItem(type, item)
        : await actions.addItem(type, { ...item, qualityProfileId: item.selected_quality });
      if (!response || currentContext !== context) return;
      const created = remove ? null : await response.json();
      if (currentContext !== context) return;
      if (!remove && (!Number.isInteger(created?.id) || created.id <= 0)) {
        throw new Error('Missing media ID');
      }
      // Update matching results only, including results from a newer search.
      const id = identity(type, item);
      for (const result of options[type].value) {
        if (result !== item && (!id || identity(type, result) !== id)) continue;
        result.already_in_library = !remove;
        result.id = remove ? undefined : created.id;
      }
    } catch {
      options.showErrorAlert('Added, but the service response could not be read. Search again to refresh.');
    } finally {
      pending.delete(requestKey);
    }
  }

  return {
    isPending,
    addItem: (type: MediaType, item: DashboardItem) => run(type, item, false),
    deleteItem: (type: MediaType, item: DashboardItem) => run(type, item, true),
  };
}
