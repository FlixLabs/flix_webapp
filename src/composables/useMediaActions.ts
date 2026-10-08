import {
  useMediaService,
  type MediaServiceOptions,
  type MediaType,
} from "@/composables/useMediaService";

export interface MediaActionItem {
  id?: number;
  tmdbId?: number;
  tvdbId?: number;
  title: string;
  year?: number;
  qualityProfileId?: number;
  status?: string;
  already_in_library?: boolean;
}

export function canSearchItem(type: MediaType, item: MediaActionItem | null): boolean {
  if (!item || typeof item.id !== "number" || !Number.isInteger(item.id) || item.id <= 0 || item.already_in_library === false) return false;
  return type === "movies" ? item.status === "released" : !!item.status && item.status !== "upcoming";
}

interface MediaActionsOptions extends MediaServiceOptions {
  showSuccessAlert: (message: string) => void;
  showErrorAlert: (message: string) => void;
  refreshContent: (type: MediaType) => void;
}

export function useMediaActions(options: MediaActionsOptions) {
  const { getConfig } = useMediaService(options);

  async function request(
    type: MediaType,
    path: string,
    method: "POST" | "DELETE",
    body: Record<string, unknown> | undefined,
    successMessage: string,
    errorMessage: string,
  ) {
    const { base_url, api_key } = getConfig(type);
    try {
      const response = await fetch(base_url + "/api/v3/" + path, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json;charset=utf-8",
          "X-Api-Key": api_key,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(errorMessage);
      options.showSuccessAlert(successMessage);
      options.refreshContent(type);
    } catch {
      options.showErrorAlert(errorMessage);
    }
  }

  function addItem(type: MediaType, item: MediaActionItem) {
    const { root_folder_path } = getConfig(type);
    return request(
      type,
      type === "movies" ? "movie" : "series",
      "POST",
      {
        ...(type === "movies"
          ? { tmdbId: item.tmdbId }
          : { tvdbId: item.tvdbId }),
        title: item.title,
        year: item.year,
        qualityProfileId: item.qualityProfileId,
        rootFolderPath: root_folder_path,
        monitored: true,
        addOptions:
          type === "movies"
            ? { searchForMovie: true }
            : { searchForMissingEpisodes: true },
      },
      "Added successfully",
      "Adding failed",
    );
  }

  function deleteItem(type: MediaType, item: MediaActionItem) {
    const path =
      (type === "movies" ? "movie" : "series") +
      "/" +
      item.id +
      "?deleteFiles=true";
    return request(
      type,
      path,
      "DELETE",
      undefined,
      "Deleted successfully",
      "Deletion failed",
    );
  }

  function searchItem(type: MediaType, item: MediaActionItem) {
    if (typeof item.id !== "number" || !Number.isInteger(item.id) || item.id <= 0 || item.already_in_library === false) {
      options.showErrorAlert("Search failed: media must already exist in the library");
      return Promise.resolve();
    }
    return request(
      type,
      "command",
      "POST",
      type === "movies"
        ? { name: "MoviesSearch", movieIds: [item.id] }
        : { name: "SeriesSearch", seriesId: item.id },
      "Start search successfully",
      "Search failed",
    );
  }

  return { addItem, deleteItem, searchItem };
}
