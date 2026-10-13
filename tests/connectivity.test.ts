import { afterEach, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useConnectivity } from '@/composables/useConnectivity';

afterEach(() => vi.unstubAllGlobals());
it('reports connectivity events without requesting or replaying anything', () => {
  const window = new EventTarget();
  vi.stubGlobal('window', window); vi.stubGlobal('navigator', { onLine: true });
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const scope = effectScope();
  const online = scope.run(useConnectivity)!;
  expect(online.value).toBe(true);
  window.dispatchEvent(new Event('offline'));
  expect(online.value).toBe(false);
  window.dispatchEvent(new Event('online'));
  expect(online.value).toBe(true);
  scope.stop();
  window.dispatchEvent(new Event('offline'));
  expect(online.value).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
