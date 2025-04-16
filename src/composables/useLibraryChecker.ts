import { computed } from 'vue';
import { useFlixStore } from '@/stores/flixStore';

export function useLibraryChecker(type, items, showErrorAlert, useAPI) {
  const store = useFlixStore();
  const selectedInstanceData = computed(() => store.selectedInstanceData);

  const URL_TYPES = {
    movies: 'movie',
    series: 'series',
  };

  const isAlreadyInLibrary = () => {
    let base_url = null;
    let api_key = null;

    if (type == 'movies') {
      if (!useAPI.value) {
        base_url = import.meta.env.VITE_RADARR_BASE_URL;
        api_key = import.meta.env.VITE_RADARR_API_KEY;
      } else {
        base_url = selectedInstanceData.value.radarr.base_url;
        api_key = selectedInstanceData.value.radarr.api_key;
      }
    }

    if (type =='series') {
      if (!useAPI.value) {
        base_url = import.meta.env.VITE_SONARR_BASE_URL;
        api_key = import.meta.env.VITE_SONARR_API_KEY;
      } else {
        base_url = selectedInstanceData.value.sonarr.base_url;
        api_key = selectedInstanceData.value.sonarr.api_key;
      }
    }

    const url_type = URL_TYPES[type];

    fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
      .then(async (response) => {
        const json_data = await response.json();

        if (items.value.length > 0) {
          markAsAlreadyInLibrary(items.value, json_data);
        }
      })
      .catch((error) => {
        showErrorAlert(error);
      });
  };

  const markAsAlreadyInLibrary = (array_items, json_data) => {
    for (let item of array_items) {
      for (let compare_item of json_data) {
        if (item.tmdbId == compare_item.tmdbId) {
          item.already_in_library = true;
          item.id = compare_item.id;
          if (compare_item.tvdbId) {
            item.tvdbId = compare_item.tvdbId;
          }
          if (compare_item.hasFile) {
            item.hasFile = compare_item.hasFile;
          }
          if (compare_item.status) {
            item.status = compare_item.status;
          }
          if (compare_item.movieFile) {
            item.relativePath = compare_item.movieFile.relativePath;
          }
          if (compare_item.statistics) {
            item.statistics = compare_item.statistics;
          }
        }
      }
    }
  };

  return {
    isAlreadyInLibrary,
  };
}
