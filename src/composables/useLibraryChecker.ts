import { mediaFileFields } from '@/composables/mediaFileDetails';
import { monitoringFields } from './useMediaMonitoring';
import { computed, getCurrentScope, onScopeDispose, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import type { Ref } from 'vue';
import { useMediaService } from '@/composables/useMediaService';
import { requireList } from '@/composables/apiResponse';
import { sharedRead } from './sharedRead';
import { useReadRequest } from './useReadRequest';

export function useLibraryChecker(
  type: 'movies' | 'series',
  items: Ref<any[]>,
  showErrorAlert: (msg: any) => void,
  useAPI: Ref<boolean>
) {
  const store = useFlixStore();
  const selectedInstanceData = computed(() => store.selectedInstanceData);

  const { getConfig, serviceContext } = useMediaService({ useAPI, selectedInstanceData });
  const readRequest = useReadRequest(() => [serviceContext(), items.value]);
  let context = 0;
  let disposed = false;
  if (getCurrentScope()) {
    watch(serviceContext, () => { context++; }, { flush: 'sync' });
    onScopeDispose(() => { disposed = true; });
  }

  const URL_TYPES = {
    movies: 'movie',
    series: 'series',
  };

  const isAlreadyInLibrary = () => {
    const { base_url, api_key } = getConfig(type);
    const target = items.value;
    const instanceName = selectedInstanceData.value?.name;
    const apiMode = useAPI.value;
    const current = context;
    const active = () => {
      const config = getConfig(type);
      return !disposed && current === context && items.value === target
        && selectedInstanceData.value?.name === instanceName && useAPI.value === apiMode
        && config.base_url === base_url && config.api_key === api_key;
    };
    if (!target.length || !base_url || !api_key) return Promise.resolve();
    const read = readRequest.begin();

    const url_type = URL_TYPES[type];

    return sharedRead(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
      .then((response) => {
        if (!active() || !read.isCurrent()) return;
        const json_data = requireList(response, 'library');
        if (json_data.some(item => !Number.isSafeInteger(item.id) || Number(item.id) <= 0)) throw new Error('Invalid library response. Please try again.');

        if (items.value.length > 0) {
          markAsAlreadyInLibrary(target, json_data);
        }
        read.success();
      })
      .catch((error) => {
        if (active() && read.isCurrent()) {
          read.fail(error);
          showErrorAlert(error instanceof Error ? error.message : 'Unable to check the library.');
        }
      }).finally(read.finish);
  };

  const markAsAlreadyInLibrary = (array_items: any[], json_data: any[]) => {
    const byTmdbId = new Map(json_data.filter(item =>
      Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0
    ).map(item => [item.tmdbId, item]));
    const byTvdbId = new Map(json_data.filter(item => Number.isSafeInteger(item.tvdbId) && item.tvdbId > 0).map(item => [item.tvdbId, item]));
    for (let item of array_items) {
      const compare_item = byTmdbId.get(item.tmdbId) ?? (type === 'series' ? byTvdbId.get(item.tvdbId) : undefined);
      if (!compare_item) {
        item.already_in_library = false;
        item.hasFile = false;
        for (const field of ['id', 'relativePath', 'sizeOnDisk', 'fileDetails', 'quality', 'statistics']) delete item[field];
        Object.assign(item, monitoringFields({}));
        continue;
      }
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
      if (typeof compare_item.hasFile === 'boolean') {
        item.hasFile = compare_item.hasFile;
      }
      if (compare_item.status) {
        item.status = compare_item.status;
      }
      for (const field of ['relativePath', 'sizeOnDisk', 'fileDetails', 'quality']) delete item[field];
      if (compare_item.movieFile) {
        Object.assign(item, mediaFileFields(compare_item.movieFile));

        if (compare_item.movieFile.mediaInfo) {
          item.runTime = compare_item.movieFile.mediaInfo.runTime;
        }
      }
      delete item.statistics;
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
    readState: readRequest.state,
  };
}
