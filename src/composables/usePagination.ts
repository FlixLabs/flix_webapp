import { computed } from 'vue';
import type { Ref } from 'vue';

export function usePagination<T = any>(items: Ref<T[]>, page: Ref<number>, itemsPerPage = 10) {
  const paginatedItems = computed(() => {
    const start = (page.value - 1) * itemsPerPage;
    return items.value.slice(start, start + itemsPerPage);
  });

  return {
    paginatedItems
  };
}
