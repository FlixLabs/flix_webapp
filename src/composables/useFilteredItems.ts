import { computed, type Ref } from 'vue';

export function useFilteredItems<T extends { title: string }>(items: Ref<T[]>, search: Ref<string>) {
  const filteredItems = computed(() => {
    if (!search.value) return items.value;
    return items.value.filter((item) =>
      item.title.toLowerCase().includes(search.value.toLowerCase())
    );
  });

  return { filteredItems };
}
