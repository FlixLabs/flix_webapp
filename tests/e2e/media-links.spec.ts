import { test, expect, movie } from './fixtures';

test('Library sheets support Back and Forward without losing search or page', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: Array.from({ length: 15 }, (_, i) => ({ ...movie, id: i + 1, title: `Example ${String(i + 1).padStart(2, '0')}` })) }));
  await page.goto('/library');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).first().click();
  await page.locator('.media-card').first().click();
  await expect(page).toHaveURL(/media=movies&id=13/);
  await expect(page.locator('.v-dialog .title-line')).toHaveText('Example 13');
  await page.goBack(); await expect(page.locator('.v-dialog')).not.toBeVisible();
  await expect(page.locator('.media-card').first()).toContainText('Example 13');
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  await page.goForward(); await expect(page.locator('.v-dialog .title-line')).toHaveText('Example 13');
  await page.getByRole('button', { name: 'Next media' }).click();
  await expect(page).toHaveURL(/media=movies&id=14/);
  await page.goBack(); await expect(page.locator('.v-dialog')).not.toBeVisible();
  expect(mutations).toEqual([]);
});

for (const view of ['library', 'dashboard', 'outings']) {
  test(`${view} shares a canonical instance-specific link`, async ({ page, mutations }) => {
    await page.route(/\/discover\/movie\?/, route => route.fulfill({ json: { results: [{ id: movie.tmdbId, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.goto(`/${view}`);
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else {
      if (view === 'outings') await expect(page.locator('.media-card')).toContainText('Existing');
      await page.locator('.media-card').click();
    }
    await page.getByRole('button', { name: 'Share media', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Media link', exact: true });
    const url = new URL(await input.inputValue());
    expect(url.pathname).toBe('/library'); expect(url.searchParams.get('id')).toBe('1');
    expect(url.searchParams.get('instance')).toBe('Test instance'); expect(url.searchParams.has('apikey')).toBe(false);
    expect(mutations).toEqual([]);
  });
}

test('direct links open after automatic login and can be closed without reopening', async ({ page, mutations }) => {
  await page.addInitScript(() => sessionStorage.removeItem('flix_webapp_is_authenticated'));
  await page.goto('/library?media=movies&id=1&instance=Test%20instance');
  await expect(page).toHaveURL(/\/library\?media=movies&id=1/);
  await expect(page.locator('.v-dialog .title-line')).toHaveText(movie.title);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/); await expect(page.locator('.v-dialog')).not.toBeVisible();
  await page.reload(); await expect(page.locator('.v-dialog')).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('unavailable media and instances do not open a wrong sheet', async ({ page, mutations }) => {
  await page.goto('/library?media=movies&id=999&instance=Test%20instance');
  await expect(page.locator('.v-alert')).toContainText('This media is not available');
  await expect(page.locator('.v-dialog')).not.toBeVisible();
  await page.goto('/library?media=movies&id=1&instance=Unknown');
  await expect(page.locator('.v-alert')).toContainText('instance in this media link is unavailable');
  await expect(page.locator('.v-dialog')).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('share links expose a manual-copy fallback when clipboard is unavailable', async ({ page, mutations }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.goto('/library?media=movies&id=1');
  await page.getByRole('button', { name: 'Share media', exact: true }).click();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('.v-dialog').filter({ hasText: 'Share media link' })).toContainText('Select the link to copy it manually');
  expect(mutations).toEqual([]);
});

test('a shared link selects its instance and manual instance changes clear the old sheet', async ({ page, mutations }) => {
  const config = { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' };
  await page.route('**/instances', route => route.fulfill({ json: [
    { name: 'Test instance', radarr: config, sonarr: { ...config, base_url: 'http://sonarr.test' } },
    { name: 'Other instance', radarr: { ...config, base_url: 'http://other.test' }, sonarr: { ...config, base_url: 'http://sonarr.test' } },
  ] }));
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [{ ...movie, title: route.request().url().includes('other.test') ? 'Other instance movie' : 'Default instance movie' }] }));
  await page.goto('/library?media=movies&id=1&instance=Other%20instance');
  await expect(page.locator('.v-dialog .title-line')).toHaveText('Other instance movie');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('combobox', { name: 'Instance', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Test instance', exact: true }).click();
  await expect(page.locator('.media-card')).toContainText('Default instance movie');
  await expect(page.locator('.v-dialog')).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('successful copying writes the canonical link to the clipboard', async ({ page, mutations }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { sessionStorage.setItem('copied-link', value); } } }));
  await page.goto('/library?media=movies&id=1');
  await page.getByRole('button', { name: 'Share media', exact: true }).click();
  const value = await page.getByRole('textbox', { name: 'Media link', exact: true }).inputValue();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('.v-dialog').filter({ hasText: 'Share media link' })).toContainText('Link copied.');
  expect(await page.evaluate(() => sessionStorage.getItem('copied-link'))).toBe(value);
  expect(mutations).toEqual([]);
});

test('signing in returns to the requested media sheet', async ({ page, mutations }) => {
  await page.addInitScript(() => sessionStorage.removeItem('flix_webapp_is_authenticated'));
  await page.route('**/session', route => route.fulfill({ json: route.request().method() === 'POST'
    ? { enabled: true, authenticated: true, token: 'a'.repeat(64), expiresIn: 2592000 }
    : { enabled: true, authenticated: false } }));
  await page.goto('/library?media=movies&id=1&instance=Test%20instance');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('test-user');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/library\?media=movies&id=1/);
  await expect(page.locator('.v-dialog .title-line')).toHaveText(movie.title);
  expect(mutations).toEqual([]);
});
