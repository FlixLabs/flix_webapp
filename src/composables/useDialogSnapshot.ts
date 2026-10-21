import { shallowRef, watch } from 'vue';

// Invalidate actions on close, but keep their rendered data until after-leave.
export function useDialogSnapshot<T>(open: () => boolean, source: () => T) {
  const displayed = shallowRef<T>();
  watch(() => open() ? source() : undefined, value => {
    if (open()) displayed.value = value;
  }, { immediate: true });
  function closed() {
    if (!open()) displayed.value = undefined;
  }
  return { displayed, closed };
}
