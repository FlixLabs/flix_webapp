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

for (const method of ['button', 'escape', 'backdrop'] as const) {
  test(`closing loaded clients with ${method} retains the list until the fade completes`, async ({ page, mutations }) => {
    const { dialog, writes } = await setup(page, 'filtered');
    const search = dialog.getByRole('textbox', { name: 'Search completed torrents', exact: true });
    await search.fill('First');
    await expect(dialog.getByText('First torrent', { exact: true })).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const state = await dialog.evaluate(async (overlay, method) => {
      const scrim = overlay.querySelector<HTMLElement>('.v-overlay__scrim')!;
      if (method === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (method === 'backdrop') {
        scrim.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        scrim.click();
        // Vuetify's click-outside handler runs after the pointer event completes.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      else overlay.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return {
        leaving: scrim.classList.contains('fade-transition-leave-active'),
        torrent: overlay.textContent?.includes('First torrent'),
        search: Array.from(overlay.querySelectorAll('input')).some(input => input.value === 'First'),
        refresh: Array.from(overlay.querySelectorAll('button')).some(button => button.textContent?.includes('Refresh clients')),
      };
    }, method);
    expect(state).toEqual({ leaving: true, torrent: true, search: true, refresh: true });
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Download clients', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(dialog.getByText('Second torrent', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(mutations).toEqual([]);
  });
}

test('cancelling torrent removal keeps its identity during the fade', async ({ page, mutations }) => {
  const { dialog, writes } = await setup(page, 'filtered');
  await dialog.getByRole('button', { name: 'Remove torrent First torrent', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove torrent?', exact: true });
  const retained = await confirmation.getByRole('button', { name: 'Cancel', exact: true }).evaluate(async button => {
    const overlay = button.closest('.v-dialog')!;
    const before = overlay.querySelector('.v-card-text')!.textContent;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return overlay.querySelector('.v-card-text')!.textContent === before;
  });
  expect(retained).toBe(true);
  await expect(confirmation).not.toBeVisible();
  expect(writes).toEqual([]);
  expect(mutations).toEqual([]);
});
