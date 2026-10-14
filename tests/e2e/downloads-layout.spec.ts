import { test, expect } from './fixtures';

test('downloads prioritize confirmed titles and keep technical metadata collapsed', async ({ page, mutations }) => {
  const requests: URL[] = [];
  const release = 'Example.Movie.2026.1080p.Bluray.Long.Release.Title';
  await page.route('**/api/v3/queue?*', route => {
    const url = new URL(route.request().url()); requests.push(url);
    return route.fulfill({ json: { records: [{ id: 101, movieId: 1, seriesId: 2,
      movie: { id: 1, title: 'Example movie' }, series: { id: 2, title: 'Example series' },
      title: release, status: 'downloading', added: '2026-01-01', downloadClient: 'Example client', size: 1e9, sizeleft: 5e8, timeleft: '00:10:00' }] } });
  });
  await page.goto('/downloads');
  const title = page.getByRole('button', { name: `Open media for ${release}`, exact: true });
  await expect(title).toHaveText('Example movie');
  await expect(page.getByText('Example client', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Time remaining: 00:10:00', { exact: true })).toBeVisible();
  await page.getByLabel(`Download details for ${release}`, { exact: true }).click();
  await expect(page.getByText('Example client', { exact: true })).toBeVisible();
  await expect(page.getByText('0.50 / 1.00 GB remaining', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests.find(url => url.hostname === 'radarr.test')?.searchParams.get('includeMovie')).toBe('true');
  expect(requests.find(url => url.hostname === 'sonarr.test')?.searchParams.get('includeSeries')).toBe('true');
  await page.getByRole('button', { name: /^Series/ }).click();
  await expect(title).toHaveText('Example series');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example series');
  await expect(title).toBeVisible();
  expect(mutations).toEqual([]);
});

test('download cards keep warnings and actions visible without horizontal scrolling', async ({ page, mutations }) => {
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [{ id: 101, movieId: 1, title: 'A.Long.Release.'.repeat(12),
    movie: { id: 1, title: 'Example movie' }, status: 'completed', trackedDownloadState: 'importBlocked',
    downloadId: 'hash', outputPath: '/downloads/movie', errorMessage: 'Not enough storage space', added: '2026-01-01', size: 1e9, sizeleft: 0 }] } }));
  await page.goto('/downloads');
  for (const width of [320, 393, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.download-warning')).toBeVisible();
    await expect(page.locator('.download-warning')).toContainText('Not enough storage space');
    await expect(page.getByRole('button', { name: /^Manual import / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Remove / })).toBeVisible();
    const row = page.locator('.downloads-table tbody .v-data-table__tr');
    const geometry = await row.evaluate(el => ({ display: getComputedStyle(el).display, radius: getComputedStyle(el).borderRadius }));
    if (width < 600) { expect(geometry.display).toBe('grid'); expect(geometry.radius).toBe('12px'); }
    else {
      const tops = await row.evaluate(el => ['.download-heading', '.v-chip', '.download-progress', '.download-actions'].map(selector => el.querySelector(selector)!.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      const actionButtons = await row.locator('.download-actions .v-btn').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().right));
      expect(Math.max(...actionButtons) - Math.min(...actionButtons)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.downloads-table .v-table__wrapper').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 393 || width === 1440) await page.screenshot({ path: `/tmp/flix-downloads-layout-${test.info().project.name}-${width}.png`, fullPage: true });
  }
  expect(mutations).toEqual([]);
});
