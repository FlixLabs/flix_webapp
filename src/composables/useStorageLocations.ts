import { computed, type Ref } from "vue";

export interface RootFolder {
  path: string;
  accessible: boolean;
  freeSpace?: number | null;
}

interface DiskSpace {
  path: string;
  free_space: number;
  total_space: number;
}

function normalizePath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function useStorageLocations(roots: Ref<RootFolder[]>, disks: Ref<DiskSpace[]>) {
  return computed(() => roots.value.map(root => {
    const path = normalizePath(root.path);
    const disk = disks.value
      .filter(disk => {
        const mount = normalizePath(disk.path);
        return path === mount || path.startsWith(mount + "/");
      })
      .sort((a, b) => b.path.length - a.path.length)[0];
    const free = root.accessible && typeof root.freeSpace === "number" && root.freeSpace >= 0
      ? root.freeSpace / 1024 ** 3
      : null;
    // A missing nested mount can otherwise associate media with the container's disk.
    const total = free !== null && disk && Math.abs(disk.free_space - free) <= 0.01
      && disk.total_space > 0 && disk.total_space >= free
      ? disk.total_space
      : null;

    return {
      path: root.path,
      accessible: root.accessible,
      free,
      total,
      ratio: free !== null && total !== null ? (1 - free / total) * 100 : null,
    };
  }));
}

export type StorageLocation = ReturnType<typeof useStorageLocations>["value"][number];
