import { test, expect } from './fixtures';

test('integrations shows service availability and retries only the failed service', async ({ page, mutations }) => {
  let denied = true;
  let radarrReads = 0;
  let sonarrReads = 0;
  await page.route(/\/api\/v3\/system\/status\?*/, route => {
    const radarr = new URL(route.request().url()).hostname === 'radarr.test';
    if (radarr) radarrReads++; else sonarrReads++;
    return route.fulfill({ status: radarr && denied ? 401 : 200, json: { version: '6.0.0' } });
  });
  await page.goto('/system');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  const radarr = page.locator('[aria-label="Radarr integration"]');
  await expect(radarr).toContainText('Access denied (HTTP 401)');
  await expect(page.locator('[aria-label="Flix API integration"]')).toContainText('Available');
  await expect(page.locator('[aria-label="Sonarr integration"]')).toContainText('6.0.0');
  await expect(page.locator('[aria-label="Storage Agent integration"]')).toContainText('Not configured');
  const beforeRadarr = radarrReads;
  const beforeSonarr = sonarrReads;
  denied = false;
  await page.getByRole('button', { name: 'Retry Radarr', exact: true }).click();
  await expect(radarr).toContainText('Available');
  await expect(radarr).toContainText('6.0.0');
  expect(radarrReads).toBe(beforeRadarr + 1);
  expect(sonarrReads).toBe(beforeSonarr);
  await expect(page.getByRole('button', { name: 'Check All', exact: true })).toBeInViewport();
  expect(mutations).toEqual([]);
});

test('a reachable agent with inaccessible volumes is degraded, not disconnected', async ({ page, mutations }) => {
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Storage test', has_storage_agent: true,
    radarr: { base_url: 'http://radarr.test', api_key: 'test', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test', root_folder_path: '/tv' },
  }] }));
  await page.route('**/storage/**', route => route.fulfill({ json: { collectedAt: '2026-10-12T10:00:00Z',
    locations: [{ id: 'movies', available: false }, { id: 'series', available: false }, { id: 'downloads', available: false }],
  } }));
  await page.goto('/system');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  const agent = page.locator('[aria-label="Storage Agent integration"]');
  await expect(agent).toContainText('Degraded');
  await expect(agent).toContainText('movies, series, downloads');
  await expect(agent).toContainText('Agent is reachable');
  await page.route('**/storage/**', route => route.fulfill({ status: 502, json: { error: 'Agent unavailable' } }));
  await page.getByRole('button', { name: 'Retry Storage Agent', exact: true }).click();
  await expect(agent).toContainText('Flix API cannot reach the storage agent');
  expect(mutations).toEqual([]);
});
