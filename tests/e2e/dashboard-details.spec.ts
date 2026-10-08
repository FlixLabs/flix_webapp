import { test, expect, movie, series } from './fixtures';

test('movie details display the full synopsis and metadata without another request', async ({ page, mutations }) => {
  const overview = 'A complete synopsis. '.repeat(50) + 'The final sentence is readable.';
  const reads: string[] = [];
  page.on('request', request => {
    if (/\/api\/v3\/movie(?:\?|\/lookup\?)/.test(request.url())) reads.push(request.url());
  });
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, overview, certification: 'PG-13', runtime: 120 }] }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'Example movie' });
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  await expect.poll(() => reads.length).toBe(2);
  await row.getByRole('button', { name: 'Details for Example movie', exact: true }).click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(overview);
  await expect(dialog).toContainText('PG-13');
  await expect(dialog).toContainText('120');
  await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Movie.mkv');
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row.getByRole('button', { name: 'Details for Example movie', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  await row.getByRole('button', { name: 'Details for Example movie', exact: true }).press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(row.getByRole('button', { name: 'Details for Example movie', exact: true })).toBeFocused();
  expect(reads).toHaveLength(2);
  expect(mutations).toEqual([]);
});

test('series details allow choosing quality and adding without reloading results', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/series\/lookup\?/, route => route.fulfill({ json: [{ ...series, id: 0, tmdbId: 50, tvdbId: 50, title: 'New series' }] }));
  await page.route(/\/api\/v3\/qualityprofile\?/i, route => route.fulfill({ json: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD' }] }));
  await page.route(/\/api\/v3\/series$/, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    mutations.push({ method: 'POST', path: '/api/v3/series', body: route.request().postDataJSON() });
    return route.fulfill({ json: { id: 77 } });
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New series');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'New series' });
  await row.getByRole('button', { name: 'Details for New series', exact: true }).click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog.getByRole('textbox', { name: 'Size (GB)', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Quality', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  expect(mutations).toEqual([]);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  expect(mutations).toHaveLength(1);
  expect(mutations[0]?.body).toMatchObject({ tvdbId: 50, qualityProfileId: 2 });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
});

test('removing from details requires confirmation and updates the visible result', async ({ page, mutations }) => {
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'Example movie' });
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  await row.getByRole('button', { name: 'Details for Example movie', exact: true }).click();
  const dialog = page.locator('.v-dialog').first();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations).toEqual([]);
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveCount(0);
  expect(mutations).toHaveLength(1);
  expect(mutations[0]?.path).toBe('/api/v3/movie/1');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
});

test('details remain available when no quality profile exists, but adding is disabled', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, id: 0, tmdbId: 50, title: 'New movie' }] }));
  await page.route(/\/api\/v3\/qualityprofile\?/i, route => route.fulfill({ json: [] }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New movie');
  await page.getByRole('button', { name: 'Details for New movie', exact: true }).click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog).toContainText('No quality profile available');
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
});

test('closing a detail sheet preserves the current search, page and scroll position', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: Array.from({ length: 9 }, (_, index) => ({
    ...movie, id: 0, tmdbId: 100 + index, title: `Example movie ${index + 1}`,
  })) }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  const details = page.getByRole('button', { name: 'Details for Example movie 5', exact: true });
  await expect(details).toBeInViewport();
  const scrollY = await page.evaluate(() => window.scrollY);
  await details.click();
  await page.locator('.v-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.v-dialog')).not.toBeVisible();
  await expect(details).toBeFocused();
  await expect(page.getByRole('button', { name: 'Page 2, Current page', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThanOrEqual(1);
  expect(mutations).toEqual([]);
});

test('failed additions keep the sheet open and leave the media available to add', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, id: 0, tmdbId: 50, title: 'New movie' }] }));
  await page.route(/\/api\/v3\/movie$/, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    mutations.push({ method: 'POST', path: '/api/v3/movie', body: route.request().postDataJSON() });
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New movie');
  await page.getByRole('button', { name: 'Details for New movie', exact: true }).click();
  const dialog = page.locator('.v-dialog');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => mutations.length).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Adding failed', { exact: true })).toBeVisible();
  await expect(page.locator('.custom-list').getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
});
