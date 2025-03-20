import { ref } from 'vue';

export function useDialog(initialValue: boolean = false) {
  const dialog = ref(initialValue);
  const reset = () => {
    dialog.value = structuredClone(initialValue);
  };

  return {
    dialog,
    reset
  };
}
