import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref, watch, type EffectScope } from 'vue';
import { useReadRequest } from '@/composables/useReadRequest';

const scopes: EffectScope[] = [];
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const scope = effectScope(); scopes.push(scope);
  const context = ref('first');
  const reader = scope.run(() => useReadRequest(() => context.value, 100))!;
  return { ...reader, context, scope };
}

it('distinguishes a successful empty read from an unavailable initial read', () => {
  const reader = setup();
  expect(reader.state).toMatchObject({ hasData: false, error: '', loading: false });
  const failed = reader.begin(); failed.fail(new Error('HTTP 503')); failed.finish();
  expect(reader.state).toMatchObject({ hasData: false, error: 'HTTP 503', loading: false });
  const retry = reader.begin();
  expect(reader.state).toMatchObject({ loading: true, error: 'HTTP 503' });
  retry.success(); retry.finish();
  expect(reader.state).toMatchObject({ hasData: true, error: '', loading: false, lastSuccessAt: expect.any(Number) });
});

it('retains only same-context successful state after a failed refresh', () => {
  const reader = setup();
  const initial = reader.begin(); initial.success(); initial.finish();
  const timestamp = reader.state.lastSuccessAt;
  const refresh = reader.begin(); refresh.fail(new TypeError('Failed to fetch secret-url')); refresh.finish();
  expect(reader.state.hasData).toBe(true);
  expect(reader.state.error).toBe('Unable to reach the service. Check the connection and retry.');
  expect(reader.state.lastSuccessAt).toBe(timestamp);
  reader.context.value = 'second';
  expect(reader.state).toMatchObject({ hasData: false, error: '', lastSuccessAt: null });
});

it('expires a hung read even if the underlying promise never rejects', () => {
  const reader = setup(); const request = reader.begin();
  vi.advanceTimersByTime(101);
  expect(request.signal.aborted).toBe(true);
  expect(request.isCurrent()).toBe(false);
  expect(reader.state).toMatchObject({ loading: false, hasData: false, error: expect.stringContaining('timed out') });
  request.success(); request.fail(new Error('Late')); request.finish();
  expect(reader.state.hasData).toBe(false);
  expect(reader.state.error).toContain('timed out');
});

it('does not let a replaced read stop, overwrite or expire its successor', () => {
  const reader = setup(); const first = reader.begin();
  vi.advanceTimersByTime(50);
  const second = reader.begin();
  expect(first.signal.aborted).toBe(true);
  first.success(); first.fail(new Error('Old failure')); first.finish();
  vi.advanceTimersByTime(51);
  expect(reader.state).toMatchObject({ loading: true, hasData: false, error: '' });
  second.success(); second.finish();
  vi.advanceTimersByTime(101);
  expect(reader.state).toMatchObject({ loading: false, hasData: true, error: '' });
});

it('cancels when leaving a context even if the same context is revisited', () => {
  const reader = setup(); const first = reader.begin();
  reader.context.value = 'second'; reader.context.value = 'first';
  expect(first.isCurrent()).toBe(false);
  first.success(); first.finish();
  expect(reader.state.hasData).toBe(false);
});

it('treats identical configuration tuples as the same context', () => {
  const scope = effectScope(); scopes.push(scope);
  const config = ref({ host: 'test', token: 'test-only' });
  const reader = scope.run(() => useReadRequest(() => [config.value.host, config.value.token]))!;
  const first = reader.begin();
  config.value = { ...config.value };
  expect(first.isCurrent()).toBe(true);
  config.value.token = 'new-test-only';
  expect(first.isCurrent()).toBe(false);
});

it('disposes timers and refuses reads started by late action callbacks', () => {
  const reader = setup(); const request = reader.begin();
  reader.scope.stop();
  expect(request.signal.aborted).toBe(true);
  expect(reader.begin().signal.aborted).toBe(true);
  vi.advanceTimersByTime(101);
  expect(reader.state).toMatchObject({ loading: false, error: '', hasData: false });
});

it('does not cancel a new read when the caller observes the context change first', () => {
  const scope = effectScope(); scopes.push(scope);
  const context = ref('first');
  let reader!: ReturnType<typeof useReadRequest>;
  let launched: ReturnType<typeof reader.begin> | undefined;
  scope.run(() => {
    watch(context, () => { launched = reader.begin(); }, { flush: 'sync' });
    reader = useReadRequest(() => context.value);
  });
  context.value = 'second';
  expect(launched?.isCurrent()).toBe(true);
  expect(reader.state.loading).toBe(true);
  launched!.success(); launched!.finish();
  expect(reader.state).toMatchObject({ loading: false, hasData: true, error: '' });
});
