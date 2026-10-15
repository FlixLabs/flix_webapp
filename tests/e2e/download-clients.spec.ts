import { test, expect } from './fixtures';

const hash = 'a'.repeat(40);
async function open(page: import('@playwright/test').Page, writes: unknown[], allowDeleteData = false, fail = false) {
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Test instance', has_download_clients: true,
    radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }] }));
  await page.route('**/download-clients/**', route => {
    if (route.request().method() === 'DELETE') {
      writes.push(route.request().postDataJSON());
      return route.fulfill(fail ? { status: 502, json: { error: 'Removal outcome is uncertain.' } } : { status: 204 });
    }
    return route.fulfill({ json: { clients: [{ id: 'main', name: 'My Deluge', type: 'deluge', allowForceRemoval: true, allowDeleteData, torrents: [
      { id: hash, name: 'A completed torrent with a long name to check mobile layout', state: 'Seeding', progress: 100, completed: true, sizeBytes: 1e9, path: '/downloads/movie', ratio: 2, tracked: false, removable: true },
      { id: 'b'.repeat(40), name: 'Tracked film', state: 'Paused', progress: 100, completed: true, sizeBytes: 1e9, path: '/downloads/tracked', ratio: 0, tracked: true, removable: false },
      { id: 'c'.repeat(40), name: 'Active film', state: 'Downloading', progress: 10, completed: false, sizeBytes: 1e9, path: '/downloads/active', ratio: 0, tracked: false, removable: false },
    ] }] } });
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Download clients', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download clients', exact: true });
  await expect(dialog.getByRole('button', { name: 'Remove torrent Tracked film', exact: true })).toBeEnabled();
  await expect(dialog.getByText('Active film', { exact: true })).toHaveCount(0);
  return dialog;
}

test('client cleanup requires confirmation, keeps tracked removal explicit and keeps data by default', async ({ page, mutations }) => {
  const writes: unknown[] = [];
  const dialog = await open(page, writes);
  await dialog.getByRole('button', { name: /^Remove torrent A completed/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove torrent?', exact: true });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('checkbox')).toHaveCount(0);
  expect(writes).toEqual([]);
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toEqual([]);
  await dialog.getByRole('button', { name: /^Remove torrent A completed/ }).click();
  await confirm.getByRole('button', { name: 'Remove torrent only', exact: true }).click();
  await expect(dialog.getByText('Torrent removed. Its data was kept.', { exact: true })).toBeVisible();
  expect(writes).toEqual([{ name: 'A completed torrent with a long name to check mobile layout', deleteData: false }]);
  await expect(dialog.getByRole('button', { name: /^Remove torrent A completed/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Download clients', exact: true }).click();
  await expect(page.getByLabel('Download clients access token', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove torrent Tracked film', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('removing data is opt-in and uncertain requests cannot be retried blindly', async ({ page, mutations }) => {
  const writes: unknown[] = [];
  const dialog = await open(page, writes, true, true);
  await dialog.getByRole('button', { name: /^Remove torrent A completed/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove torrent?', exact: true });
  const checkbox = confirm.getByRole('checkbox', { name: 'Also delete torrent data from disk', exact: true });
  await expect(checkbox).not.toBeChecked(); await checkbox.check();
  await confirm.getByRole('button', { name: 'Remove torrent and data', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'Removal outcome is uncertain' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Remove torrent A completed/ })).toBeDisabled();
  expect(writes).toEqual([{ name: 'A completed torrent with a long name to check mobile layout', deleteData: true }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('legacy and standalone downloads do not expose unconfigured client actions', async ({ page, mutations }) => {
  await page.goto('/downloads');
  await expect(page.getByText('Download example', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download clients', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('forcing tracked removal requires explicit consent and keeps files by default', async ({ page, mutations }) => {
  const writes: unknown[] = [];
  const dialog = await open(page, writes);
  await dialog.getByRole('button', { name: 'Remove torrent Tracked film', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove torrent?', exact: true });
  const remove = confirm.getByRole('button', { name: 'Remove torrent only', exact: true });
  await expect(remove).toBeDisabled();
  expect(writes).toEqual([]);
  await confirm.getByRole('checkbox', { name: 'Force removal despite Radarr/Sonarr tracking', exact: true }).check();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove torrent Tracked film', exact: true }).click();
  await expect(remove).toBeDisabled();
  await confirm.getByRole('checkbox', { name: 'Force removal despite Radarr/Sonarr tracking', exact: true }).check();
  await remove.click();
  expect(writes).toEqual([{ name: 'Tracked film', deleteData: false, force: true }]);
  expect(mutations).toEqual([]);
});
