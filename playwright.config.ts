import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.env.FLIX_E2E_ROOT || '.');
const suiteRoot = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.FLIX_E2E_PORT || 5180);
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_BROWSER_PATH ? { executablePath: process.env.PW_BROWSER_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1200 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `yarn --cwd "${root}" dev --config "${suiteRoot}/e2e.vite.config.ts" --mode e2e --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      VITE_FLIX_API_USE: 'true', VITE_FLIX_API_URL: 'http://flix.test',
      VITE_TMDB_BASE_URL: 'http://tmdb.test', VITE_TMDB_API_KEY: 'test-only',
      VITE_SYSTEM_STORAGE_SPACE_TRESHOLD: '90', VITE_CRYPT_KEY: 'test-only',
    },
  },
});
