import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useFlixStore } from "@/stores/flixStore";
import type { MediaInstance } from "@/composables/useMediaService";

function createStore(savedName: string | null) {
  const storage = {
    getItem: vi.fn().mockReturnValue(savedName),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  vi.stubGlobal("sessionStorage", storage);
  setActivePinia(createPinia());
  return { store: useFlixStore(), storage };
}

const config = { base_url: "http://test", api_key: "test", root_folder_path: "/media" };
const instances: MediaInstance[] = [
  { name: "First", radarr: config, sonarr: config },
  { name: "Second", radarr: config, sonarr: config },
];

afterEach(() => vi.unstubAllGlobals());

describe("instance initialization", () => {
  it("resolves a saved selection after instances arrive", () => {
    const { store } = createStore("Second");
    expect(store.selectedInstanceData).toBeNull();
    store.setInstances(instances);
    expect(store.selectedInstanceData?.name).toBe("Second");
  });

  it.each([null, "Removed"])("selects an available instance when the saved name is %s", async (savedName) => {
    const { store, storage } = createStore(savedName);
    store.setInstances(instances);
    expect(store.selectedInstanceData?.name).toBe("First");
    await nextTick();
    expect(storage.setItem).toHaveBeenCalledWith("selectedInstance", "First");
  });

  it("clears a stale selection when there are no instances", async () => {
    const { store, storage } = createStore("Removed");
    store.setInstances([]);
    expect(store.selectedInstance).toBeNull();
    expect(store.selectedInstanceData).toBeNull();
    await nextTick();
    expect(storage.removeItem).toHaveBeenCalledWith("selectedInstance");
  });
});
