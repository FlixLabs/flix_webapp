import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import { useResettable } from '@/composables/useResettable';

import type { MediaInstance as Instance } from '@/composables/useMediaService';

export const useFlixStore = defineStore('flix', () => {
  const { state: instances, reset: resetInstances } = useResettable<Instance[]>([]);

  const initialInstance = sessionStorage.getItem('selectedInstance') || null;
  const { state: selectedInstance, reset: resetSelectedInstance } = useResettable(initialInstance);

  const selectedInstanceData = computed(() => {
    return instances.value.find(instance => instance.name === selectedInstance.value) || null;
  });

  function setInstances(data: Instance[]) {
    instances.value = data;
    if (!data.some(instance => instance.name === selectedInstance.value)) {
      selectedInstance.value = data[0]?.name ?? null;
    }
  }

  watch(selectedInstance, (newValue) => {
    if (newValue) {
      sessionStorage.setItem('selectedInstance', newValue);
    } else {
      sessionStorage.removeItem('selectedInstance');
    }
  });

  return {
    instances,
    selectedInstance,
    selectedInstanceData,
    setInstances,
  };
});
