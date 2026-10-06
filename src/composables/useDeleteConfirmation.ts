import { ref } from 'vue';
import type { MediaActionItem } from '@/composables/useMediaActions';

type DeleteKind = 'movies' | 'series';
type DeletePayload = { type: DeleteKind | null; item: MediaActionItem | null };

export function useDeleteConfirmation(options?: {
  deleteItem: (type: DeleteKind, item: MediaActionItem) => unknown;
  selectedItem?: (type: DeleteKind) => MediaActionItem | null;
  onConfirm?: () => void;
}) {
  const initialDeleteConfirmationDialog = false;
  const deleteConfirmationDialog = ref(initialDeleteConfirmationDialog);

  const resetDeleteConfirmationDialog = () => {
    deleteConfirmationDialog.value = initialDeleteConfirmationDialog;
  };

  const initialItemToDelete: DeletePayload = {
    type: null,
    item: null
  };
  const itemToDelete = ref({ ...initialItemToDelete });

  const resetItemToDelete = () => {
    itemToDelete.value = { ...initialItemToDelete };
  };

  function openDeleteConfirmationDialog(type: DeleteKind, item: MediaActionItem | null) {
    itemToDelete.value = { type, item: item ?? options?.selectedItem?.(type) ?? null };
    deleteConfirmationDialog.value = true;
  }

  function confirmDelete() {
    const { type, item } = itemToDelete.value;
    if (!type || !item || !options) return;
    options.deleteItem(type, item);
    resetDeleteConfirmationDialog();
    resetItemToDelete();
    options.onConfirm?.();
  }

  return {
    deleteConfirmationDialog,
    resetDeleteConfirmationDialog,
    itemToDelete,
    resetItemToDelete,
    openDeleteConfirmationDialog,
    confirmDelete,
  };
}
