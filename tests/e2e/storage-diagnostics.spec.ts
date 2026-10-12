import { test, expect } from './fixtures';

async function configureAgent(page: import('@playwright/test').Page) {
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Storage test', has_storage_agent: true,
    radarr: { base_url: 'http://radarr.test', api_key: 'test', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test', root_folder_path: '/tv' },
  }] }));
}

test('storage separates filesystem errors, missing measurements and saturation', async ({ page, mutations }) => {
  await configureAgent(page);
  await page.route('**/storage/**', route => route.fulfill({ json: { collectedAt: '2026-10-12T10:00:00Z', locations: [
    { id: 'movies', path: '/storage/movies', available: false, code: 'IO_ERROR' },
    { id: 'series', path: '/storage/series', available: true, totalBytes: 100e9, availableBytes: 1e9, usagePercent: 99 },
  ] } }));
  await page.goto('/system');
  const movies = page.locator('.v-card').filter({ has: page.getByText('Movie Storage', { exact: true }) }).first();
  await expect(movies).toContainText('Filesystem I/O error');
  await expect(movies).toContainText('recreate the agent');
  await expect(movies).not.toContainText('Storage full');
  const downloads = page.locator('.v-card').filter({ has: page.getByText('Download Storage', { exact: true }) }).first();
  await expect(downloads).toContainText('Measurement missing');
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  const series = page.locator('.v-card').filter({ has: page.getByText('Series Storage', { exact: true }) }).first();
  await expect(series).toContainText('Storage nearly full');
  await expect(series).toContainText('99% used');
  expect(mutations).toEqual([]);
});

test('storage displays a safe agent authentication error instead of old capacity', async ({ page, mutations }) => {
  await configureAgent(page);
  await page.route('**/storage/**', route => route.fulfill({ json: { collectedAt: '2026-10-12T10:00:00Z', locations: [
    { id: 'movies', path: '/storage/movies', available: true, totalBytes: 100e9, availableBytes: 20e9, usagePercent: 80 },
  ] } }));
  await page.goto('/system');
  const card = page.locator('.v-card').filter({ has: page.getByText('Movie Storage', { exact: true }) }).first();
  await expect(card).toContainText('/storage/movies');
  await page.route('**/storage/**', route => route.fulfill({ status: 502, json: { code: 'AGENT_AUTH_FAILED', error: 'private secret' } }));
  await page.getByRole('button', { name: 'Refresh Storage', exact: true }).click();
  await expect(card).toContainText('rejected authentication');
  await expect(card).toContainText('Last valid measurement');
  await expect(card).toContainText('Current capacity is unknown');
  await expect(card.locator('table')).toHaveCount(0);
  await expect(page.getByText('private secret')).toHaveCount(0);
  expect(mutations).toEqual([]);
});
