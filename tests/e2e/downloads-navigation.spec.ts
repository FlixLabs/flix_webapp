import { test, expect } from './fixtures';

const longTitle = 'A complete download title with a very long release name that must remain readable on mobile';
const record = { id: 101, title: longTitle, size: 1e9, sizeleft: 5e8, timeleft: '00:10:00', status: 'downloading', added: '2026-01-01', languages: [] };

test('downloads switch media and history without stacking tables or refetching', async ({ page, mutations }) => {
  const reads: string[] = [];
  await page.route(/\/api\/v3\/(queue|history)\?/, route => {
    const url = new URL(route.request().url());
    reads.push(url.pathname);
    const movie = url.hostname === 'radarr.test';
    return route.fulfill({ json: { records: url.pathname.endsWith('/queue')
      ? [{ ...record, title: movie ? longTitle : 'Series queue' }]
      : [{ id: 201, sourceTitle: movie ? 'Movie history' : 'Series history', date: '2026-01-01', eventType: 'grabbed', languages: [] }] } });
  });
  await page.goto('/downloads');
  const table = page.locator('.downloads-table');
  await expect(table).toHaveCount(1);
  await expect(table).toContainText(longTitle);
  await expect(table).not.toContainText('Movie history');
  await expect.poll(() => reads.length).toBe(4);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(table).toContainText('Movie history');
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await expect(table).toContainText('Series history');
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(table).toContainText('Series queue');
  expect(reads).toHaveLength(4);
  expect(mutations).toEqual([]);
});

test('downloads paginate and filter loaded rows while keeping navigation accessible', async ({ page, mutations }) => {
  const queries: string[] = [];
  await page.route(/\/api\/v3\/queue\?/, route => {
    queries.push(route.request().url());
    return route.fulfill({ json: { records: Array.from({ length: 15 }, (_, index) => ({ ...record, id: 101 + index, title: `${longTitle} ${index + 1}` })) } });
  });
  await page.goto('/downloads');
  const rows = page.locator('.downloads-table tbody .v-data-table__tr');
  await expect(rows).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(async () => (await page.locator('.page-navigation').boundingBox())?.y).toBe(64);
  await expect(page.getByRole('button', { name: 'Go to page 2', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText(`${longTitle} 11`);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill(`${longTitle} 15`);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(`${longTitle} 15`);
  await expect(page.getByText('1 of 15 loaded items.', { exact: false })).toBeVisible();
  expect(queries).toHaveLength(2);
  expect(mutations).toEqual([]);
});

test('refresh reloads only the selected service and view', async ({ page, mutations }) => {
  const reads: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/api\/v3\/(queue|history)$/.test(url.pathname)) reads.push(`${url.hostname}${url.pathname}`);
  });
  await page.goto('/downloads');
  await expect.poll(() => reads.length).toBe(4);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads.length).toBe(5);
  expect(reads[4]).toBe('radarr.test/api/v3/queue');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads.length).toBe(6);
  expect(reads[5]).toBe('radarr.test/api/v3/history');
  expect(mutations).toEqual([]);
});

test('long titles wrap without horizontal scrolling on desktop and mobile', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/queue\?/, route => route.fulfill({ json: { records: [{ ...record, title: longTitle.repeat(5) }] } }));
  await page.goto('/downloads');
  await expect(page.locator('.download-title')).toHaveText(longTitle.repeat(5));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.downloads-table .v-table__wrapper').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('each media and view keeps its own refresh interval', async ({ page, mutations }) => {
  await page.goto('/downloads');
  const interval = page.getByRole('spinbutton', { name: 'Interval (Seconds)', exact: true });
  await expect(interval).toHaveValue('60');
  await interval.fill('30');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(interval).toHaveValue('60');
  await interval.fill('45');
  await page.getByRole('button', { name: 'Series (0)', exact: true }).click();
  await expect(interval).toHaveValue('60');
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(interval).toHaveValue('60');
  await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
  await expect(interval).toHaveValue('30');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(interval).toHaveValue('45');
  expect(mutations).toEqual([]);
});
