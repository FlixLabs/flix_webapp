import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useDialogActivator, preserveNestedDialogFocus } from '@/composables/useDialogActivator';

afterEach(() => vi.unstubAllGlobals());

it('captures each opener synchronously and preserves it during close', () => {
  class Element {}
  const first = new Element(); const second = new Element();
  const document = { activeElement: first, body: new Element() };
  vi.stubGlobal('HTMLElement', Element); vi.stubGlobal('document', document);
  const scope = effectScope(); const open = ref(false);
  const activator = scope.run(() => useDialogActivator(() => open.value))!;
  open.value = true;
  expect(activator.value).toBe(first);
  document.activeElement = second;
  open.value = false;
  expect(activator.value).toBe(first);
  open.value = true;
  expect(activator.value).toBe(second);
  scope.stop();
});

it('does not treat the document body as a media activator for direct links', () => {
  class Element {}
  const body = new Element();
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', { activeElement: body, body });
  const scope = effectScope(); const open = ref(false);
  const activator = scope.run(() => useDialogActivator(() => open.value))!;
  open.value = true;
  expect(activator.value).toBeUndefined();
  scope.stop();
});

it.each([true, false])('preserves a child focus after parent entry only while the child stays open: %s', async staysOpen => {
  const parent = { zIndex: '2400' };
  const child = { zIndex: '2420', classList: { contains: () => staysOpen } };
  class Element {
    focus = vi.fn();
    isConnected = true;
    closest() { return child; }
  }
  const focused = new Element();
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', { activeElement: focused });
  vi.stubGlobal('getComputedStyle', (element: typeof parent) => element);
  preserveNestedDialogFocus({ closest: () => parent } as unknown as HTMLElement);
  await nextTick();
  expect(focused.focus).toHaveBeenCalledTimes(staysOpen ? 1 : 0);
});

it('does not restore focus into a lower stacked dialog', async () => {
  const parent = { zIndex: '2440' };
  const child = { zIndex: '2400' };
  class Element {
    focus = vi.fn();
    closest() { return child; }
  }
  const focused = new Element();
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('document', { activeElement: focused });
  vi.stubGlobal('getComputedStyle', (element: typeof parent) => element);
  preserveNestedDialogFocus({ closest: () => parent } as unknown as HTMLElement);
  await nextTick();
  expect(focused.focus).not.toHaveBeenCalled();
});
