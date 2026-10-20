import { test, expect, movie, series } from './fixtures';

test('recovers API bootstrap and color network errors without reloading the document', async ({ page, mutations }) => {
  let available = false;
  await page.route('**/color', route => route.abort('failed'));
  await page.route('**/instances', route => available ? route.fallback() : route.fulfill({ status: 503, json: {} }));
  await page.goto('/library');
  const retry = page.getByRole('button', { name: 'Retry API instances', exact: true });
  await expect(retry).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.recovery = 'same-document'; });
  available = true;
  await retry.click();
  await expect(page.locator('.media-card')).toHaveCount(1);
  expect(await page.locator('html').getAttribute('data-recovery')).toBe('same-document');
  expect(mutations).toEqual([]);
});

test('expires a hung library request and retries it without a hard refresh', async ({ page, mutations }) => {
  await page.clock.install();
  let calls = 0; let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/v3\/movie\?/, async route => {
    calls++;
    if (calls === 1) await held;
    await route.fulfill({ json: [movie] }).catch(() => {});
  });
  await page.goto('/library');
  await expect.poll(() => calls).toBe(1);
  await page.clock.runFor(15100);
  await expect(page.locator('.v-alert').filter({ hasText: 'Request timed out' })).toBeVisible();
  await expect(page.getByText('No movies found', { exact: true })).not.toBeVisible();
  release();
  await page.getByRole('button', { name: 'Retry Movie library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Example movie', exact: true })).toBeEnabled();
  expect(calls).toBe(2);
  expect(mutations).toEqual([]);
});

