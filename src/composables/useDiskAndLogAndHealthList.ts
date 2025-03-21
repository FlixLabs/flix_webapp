import { ref } from 'vue';

export function useDiskAndLogAndHealthList() {
  const createDiskList = () =>
    ref<{ path: string; free_space: number; total_space: number; ratio: number }[]>([]);

  const createLogList = () =>
    ref<{ time: string; level: string; message: string }[]>([]);

  const createHealthList = () =>
    ref<{ source: string; type: string; message: string; wikiUrl: string }[]>([]);

  return {
    createDiskList,
    createLogList,
    createHealthList,
  };
}
