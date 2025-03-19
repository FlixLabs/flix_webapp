import { ref, computed } from 'vue';

export function useDeleteConfirmation() {
  const initialDeleteConfirmationDialog = false;
  const deleteConfirmationDialog = ref(initialDeleteConfirmationDialog);

  const resetDeleteConfirmationDialog = () => {
    deleteConfirmationDialog.value = initialDeleteConfirmationDialog;
  };

  const initialItemToDelete = {
    type: null,
    item: null
  };
  const itemToDelete = ref({ ...initialItemToDelete });

  const resetItemToDelete = () => {
    itemToDelete.value = { ...initialItemToDelete };
  };

  return {
    deleteConfirmationDialog,
    resetDeleteConfirmationDialog,
    itemToDelete,
    resetItemToDelete
  };
}
