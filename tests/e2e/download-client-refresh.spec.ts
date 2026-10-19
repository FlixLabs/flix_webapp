import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

function torrent(name: string, id: string) {
  return { id: id.repeat(40), name, state: 'Seeding', progress: 100, completed: true, sizeBytes: 1e9,
    path: '/downloads', ratio: 0, tracked: false, removable: true, removalBlockedReason: null };
}
async function setup(page: Page, mode: 'new' | 'retained' | 'filtered') {
  let items = [torrent('First torrent', 'a'), ...(mode === 'filtered' ? [torrent('Second torrent', 'b')] : [])];
  const writes: unknown[] = [];
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Test instance', has_download_clients: true,
    radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }] }));
  await page.route('**/download-clients/**', route => {
    if (route.request().method() === 'DELETE') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (mode !== 'retained') items = items.filter(item => item.name !== body.name);
      if (mode === 'new' && body.name === 'First torrent') items.push(torrent('Newly completed torrent', 'b'));
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { clients: [{ id: 'main', name: 'Client', type: 'deluge', allowDeleteData: false,
      allowForceRemoval: true, torrents: items }] } });
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Download clients', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download clients', exact: true });
  async function remove(name: string) {
    await dialog.getByRole('button', { name: `Remove torrent ${name}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Remove torrent?', exact: true }).getByRole('button', { name: 'Remove torrent only', exact: true }).click();
  }
  return { dialog, remove, writes };
}

test('newly completed torrents appear after deletion without reopening the panel', async ({ page, mutations }) => {
  const { dialog, remove, writes } = await setup(page, 'new');
  await remove('First torrent');
  await expect(dialog.getByText('Newly completed torrent', { exact: true })).toBeVisible();
  await expect(dialog.getByText('No completed torrents.', { exact: true })).toHaveCount(0);
  await remove('Newly completed torrent');
  await expect(dialog.getByText('No completed torrents.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Download clients', exact: true }).click();
  await expect(dialog.getByText('No completed torrents.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(mutations).toEqual([]);
});

test('an accepted deletion never hides a torrent still returned by the client', async ({ page, mutations }) => {
  const { dialog, remove, writes } = await setup(page, 'retained');
  await remove('First torrent');
  await expect(dialog.getByRole('alert').filter({ hasText: 'still listed by the client' })).toBeVisible();
  await expect(dialog.getByText('First torrent', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove torrent First torrent', exact: true })).toBeDisabled();
  await expect(dialog.getByText('Torrent removed. Its data was kept.', { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(mutations).toEqual([]);
});

test('an empty search result does not claim that the client has no torrents left', async ({ page, mutations }) => {
  const { dialog, remove } = await setup(page, 'filtered');
  const search = dialog.getByRole('textbox', { name: 'Search completed torrents', exact: true });
  await search.fill('First');
  await remove('First torrent');
  await expect(dialog.getByText('No completed torrents match this search.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('No completed torrents.', { exact: true })).toHaveCount(0);
  await search.fill('');
  await expect(dialog.getByText('Second torrent', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
