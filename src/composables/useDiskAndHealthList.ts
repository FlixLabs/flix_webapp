import { ref } from 'vue';

export function useDiskAndHealthList() {
  const createDiskList = () =>
    ref<{ path: string; free_space: number; total_space: number; ratio: number }[]>([]);

  const createHealthList = () =>
    ref<{ source: string; type: string; message: string; wikiUrl: string }[]>([]);

  return {
    createDiskList,
    createHealthList,
  };
}
