import { nextTick, shallowRef, watch } from 'vue';

// Programmatically opened dialogs still need an activator for Vuetify's focus return.
export function useDialogActivator(open: () => boolean) {
  const activator = shallowRef<HTMLElement>();
  watch(open, value => {
    if (value) {
      const element = document.activeElement;
      activator.value = element instanceof HTMLElement && element !== document.body
        ? element : undefined;
    }
  }, { flush: 'sync' });
  return activator;
}

// A parent's after-enter focus must not override a child opened during its transition.
export function preserveNestedDialogFocus(container: HTMLElement | null | undefined) {
  const parent = container?.closest('.v-dialog.v-overlay--active');
  const focused = document.activeElement;
  const child = focused?.closest('.v-dialog.v-overlay--active');
  if (!parent || !child || !(focused instanceof HTMLElement)
    || !(Number(getComputedStyle(child).zIndex) > Number(getComputedStyle(parent).zIndex))) return;
  void nextTick(() => {
    if (focused.isConnected && child.classList.contains('v-overlay--active')) {
      focused.focus({ preventScroll: true });
    }
  });
}
