import { ref } from 'vue';

export function useQualitySelection() {
  const initialQualitySelectionDialog = null;
  const qualitySelectionDialog = ref(initialQualitySelectionDialog);

  const resetQualitySelectionDialog = () => {
    qualitySelectionDialog.value = initialQualitySelectionDialog;
  };

  const initialItemQuality = {
    type: null,
    item: null
  };
  const itemQuality = ref({ ...initialItemQuality });

  const resetItemQuality = () => {
    itemQuality.value = { ...initialItemQuality };
  };

  return {
    qualitySelectionDialog,
    resetQualitySelectionDialog,
    itemQuality,
    resetItemQuality
  };
}
