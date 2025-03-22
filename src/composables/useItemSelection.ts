import { ref } from 'vue';

export function useItemSelection<T extends { sourceId: number }>() {
  const selectedItem = ref<T | null>(null);

  function handleItemClick(
    id: number,
    items: Ref<T[]>,
    callback?: (item: T) => void
  ) {
    const item = items.value.find(el => el.sourceId === id);
    if (item) {
      selectedItem.value = item;
      if (callback) callback(item);
    }
  }

  return {
    selectedItem,
    handleItemClick,
  };
}
