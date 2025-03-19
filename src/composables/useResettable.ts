import { ref } from 'vue';

export function useResettable<T>(initialValue: T) {
  const state = ref(initialValue);

  const reset = () => {
    state.value = structuredClone(initialValue);
  };

  return { state, reset };
}
