import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import { useResettable } from '@/composables/useResettable';

export const useFlixStore = defineStore('flix', () => {
  const { state: instances, reset: resetInstances } = useResettable([]);

  const initialInstance = sessionStorage.getItem('selectedInstance') || null;
  const { state: selectedInstance, reset: resetSelectedInstance } = useResettable(initialInstance);

  const selectedInstanceData = computed(() => {
    return instances.value.find(instance => instance.name === selectedInstance.value) || null;
  });

  function setInstances(data) {
    instances.value = data;
    if (data.length > 0 && !selectedInstance.value) {
      selectedInstance.value = data[0].name;
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