for (const trackedDownloadState of ['importBlocked', undefined]) {
  test(`stale downloads recover with ${trackedDownloadState ? 'verified' : 'unknown'} import state`, async ({ page, mutations }) => {
    let calls = 0; let recovered = false;
    await page.route(/\/api\/v3\/queue\?/, route => {
      if (new URL(route.request().url()).hostname !== 'radarr.test') return route.fallback();
      calls++;
      if (calls === 1) return route.fallback();
      return recovered ? route.fulfill({ json: { totalRecords: 1, records: [{
        id: 101, downloadId: 'test-download', title: 'Recovered download', size: 1e9,
        sizeleft: 0, status: 'completed', trackedDownloadState, languages: [],
      }] } }) : route.fulfill({ status: 503, json: {} });
    });
    await page.goto('/downloads');
    await expect(page.getByRole('button', { name: 'Remove Download example', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('Showing last successful data.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Download example', exact: true })).toBeDisabled();
    recovered = true;
    await page.getByRole('button', { name: 'Retry Movie downloads', exact: true }).click();
    const remove = page.getByRole('button', { name: 'Remove Recovered download', exact: true });
    if (trackedDownloadState) await expect(remove).toBeEnabled();
    else {
      await expect(remove).toBeDisabled();
      await expect(page.getByText('Import status unavailable', { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Showing last successful data.', { exact: false })).not.toBeVisible();
    expect(mutations).toEqual([]);
  });
}

test('distinguishes an unavailable history from a successful empty history', async ({ page, mutations }) => {
  let available = false;
  await page.route(/\/api\/v3\/history\?/, route => available ? route.fulfill({ json: { records: [] } }) : route.fulfill({ status: 503, json: {} }));
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('No history information found', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Movie history', exact: true })).toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Retry Movie history', exact: true }).click();
  await expect(page.getByText('No history information found', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('ignores a late history from the previous instance', async ({ page, mutations }) => {
  const config = (host: string) => ({ base_url: `http://${host}.test`, api_key: 'test-only', root_folder_path: '/media' });
  await page.route('**/instances', route => route.fulfill({ json: [
    { name: 'First', radarr: config('first-radarr'), sonarr: config('first-sonarr') },
    { name: 'Second', radarr: config('second-radarr'), sonarr: config('second-sonarr') },
  ] }));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/v3\/history\?/, async route => {
    const first = new URL(route.request().url()).hostname.startsWith('first-');
    if (first) await held;
    await route.fulfill({ json: { records: [{ id: 1, sourceTitle: first ? 'Old instance import' : 'Second instance import', date: '2026-10-13', eventType: 'downloadFolderImported' }] } }).catch(() => {});
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('combobox', { name: 'Instance', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Second', exact: true }).click();
  await expect(page.getByText('Second instance import', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText('Old instance import', { exact: true })).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('reloads changed service configuration while preserving the instance name', async ({ page, mutations }) => {
  let changed = false;
  await page.route('**/instances', route => changed ? route.fulfill({ json: [{ name: 'Test instance',
    radarr: { base_url: 'http://replacement.test', api_key: 'new-test-only', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' },
  }] }) : route.fallback());
  await page.route('http://replacement.test/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, title: 'New service movie' }] }));
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'Open Example movie', exact: true })).toBeEnabled();
  changed = true;
  await page.getByRole('button', { name: 'Reload instances', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open New service movie', exact: true })).toBeEnabled();
  await expect(page.getByText('Example movie', { exact: true })).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('keeps dashboard changes blocked while library membership is unknown', async ({ page, mutations }) => {
  let available = false;
  await page.route(/\/api\/v3\/movie\?/, route => available ? route.fallback() : route.fulfill({ status: 503, json: {} }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: movie.title });
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry Library status', exact: true })).toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Retry Library status', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('does not report a healthy service after a failed health read', async ({ page, mutations }) => {
  let available = false;
  await page.route(/\/api\/v3\/health\?/, route => available ? route.fulfill({ json: [] }) : route.fulfill({ status: 503, json: {} }));
  await page.goto('/system');
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Radarr health', exact: true })).toBeVisible();
  await expect(page.getByText('No health issues reported', { exact: true })).not.toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Retry Radarr health', exact: true }).click();
  await expect(page.getByText('No health issues reported', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('verifies an uncertain settings change using only GET, never replaying the write', async ({ page, mutations }) => {
  await page.route('**/color', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    mutations.push({ method: 'POST', path: '/color', body: route.request().postDataJSON() });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: 'Custom primary color', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Color settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry Color settings', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Custom primary color', exact: true })).not.toBeChecked();
  expect(mutations.map(item => item.method)).toEqual(['POST']);
});

test('retries a missing series identity without permitting an invalid addition', async ({ page, mutations }) => {
  let available = false;
  await page.route(/\/on_the_air\?/, route => route.fulfill({ json: { results: [{ id: 200, name: 'Upcoming series', first_air_date: '2026-10-20' }], total_pages: 1 } }));
  await page.route(/\/upcoming\?/, route => route.fulfill({ json: { results: [], total_pages: 1 } }));
  await page.route(/\/tv\/200\?/, route => route.fulfill({ json: { seasons: [] } }));
  await page.route(/\/tv\/200\/external_ids\?/, route => available ? route.fulfill({ json: { tvdb_id: 300 } }) : route.fulfill({ status: 503, json: {} }));
  await page.goto('/outings');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open Upcoming series', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  const retry = page.getByRole('button', { name: 'Retry Series identity', exact: true });
  await expect(retry).toBeVisible();
  available = true;
  await retry.click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('retries episodes from the sheet instead of requiring a page reload', async ({ page, mutations }) => {
  let available = false;
  await page.route(/\/api\/v3\/episode\?/, route => available ? route.fallback() : route.fulfill({ status: 503, json: {} }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: `Open ${series.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry Series episodes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  available = true;
  await page.getByRole('button', { name: 'Retry Series episodes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('connectivity hints do not automatically replay changes', async ({ page, mutations }) => {
  await page.goto('/downloads');
  await expect(page.getByText('Download example', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Your browser reports it is offline.', { exact: false })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Your browser reports it is offline.', { exact: false })).not.toBeVisible();
  expect(mutations).toEqual([]);
});
