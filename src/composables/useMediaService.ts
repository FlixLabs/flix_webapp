import type { Ref } from "vue";

export type MediaType = "movies" | "series";

export interface MediaServiceConfig {
  base_url: string;
  api_key: string;
  root_folder_path: string;
}

export interface MediaInstance {
  name: string;
  radarr: MediaServiceConfig;
  sonarr: MediaServiceConfig;
}

export interface MediaServiceOptions {
  useAPI: Ref<boolean>;
  selectedInstanceData: Ref<MediaInstance | null>;
}

export function useMediaService(options: MediaServiceOptions) {
  function getConfig(type: MediaType): MediaServiceConfig {
    if (options.useAPI.value) {
      const config =
        options.selectedInstanceData.value?.[
          type === "movies" ? "radarr" : "sonarr"
        ];
      return config ?? { base_url: "", api_key: "", root_folder_path: "" };
    }

    return type === "movies"
      ? {
          base_url: import.meta.env.VITE_RADARR_BASE_URL,
          api_key: import.meta.env.VITE_RADARR_API_KEY,
          root_folder_path: import.meta.env.VITE_RADARR_ROOT_FOLDER_PATH,
        }
      : {
          base_url: import.meta.env.VITE_SONARR_BASE_URL,
          api_key: import.meta.env.VITE_SONARR_API_KEY,
          root_folder_path: import.meta.env.VITE_SONARR_ROOT_FOLDER_PATH,
        };
  }

  return { getConfig };
}
