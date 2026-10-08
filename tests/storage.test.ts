import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useStorageLocations, type RootFolder } from "@/composables/useStorageLocations";

const gib = 1024 ** 3;

describe("media storage locations", () => {
  it("uses the most specific mount and the root folder's actual free space", () => {
    const roots = ref<RootFolder[]>([{ path: "/data/movies/library", accessible: true, freeSpace: 20 * gib }]);
    const disks = ref([
      { path: "/", total_space: 50, free_space: 5 },
      { path: "/data", total_space: 100, free_space: 20 },
      { path: "/data/movies/", total_space: 200, free_space: 20 },
    ]);
    const locations = useStorageLocations(roots, disks);
    expect(locations.value[0]).toMatchObject({ free: 20, total: 200, ratio: 90 });
    disks.value = [{ path: "/data", total_space: 100, free_space: 20 }];
    expect(locations.value[0].total).toBe(100);
  });

  it("does not confuse similarly named folders", () => {
    const locations = useStorageLocations(
      ref([{ path: "/movies-backup", accessible: true, freeSpace: gib }]),
      ref([{ path: "/movies", total_space: 100, free_space: 20 }]),
    );
    expect(locations.value[0]).toMatchObject({ free: 1, total: null, ratio: null });
  });

  it("supports Windows paths", () => {
    const locations = useStorageLocations(
      ref([{ path: "D:\\Movies", accessible: true, freeSpace: gib }]),
      ref([{ path: "d:\\", total_space: 100, free_space: 1 }]),
    );
    expect(locations.value[0].total).toBe(100);
  });

  it.each([null, undefined, 0])("preserves missing free space and zero correctly: %s", (freeSpace) => {
    const locations = useStorageLocations(
      ref([{ path: "/movies", accessible: true, freeSpace }]),
      ref([{ path: "/movies", total_space: 100, free_space: 0 }]),
    );
    expect(locations.value[0].free).toBe(freeSpace === 0 ? 0 : null);
    expect(locations.value[0].ratio).toBe(freeSpace === 0 ? 100 : null);
  });

  it("does not show metrics for inaccessible folders", () => {
    const locations = useStorageLocations(
      ref([{ path: "/tv", accessible: false, freeSpace: gib }]),
      ref([{ path: "/tv", total_space: 100, free_space: 20 }]),
    );
    expect(locations.value[0]).toMatchObject({ accessible: false, free: null, total: null, ratio: null });
  });

  it("does not associate the real media folders with the container's disk", () => {
    const locations = useStorageLocations(
      ref([{ path: "/movies", accessible: true, freeSpace: 168964902912 }]),
      ref([
        { path: "/", free_space: 35.73, total_space: 195.8 },
        { path: "/config", free_space: 35.73, total_space: 195.8 },
      ]),
    );
    expect(locations.value[0].free).toBeGreaterThan(157);
    expect(locations.value[0].total).toBeNull();
    expect(locations.value[0].ratio).toBeNull();
  });
});
