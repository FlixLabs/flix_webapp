import { computed } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import type { Ref } from 'vue';
import { useMediaService } from '@/composables/useMediaService';

export function useLibraryChecker(
  type: 'movies' | 'series',
  items: Ref<any[]>,
  showErrorAlert: (msg: any) => void,
  useAPI: Ref<boolean>
) {
  const store = useFlixStore();
  const selectedInstanceData = computed(() => store.selectedInstanceData);

  const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

  const URL_TYPES = {
    movies: 'movie',
    series: 'series',
  };

  const isAlreadyInLibrary = () => {
    const { base_url, api_key } = getConfig(type);

    const url_type = URL_TYPES[type];

    fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
      .then(async (response) => {
        const json_data: any[] = await response.json();

        if (items.value.length > 0) {
          markAsAlreadyInLibrary(items.value, json_data);
        }
      })
      .catch((error) => {
        showErrorAlert(error);
      });
  };

  const markAsAlreadyInLibrary = (array_items: any[], json_data: any[]) => {
    for (let item of array_items) {
      for (let compare_item of json_data) {
        if (item.tmdbId !== 0 && item.tmdbId === compare_item.tmdbId) {
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
            item.relativePath = compare_item.movieFile.relativePath;

            if (compare_item.movieFile.mediaInfo) {
              item.runTime = compare_item.movieFile.mediaInfo.runTime;
            }

            if (compare_item.movieFile.quality) {
              item.quality = compare_item.movieFile.quality.quality.name;
            }
          }
          if (compare_item.statistics) {
            item.statistics = compare_item.statistics;
          }
          if (compare_item.qualityProfileId) {
            item.selected_quality = compare_item.qualityProfileId;
          }
          if (compare_item.monitored) {
            item.monitored = compare_item.monitored;
          }
        }
      }
    }
  };

  return {
    isAlreadyInLibrary,
  };
}
