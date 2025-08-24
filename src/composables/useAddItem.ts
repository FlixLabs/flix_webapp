import type { Ref } from 'vue';

interface AddItemOptions {
  useAPI: Ref<boolean>;
  selectedInstanceData: any;
  showSuccessAlert: (msg: string) => void;
  showErrorAlert: (msg: string) => void;
  refreshContent: (type: 'movies' | 'series') => void;
}

export function useAddItem(options: AddItemOptions) {
  const addItem = (type: 'movies' | 'series', item: any) => {
    let base_url = '';
    let api_key = '';
    let root_folder_path = '';
    let url_type: 'movie' | 'series' | '' = '';
    let data: any = {};

    if (type === 'movies') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_RADARR_BASE_URL;
        api_key = import.meta.env.VITE_RADARR_API_KEY;
        root_folder_path = import.meta.env.VITE_RADARR_ROOT_FOLDER_PATH;
      } else {
        base_url = options.selectedInstanceData.value.radarr.base_url;
        api_key = options.selectedInstanceData.value.radarr.api_key;
        root_folder_path = options.selectedInstanceData.value.radarr.root_folder_path;
      }
      url_type = 'movie';
      data = {
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year,
        qualityProfileId: item.qualityProfileId,
        rootFolderPath: root_folder_path,
        monitored: true,
        addOptions: {
          searchForMovie: true
        }
      }
    }

    if (type === 'series') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_SONARR_BASE_URL;
        api_key = import.meta.env.VITE_SONARR_API_KEY;
        root_folder_path = import.meta.env.VITE_SONARR_ROOT_FOLDER_PATH;
      } else {
        base_url = options.selectedInstanceData.value.sonarr.base_url;
        api_key = options.selectedInstanceData.value.sonarr.api_key;
        root_folder_path = options.selectedInstanceData.value.sonarr.root_folder_path;
      }
      url_type = 'series';
      data = {
        tvdbId: item.tvdbId,
        title: item.title,
        year: item.year,
        qualityProfileId: item.qualityProfileId,
        rootFolderPath: root_folder_path,
        monitored: true,
        addOptions: {
          searchForMissingEpisodes: true
        }
      }
    }

    fetch(base_url + '/api/v3/' + url_type, {
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
        options.showSuccessAlert("Added successfully");
        options.refreshContent(type);
      }
    })
    .catch(error => {
      options.showErrorAlert("Adding failed");
    });
  };

  return { addItem };
}
