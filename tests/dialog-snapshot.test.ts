import { expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useDialogSnapshot } from '@/composables/useDialogSnapshot';

it('keeps rendered data while closing and ignores late changes until reopened', async () => {
  const scope = effectScope();
  const open = ref(false);
  const source = ref('First');
  const snapshot = scope.run(() => useDialogSnapshot(() => open.value, () => source.value))!;
  expect(snapshot.displayed.value).toBeUndefined();
  open.value = true;
  await nextTick();
  expect(snapshot.displayed.value).toBe('First');
  source.value = 'Updated';
  await nextTick();
  expect(snapshot.displayed.value).toBe('Updated');
  open.value = false;
  source.value = 'Cleared';
  await nextTick();
  expect(snapshot.displayed.value).toBe('Updated');
  snapshot.closed();
  expect(snapshot.displayed.value).toBeUndefined();
  open.value = true;
  await nextTick();
  expect(snapshot.displayed.value).toBe('Cleared');
  scope.stop();
});

it('does not clear a rapidly reopened dialog on an obsolete after-leave event', async () => {
  const scope = effectScope();
  const open = ref(true);
  const source = ref('First');
  const snapshot = scope.run(() => useDialogSnapshot(() => open.value, () => source.value))!;
  open.value = false;
  source.value = 'Second';
  open.value = true;
  await nextTick();
  snapshot.closed();
  expect(snapshot.displayed.value).toBe('Second');
  scope.stop();
});
