import { computed, type Ref } from 'vue';

export function useCount(items: Ref<T[]>) {
  const total = computed(() => items.value.length);
  return { total };
}
