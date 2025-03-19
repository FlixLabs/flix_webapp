import { ref } from 'vue';

export function useAlert() {
  const initialAlert = {
    visible: false,
    type: null as string | null,
    icon: null as string | null,
    text: ''
  };

  const alert = ref({ ...initialAlert });

  const resetAlert = () => {
    alert.value = { ...initialAlert };
  };

  return { alert, resetAlert };
}
