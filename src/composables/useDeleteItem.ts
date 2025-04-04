import type { Ref } from 'vue';

interface DeleteItemOptions {
  useAPI: Ref<boolean>;
  selectedInstanceData: any;
  showSuccessAlert: (msg: string) => void;
  showErrorAlert: (msg: string) => void;
  refreshContent: (type: 'movies' | 'series') => void;
}

export function useDeleteItem(options: DeleteItemOptions) {
  const deleteItem = (type: 'movies' | 'series', item: any) => {
    let base_url: string;
    let api_key: string;
    let url_type: string;

    if (type === 'movies') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_RADARR_BASE_URL;
        api_key = import.meta.env.VITE_RADARR_API_KEY;
      } else {
        base_url = options.selectedInstanceData.value.radarr.base_url;
        api_key = options.selectedInstanceData.value.radarr.api_key;
      }
      url_type = 'movie';
    }

    if (type === 'series') {
      if (!options.useAPI.value) {
        base_url = import.meta.env.VITE_SONARR_BASE_URL;
        api_key = import.meta.env.VITE_SONARR_API_KEY;
      } else {
        base_url = options.selectedInstanceData.value.sonarr.base_url;
        api_key = options.selectedInstanceData.value.sonarr.api_key;
      }
      url_type = 'series';
    }

    fetch(base_url + '/api/v3/' + url_type + '/' + item.id + '?apikey=' + api_key + '&deleteFiles=true', {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8',
      },
    })
    .then(async response => {
      if (response.ok) {
        options.showSuccessAlert("Deleted successfully");
        options.refreshContent(type, true);
      }
    })
    .catch(error => {
      options.showErrorAlert("Deletion failed");
    });
  };

  return { deleteItem };
}
