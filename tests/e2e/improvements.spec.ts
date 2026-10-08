import { test, expect } from './fixtures';
const feature = process.env.FLIX_E2E_FEATURE ?? 'all';

test('library filters and sort survive reload', async ({ page, mutations }) => {
  test.skip(feature !== 'library' && feature !== 'all');
  await page.goto('/library');
  await page.getByRole('button', { name: 'Filters and sorting' }).click();
  await page.getByRole('combobox', { name: 'Availability', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Missing', exact: true }).click();
  await expect(page.locator('.media-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('.media-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Size', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Filters and sorting' }).click();
  await expect(page.getByRole('combobox', { name: 'Sort by', exact: true })).toHaveValue('Size');
  expect(mutations).toEqual([]);
});

test('episode selection searches automatically', async ({ page, mutations }) => {
  test.skip(feature !== 'episode' && feature !== 'all');
  const searches: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v3/release?')) searches.push(request.url()); });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').filter({ hasText: 'Example series' }).click();
  await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
  await page.getByRole('combobox', { name: 'Episode', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Episode 1 - Pilot', exact: true }).click();
  await expect.poll(() => searches.some(url => url.includes('episodeId=21'))).toBe(true);
  expect(mutations).toEqual([]);
});

test('downloads display reported remaining time and diagnostics', async ({ page, mutations }) => {
  test.skip(feature !== 'downloads' && feature !== 'all');
  await page.goto('/downloads');
  await expect(page.getByText('Time remaining: 00:10:00').first()).toBeVisible();
  await expect(page.getByText('0.50 / 1.00 GB remaining').first()).toBeVisible();
  await page.getByText('Download needs attention', { exact: true }).first().click();
  await expect(page.getByText('Not enough space').first()).toBeVisible();
  expect(mutations).toEqual([]);
});

test('dashboard actions open the missing series directly', async ({ page, mutations }) => {
  test.skip(feature !== 'dashboard' && feature !== 'all');
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Needs attention/ }).click();
  await expect(page.locator('.v-card-title').filter({ hasText: 'Needs attention' })).toBeVisible();
  await expect(page.getByText('Not enough space').first()).toBeVisible();
  await page.getByRole('link').filter({ hasText: 'Example series' }).first().click();
  await expect(page.locator('.v-dialog')).toBeVisible();
  await expect(page.locator('.v-dialog').getByText('Example series', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('preferences restore library search after navigation and reload', async ({ page, mutations }) => {
  test.skip(feature !== 'preferences' && feature !== 'all');
  await page.goto('/library');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await page.goto('/settings');
  await page.goto('/library');
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  expect(mutations).toEqual([]);
});

test('navigation has an accessible name and skip link supports keyboard', async ({ page, mutations }) => {
  test.skip(feature !== 'accessibility' && feature !== 'all');
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(mutations).toEqual([]);
});
