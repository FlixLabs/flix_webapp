import { test, expect, movie } from './fixtures';

for (const path of ['/library', '/outings']) {
  test(`${path} keeps search and pages accessible while scrolling`, async ({ page, mutations }) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 700 });
    const items = Array.from({ length: 25 }, (_, i) => ({
      ...movie, id: 100 + i, tmdbId: 100 + i, title: `Example ${String(i + 1).padStart(2, '0')}`,
      release_date: '2026-10-01', first_air_date: '2026-10-01', name: `Example ${i + 1}`,
    }));
    await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: items }));
    await page.route(/\/(upcoming|on_the_air)\?/, route => route.fulfill({ json: { results: items, total_pages: 1 } }));
    await page.goto(path);
    await expect(page.locator('.media-card')).toHaveCount(12);
    await expect(page.getByRole('button', { name: 'Movies (25)', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('[aria-label="Media type"]').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator('.v-pagination')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(async () => (await page.locator('.page-navigation').boundingBox())?.y).toBe(64);
    await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
    await expect(page.locator('.media-card').first()).toContainText('Example 13');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example 25');
    await expect(page.locator('.media-card')).toHaveCount(1);
    await expect(page.locator('.media-card')).toContainText('Example 25');
    expect(mutations).toEqual([]);
  });
}

test('system exposes storage and service sections without stacking every card', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/(config\/host|system\/status|log|health)\?/, route => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith('/log') ? { records: [{ time: '2026-10-08', level: 'Info', message: 'Service log entry' }] }
      : path.endsWith('/health') ? [] : { version: 'Test version', port: 7878, startTime: new Date().toISOString() };
    return route.fulfill({ json });
  });
  await page.goto('/system');
  const movieButton = page.getByRole('button', { name: 'Movies', exact: true });
  const storageButton = page.getByRole('button', { name: 'Storage', exact: true });
  await expect(storageButton).toBeVisible();
  expect((await storageButton.boundingBox())!.height).toBe((await movieButton.boundingBox())!.height);
  const movieIcon = (await movieButton.locator('.v-icon').boundingBox())!;
  const storageIcon = (await storageButton.locator('.v-icon').boundingBox())!;
  expect(storageIcon.height).toBe(movieIcon.height);
  expect(storageIcon.width).toBe(movieIcon.width);
  await expect(page.getByText('Movie Storage', { exact: true })).toBeVisible();
  await expect(page.getByText('Series Storage', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Host Configuration', { exact: true }).first()).not.toBeVisible();
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await expect(page.getByText('Series Storage', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await expect(page.locator('.v-card-title:visible').filter({ hasText: 'Host Configuration' })).toBeVisible();
  await expect(page.getByText('Download Storage', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Logs', exact: true }).click();
  await expect(page.locator('td:visible').filter({ hasText: /^Service log entry$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.locator('.v-alert:visible').filter({ hasText: 'No health issues reported' })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('settings sections retain unsaved form input', async ({ page, mutations }) => {
  await page.goto('/settings');
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).not.toBeVisible();
  await page.getByLabel('Basic authentication', { exact: true }).check();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('Unsaved username');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('Unsaved username');
  expect(mutations).toEqual([]);
});

test('dashboard and downloads use the same search-to-controls spacing', async ({ page, mutations }) => {
  const gaps: number[] = [];
  for (const path of ['/dashboard', '/downloads']) {
    await page.goto(path);
    const search = page.locator('.page-navigation .v-input');
    const buttons = page.locator('.page-navigation .v-btn-toggle').first();
    await expect(search).toBeVisible();
    const field = (await search.boundingBox())!;
    const controls = (await buttons.boundingBox())!;
    gaps.push(controls.y - field.y - field.height);
  }
  expect(gaps[0]).toBe(gaps[1]);
  expect(mutations).toEqual([]);
});
