import { test, expect } from './fixtures';

test('returning to Downloads through navigation reloads its data', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/queue?*', route => {
    reads++;
    return route.fulfill({ json: { records: [] } });
  });
  await page.goto('/downloads');
  await expect.poll(() => reads).toBe(2);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Downloads', exact: true }).click();
  await expect.poll(() => reads).toBe(4);
  expect(mutations).toEqual([]);
});

test('focus and visibility on return refresh only the active view once and preserve filters', async ({ page, mutations }) => {
  const reads: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let hold = false;
  await page.route(/\/api\/v3\/(queue|history)\?/, async route => {
    const url = new URL(route.request().url()); reads.push(url.hostname + url.pathname);
    if (hold) await pending;
    await route.fulfill({ json: { records: [], totalRecords: 0 } });
  });
  try {
    await page.goto('/downloads');
    await expect.poll(() => reads.length).toBe(4);
    const results = page.locator('.downloads-table');
    await expect(results.locator('.v-data-table-rows-loading')).toHaveCount(0);
    await page.getByRole('button', { name: /^Series/ }).click();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Keep this filter');
    hold = true;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => reads.length).toBe(5);
    expect(reads[4]).toBe('sonarr.test/api/v3/history');
    // Repeated focus events must neither duplicate nor cancel the pending read.
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Keep this filter');
    release();
    await expect(results.locator('.v-data-table-rows-loading')).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(reads).toHaveLength(5);
    expect(mutations).toEqual([]);
  } finally { release(); }
});

test('a browser-restored page refreshes and listeners are removed after leaving Downloads', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/queue?*', route => {
    reads++;
    return route.fulfill({ json: { records: [] } });
  });
  await page.goto('/downloads');
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator('.downloads-table .v-data-table-rows-loading')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => reads).toBe(3);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(200);
  expect(reads).toBe(3);
  expect(mutations).toEqual([]);
});
