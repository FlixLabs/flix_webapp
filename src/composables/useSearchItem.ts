import type { Ref } from 'vue';

interface SearchItemOptions {
  useAPI: Ref<boolean>;
  selectedInstanceData: any;
  showSuccessAlert: (msg: string) => void;
  showErrorAlert: (msg: string) => void;
  refreshContent: (type: 'movies' | 'series') => void;
}

export function useSearchItem(options: SearchItemOptions) {
  const searchItem = (type: 'movies' | 'series', item: any) => {
    let base_url = '';
    let api_key = '';
    let data: any = {};

    if (type === 'movies') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_RADARR_BASE_URL;
        api_key = import.meta.env.VITE_RADARR_API_KEY;
      } else {
        base_url = options.selectedInstanceData.value.radarr.base_url;
        api_key = options.selectedInstanceData.value.radarr.api_key;
      }
      data = {
        name: "MoviesSearch",
        movieIds: [item.id]
      }
    }

    if (type === 'series') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_SONARR_BASE_URL;
        api_key = import.meta.env.VITE_SONARR_API_KEY;
      } else {
        base_url = options.selectedInstanceData.value.sonarr.base_url;
        api_key = options.selectedInstanceData.value.sonarr.api_key;
      }
      data = {
        name: "SeriesSearch",
        seriesId: item.id
      }
    }

    fetch(base_url + '/api/v3/command', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8',
        'X-Api-Key': api_key
      },
      body: JSON.stringify(data)
    })
    .then(async response => {
      if (response.ok) {
        options.showSuccessAlert("Start search successfully");
        options.refreshContent(type);
      }
    })
    .catch(error => {
      console.log(error);
      options.showErrorAlert("Search failed");
    });
  };

  return { searchItem };
}
