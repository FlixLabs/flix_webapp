import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import {
  useMediaService,
  type MediaInstance,
} from "@/composables/useMediaService";
import { useMediaActions, canSearchItem } from "@/composables/useMediaActions";
import { useEpisodeSummary } from "@/composables/useEpisodeSummary";
import { useQualityProfiles } from "@/composables/useQualityProfiles";
import { useDeleteConfirmation } from "@/composables/useDeleteConfirmation";

function createOptions() {
  return {
    useAPI: ref(true),
    selectedInstanceData: ref<MediaInstance | null>({
      name: "First",
      radarr: {
        base_url: "http://radarr",
        api_key: "movie-key",
        root_folder_path: "/movies",
      },
      sonarr: {
        base_url: "http://sonarr",
        api_key: "series-key",
        root_folder_path: "/tv",
      },
    }),
    showSuccessAlert: vi.fn(),
    showErrorAlert: vi.fn(),
    refreshContent: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("media service configuration", () => {
  it("reads the current instance each time instead of capturing the initial one", () => {
    const options = createOptions();
    const { getConfig } = useMediaService(options);
    expect(getConfig("movies").base_url).toBe("http://radarr");
    options.selectedInstanceData.value!.radarr.base_url =
      "http://second-radarr";
    expect(getConfig("movies").base_url).toBe("http://second-radarr");
    expect(getConfig("series").api_key).toBe("series-key");
  });

  it.each(["movies", "series"] as const)("handles unloaded instances for %s", (type) => {
    const options = createOptions();
    options.selectedInstanceData.value = null;
    expect(useMediaService(options).getConfig(type).base_url).toBe("");
  });
});

describe("media actions", () => {
  it.each(["movies", "series"] as const)("allows relaunching a search for existing %s", type => {
    expect(canSearchItem(type, { id: 7, title: "Existing media", status: type === "movies" ? "released" : "continuing" })).toBe(true);
    expect(canSearchItem(type, { id: 7, title: "Not in library", status: "released", already_in_library: false })).toBe(false);
    expect(canSearchItem(type, null)).toBe(false);
    expect(canSearchItem(type, { title: "No service ID", status: "released" })).toBe(false);
    expect(canSearchItem(type, { id: 7, title: "Upcoming", status: "upcoming" })).toBe(false);
  });

  it("does not send search commands without a valid service ID", async () => {
    const options = createOptions();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await useMediaActions(options).searchItem("movies", { title: "No service ID" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.showErrorAlert).toHaveBeenCalled();
  });
  it.each(["movies", "series"] as const)(
    "adds %s with the correct service and search options",
    async (type) => {
      const options = createOptions();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      await useMediaActions(options).addItem(type, {
        title: "Media",
        tmdbId: 12,
        tvdbId: 34,
        qualityProfileId: 2,
      });
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe(
        type === "movies"
          ? "http://radarr/api/v3/movie"
          : "http://sonarr/api/v3/series",
      );
      expect(JSON.parse(request.body)).toMatchObject(
        type === "movies"
          ? {
              tmdbId: 12,
              rootFolderPath: "/movies",
              addOptions: { searchForMovie: true },
            }
          : {
              tvdbId: 34,
              rootFolderPath: "/tv",
              addOptions: { searchForMissingEpisodes: true },
            },
      );
      expect(options.refreshContent).toHaveBeenCalledWith(type);
    },
  );

  it("deletes files using the API key header", async () => {
    const options = createOptions();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await useMediaActions(options).deleteItem("series", {
      id: 7,
      title: "Media",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://sonarr/api/v3/series/7?deleteFiles=true",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-Api-Key": "series-key" }),
      }),
    );
  });

  it.each(["movies", "series"] as const)(
    "issues the correct search command for %s",
    async (type) => {
      const options = createOptions();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      await useMediaActions(options).searchItem(type, {
        id: 7,
        title: "Media",
      });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
        type === "movies"
          ? { name: "MoviesSearch", movieIds: [7] }
          : { name: "SeriesSearch", seriesId: 7 },
      );
    },
  );

  it("reports HTTP failures without refreshing or reporting success", async () => {
    const options = createOptions();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await useMediaActions(options).deleteItem("movies", {
      id: 7,
      title: "Media",
    });
    expect(options.showErrorAlert).toHaveBeenCalledWith("Deletion failed");
    expect(options.showSuccessAlert).not.toHaveBeenCalled();
    expect(options.refreshContent).not.toHaveBeenCalled();
  });

  it("reports network failures", async () => {
    const options = createOptions();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await useMediaActions(options).searchItem("series", {
      id: 7,
      title: "Media",
    });
    expect(options.showErrorAlert).toHaveBeenCalledWith("Search failed");
  });
});

it("groups episodes and sums downloaded sizes reactively", () => {
  const episodes = ref([
    { season: 1, sizeOnDisk: 100 },
    { season: 1, sizeOnDisk: null },
    { season: 2, sizeOnDisk: 50 },
  ]);
  const summary = useEpisodeSummary(episodes);
  expect(summary.grouped_episodes.value[1]).toHaveLength(2);
  expect(summary.totalSerieSizeOnDisk.value).toBe(150);
  episodes.value = [];
  expect(summary.totalSerieSizeOnDisk.value).toBe(0);
  expect(summary.grouped_episodes.value).toEqual({});
});

it("selects a numeric quality profile ID when there is no Any profile", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [{ name: "HD", id: 4 }],
      }),
  );
  const profiles = useQualityProfiles(createOptions());
  await profiles.getQualityProfileList("movies");
  expect(profiles.qualityMovie.value).toBe(4);
});

it("confirms the selected media and resets dialog state", () => {
  const item = { id: 7, title: "Media" };
  const deleteItem = vi.fn();
  const onConfirm = vi.fn();
  const dialog = useDeleteConfirmation({
    deleteItem,
    onConfirm,
    selectedItem: () => item,
  });
  dialog.openDeleteConfirmationDialog("series", null);
  expect(dialog.deleteConfirmationDialog.value).toBe(true);
  dialog.confirmDelete();
  expect(deleteItem).toHaveBeenCalledWith("series", item);
  expect(dialog.deleteConfirmationDialog.value).toBe(false);
  expect(dialog.itemToDelete.value.item).toBe(null);
  expect(onConfirm).toHaveBeenCalledOnce();
});
