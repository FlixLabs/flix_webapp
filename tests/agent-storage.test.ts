import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useAgentStorage } from "@/composables/useAgentStorage";
import type { MediaInstance } from "@/composables/useMediaService";

const scopes: ReturnType<typeof effectScope>[] = [];
const config = { base_url: "http://test", api_key: "test", root_folder_path: "/media" };
const instance = (name: string, hasAgent = true): MediaInstance => ({ name, has_storage_agent: hasAgent, radarr: config, sonarr: config });
const measurement = {
  collectedAt: "2026-01-01T12:00:00Z",
  locations: [
    { id: "movies", path: "/storage/movies", available: true, volumeId: "shared", totalBytes: 7933833900032, availableBytes: 157544005632, usagePercent: 98 },
    { id: "series", path: "/storage/series", available: true, volumeId: "shared", totalBytes: 7933833900032, availableBytes: 157544005632, usagePercent: 98 },
    { id: "downloads", path: "/storage/downloads", available: true, volumeId: "other", totalBytes: 7933833900032, availableBytes: 157544005632, usagePercent: 98 },
  ],
};

function setup(useAPI = true, selected: MediaInstance | null = instance("Example")) {
  const options = { useAPI: ref(useAPI), selectedInstanceData: ref(selected), interval: ref(60) };
  const scope = effectScope();
  scopes.push(scope);
  const storage = scope.run(() => useAgentStorage(options))!;
  return { options, storage, scope };
}

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("storage agent integration", () => {
  it.each([false, true])("does not query an agent when API mode is %s and no agent is configured", async useAPI => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { storage } = setup(useAPI, instance("Example", false));
    await storage.refresh();
    expect(storage.enabled.value).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls Flix API in standalone mode even with an agent instance", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { storage } = setup(false);
    await storage.refresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads movies, series and downloads with the agent usage percentage", async () => {
    vi.stubEnv("VITE_FLIX_API_URL", "http://api.test");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => measurement });
    vi.stubGlobal("fetch", fetchMock);
    const { storage } = setup(true, instance("Example / Test"));
    await vi.waitFor(() => expect(storage.loading.value).toBe(false));
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/storage/Example%20%2F%20Test");
    expect(storage.locations("movies")[0]).toMatchObject({ total: 7388.958614349365, ratio: 98, sharedWith: ["series"] });
    expect(storage.locations("downloads")[0]).toMatchObject({ ratio: 98, sharedWith: [] });
  });

  it("reports failures without stale measurements", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { storage } = setup();
    await vi.waitFor(() => expect(storage.loading.value).toBe(false));
    expect(storage.error.value).not.toBe("");
    expect(storage.locations("movies")).toEqual([]);
  });

  it("ignores an old response after the instance changes", async () => {
    let resolveOld!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ ...measurement, locations: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { options, storage } = setup();
    options.selectedInstanceData.value = instance("Second");
    await nextTick();
    await vi.waitFor(() => expect(storage.loading.value).toBe(false));
    resolveOld({ ok: true, json: async () => measurement });
    await nextTick();
    await nextTick();
    expect(storage.locations("movies")).toEqual([]);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("stops polling and clears data when API mode is disabled", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => measurement });
    vi.stubGlobal("fetch", fetchMock);
    const { options, storage } = setup();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    options.useAPI.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.locations("movies")).toEqual([]);
  });

  it("reschedules polling when the interval changes and pauses at zero", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => measurement });
    vi.stubGlobal("fetch", fetchMock);
    const { options } = setup();
    await vi.advanceTimersByTimeAsync(0);
    options.interval.value = 10;
    await nextTick();
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    options.interval.value = 0;
    await nextTick();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
