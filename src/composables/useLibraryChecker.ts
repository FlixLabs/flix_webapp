import { ref } from 'vue';

export function useLibraryChecker(type, items, showErrorAlert) {
  const BASE_URLS = {
    movies: import.meta.env.VITE_RADARR_BASE_URL,
    series: import.meta.env.VITE_SONARR_BASE_URL,
  };

  const API_KEYS = {
    movies: import.meta.env.VITE_RADARR_API_KEY,
    series: import.meta.env.VITE_SONARR_API_KEY,
  };

  const URL_TYPES = {
    movies: 'movie',
    series: 'series',
  };

  const ID_KEYS = {
    movies: 'tmdbId',
    series: 'tvdbId',
  };

  const isAlreadyInLibrary = () => {
    const base_url = BASE_URLS[type];
    const api_key = API_KEYS[type];
    const url_type = URL_TYPES[type];

    fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
      .then(async (response) => {
        const json_data = await response.json();
        const id_key = ID_KEYS[type];

        if (items.value.length > 0 && id_key) {
          markAsAlreadyInLibrary(items.value, json_data, id_key);
        }
      })
      .catch((error) => {
        showErrorAlert(error);
      });
  };

  const markAsAlreadyInLibrary = (array_items, json_data, id_key) => {
    for (let item of array_items) {
      for (let compare_item of json_data) {
        if (item.id == compare_item[id_key]) {
          item.internalId = compare_item.id;
          item.already_in_library = true;
        }
      }
    }
  };

  return {
    isAlreadyInLibrary,
  };
}
