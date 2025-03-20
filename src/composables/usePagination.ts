import { computed } from 'vue';

export function usePagination(items, page, itemsPerPage = 10) {
  const paginatedItems = computed(() => {
    const start = (page.value - 1) * itemsPerPage;
    return items.value.slice(start, start + itemsPerPage);
  });

  return {
    paginatedItems
  };
}
