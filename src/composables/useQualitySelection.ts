import { ref } from 'vue';

export type Category = 'movies' | 'series';
export interface ItemQualityPayload { type: Category; item: any }

export function useQualitySelection() {
  const initialQualitySelectionDialog = null;
  const qualitySelectionDialog = ref(initialQualitySelectionDialog);

  const resetQualitySelectionDialog = () => {
    qualitySelectionDialog.value = initialQualitySelectionDialog;
  };

  const initialItemQuality = null;
  const itemQuality = ref<ItemQualityPayload | null>(initialItemQuality);

  const resetItemQuality = () => {
    itemQuality.value = initialItemQuality;
  };

  return {
    qualitySelectionDialog,
    resetQualitySelectionDialog,
    itemQuality,
    resetItemQuality
  };
}
