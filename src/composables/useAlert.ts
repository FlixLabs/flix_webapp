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

  const showAlert = (type: string, icon: string, text: string) => {
    alert.value = { visible: true, type, icon, text };
    setTimeout(() => {
      resetAlert();
    }, 5000);
  };

  const showSuccessAlert = (text = 'The operation was successful!') => {
    showAlert('success', 'mdi-check-circle', text);
  };

  const showErrorAlert = (error: unknown = 'An error occurred!') => {
    const text = error instanceof Error ? error.message
      : typeof error === 'string' ? error : 'An error occurred!';
    showAlert('error', 'mdi-alert-circle', text);
  };

  return {
    alert,
    showSuccessAlert,
    showErrorAlert,
    resetAlert
  };
}
