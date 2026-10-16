import { afterEach, expect, it, vi } from 'vitest';

vi.mock('vite', () => ({ defineConfig: (value: unknown) => value, loadEnv: () => ({}) }));
vi.mock('@vitejs/plugin-vue', () => ({ default: () => ({ name: 'vue-test' }) }));
vi.mock('vite-plugin-vue-devtools', () => ({ default: () => ({ name: 'devtools-test' }) }));
import configure from '../vite.config';

afterEach(() => vi.unstubAllEnvs());

it('strips standalone service configuration from API-mode bundles', () => {
  vi.stubEnv('VITE_FLIX_API_USE', 'true');
  vi.stubEnv('VITE_RADARR_API_KEY', 'test-only-radarr-secret');
  vi.stubEnv('VITE_SONARR_API_KEY', 'test-only-sonarr-secret');
  const config = configure({ command: 'build', mode: 'test', isPreview: false });
  expect(config.define?.['import.meta.env.VITE_RADARR_API_KEY']).toBe('""');
  expect(config.define?.['import.meta.env.VITE_SONARR_API_KEY']).toBe('""');
  expect(process.env.VITE_RADARR_API_KEY).toBe('');
  expect(process.env.VITE_SONARR_API_KEY).toBe('');
});
it('keeps standalone service configuration when the API is disabled', () => {
  vi.stubEnv('VITE_FLIX_API_USE', 'false');
  vi.stubEnv('VITE_RADARR_API_KEY', 'test-only-radarr-secret');
  const config = configure({ command: 'build', mode: 'test', isPreview: false });
  expect(config.define?.['import.meta.env.VITE_RADARR_API_KEY']).toBeUndefined();
  expect(process.env.VITE_RADARR_API_KEY).toBe('test-only-radarr-secret');
});
