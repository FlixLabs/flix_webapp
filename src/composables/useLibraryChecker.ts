import { mediaFileFields } from '@/composables/mediaFileDetails';
import { monitoringFields } from './useMediaMonitoring';
import { computed, getCurrentScope, onScopeDispose, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import type { Ref } from 'vue';
import { useMediaService } from '@/composables/useMediaService';
import { requireList } from '@/composables/apiResponse';
import { sharedRead } from './sharedRead';

export function useLibraryChecker(
  type: 'movies' | 'series',
  items: Ref<any[]>,
  showErrorAlert: (msg: any) => void,
  useAPI: Ref<boolean>
) {
  const store = useFlixStore();
  const selectedInstanceData = computed(() => store.selectedInstanceData);

  const { getConfig } = useMediaService({ useAPI, selectedInstanceData });
  let context = 0;
  let disposed = false;
  if (getCurrentScope()) {
    watch(() => [useAPI.value, selectedInstanceData.value], () => { context++; }, { flush: 'sync', deep: true });
    onScopeDispose(() => { disposed = true; });
  }

  const URL_TYPES = {
    movies: 'movie',
    series: 'series',
  };

  const isAlreadyInLibrary = () => {
    const { base_url, api_key } = getConfig(type);
    const target = items.value;
    const instance = selectedInstanceData.value;
    const apiMode = useAPI.value;
    const current = context;
    const active = () => {
      const config = getConfig(type);
      return !disposed && current === context && items.value === target
        && selectedInstanceData.value === instance && useAPI.value === apiMode
        && config.base_url === base_url && config.api_key === api_key;
    };
    if (!target.length || !base_url || !api_key) return Promise.resolve();

    const url_type = URL_TYPES[type];

    return sharedRead(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
      .then((response) => {
        if (!active()) return;
        const json_data = requireList(response, 'library');

        if (items.value.length > 0) {
          markAsAlreadyInLibrary(target, json_data);
        }
      })
      .catch((error) => {
        if (active()) showErrorAlert(error instanceof Error ? error.message : 'Unable to check the library.');
      });
  };

  const markAsAlreadyInLibrary = (array_items: any[], json_data: any[]) => {
    const byTmdbId = new Map(json_data.filter(item =>
      Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0
    ).map(item => [item.tmdbId, item]));
    for (let item of array_items) {
      const compare_item = byTmdbId.get(item.tmdbId);
      if (!compare_item) continue;
      item.already_in_library = true;
      item.id = compare_item.id;
      if (compare_item.tvdbId) {
        item.tvdbId = compare_item.tvdbId;
      }
      if (compare_item.certification) {
        item.certification = compare_item.certification;
      }
      if (compare_item.year) {
        item.year = compare_item.year;
      }
      if (compare_item.runtime) {
        item.runTime = compare_item.runtime;
      }
      if (compare_item.hasFile) {
        item.hasFile = compare_item.hasFile;
      }
      if (compare_item.status) {
        item.status = compare_item.status;
      }
      if (compare_item.movieFile) {
        Object.assign(item, mediaFileFields(compare_item.movieFile));

        if (compare_item.movieFile.mediaInfo) {
          item.runTime = compare_item.movieFile.mediaInfo.runTime;
        }
      }
      if (compare_item.statistics) {
        item.statistics = compare_item.statistics;
      }
      if (compare_item.qualityProfileId) {
        item.selected_quality = compare_item.qualityProfileId;
      }
      Object.assign(item, monitoringFields(compare_item));
    }
  };

  return {
    isAlreadyInLibrary,
  };
}
