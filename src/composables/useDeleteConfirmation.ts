import { ref } from 'vue';

type DeleteKind = 'movies' | 'series';
type DeletePayload = { type: DeleteKind | null; item: any | null };

export function useDeleteConfirmation() {
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

  return {
    deleteConfirmationDialog,
    resetDeleteConfirmationDialog,
    itemToDelete,
    resetItemToDelete
  };
}
