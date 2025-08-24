import { computed } from 'vue';
import type { Ref } from 'vue';

export function useCount<T = any>(items: Ref<T[]>) {
  const total = computed(() => items.value.length);

  return {
    total
  };
}
