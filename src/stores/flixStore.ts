import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useResettable } from '@/composables/useResettable';
import { usePersistentPreference } from '@/composables/usePersistentPreference';

import type { MediaInstance as Instance } from '@/composables/useMediaService';

export const useFlixStore = defineStore('flix', () => {
  const authenticationEnabled = ref(false);
  const { state: instances, reset: resetInstances } = useResettable<Instance[]>([]);

  let initialInstance: string | null = null;
  try { initialInstance = sessionStorage.getItem('selectedInstance') || null; } catch {}
  const selectedInstance = usePersistentPreference('instance', initialInstance,
    (value): value is string | null => value === null || typeof value === 'string');

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
    try {
    if (newValue) {
      sessionStorage.setItem('selectedInstance', newValue);
    } else {
      sessionStorage.removeItem('selectedInstance');
    }
    } catch {}
  });

  return {
    authenticationEnabled,
    instances,
    selectedInstance,
    selectedInstanceData,
    setInstances,
  };
});
