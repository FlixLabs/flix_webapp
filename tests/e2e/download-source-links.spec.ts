import { test, expect } from './fixtures';

test('downloads retain source links when blocked, for movies and series', async ({ page, mutations }) => {
  const lookups: string[] = [];
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [
    { id: 101, downloadId: 'abc', title: 'Blocked release', status: 'completed', trackedDownloadState: 'importBlocked', trackedDownloadStatus: 'warning', size: 100, sizeleft: 0 },
    { id: 102, downloadId: 'missing', title: 'No source', status: 'downloading' },
  ] } }));
  await page.route('**/api/v3/history?*', route => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('downloadId');
    if (id) lookups.push(`${url.hostname}:${id}`);
    return route.fulfill({ json: { records: id === 'abc' ? [
      { downloadId: 'wrong', eventType: 'grabbed', data: { nzbInfoUrl: 'https://wrong.test/details' } },
      { downloadId: id, eventType: 'grabbed', data: { indexer: 'Ygg', nzbInfoUrl: `https://indexer.test/${url.hostname}/42` } },
    ] : [] } });
  });
  await page.goto('/downloads');
  for (const host of ['radarr.test', 'sonarr.test']) {
    if (host === 'sonarr.test') await page.getByRole('button', { name: /^Series/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'Blocked release' });
    await expect(row).toContainText('Import needs attention');
    const link = row.getByRole('link', { name: 'View source page for Blocked release' });
    await expect(row.locator('.download-origin')).toHaveText(/Indexer:\s*Ygg/);
    await expect(link).toContainText('Ygg');
    await expect(link).toHaveAttribute('href', `https://indexer.test/${host}/42`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('row').filter({ hasText: 'No source' }).getByRole('link')).toHaveCount(0);
  }
  expect(lookups.filter(value => value.endsWith(':abc'))).toHaveLength(2);
  expect(mutations).toEqual([]);
});

test('shows queue and history indexers without expanding details or requiring a source link', async ({ page, mutations }) => {
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [
    { id: 101, title: 'Known origin', indexer: 'Torrent9', status: 'downloading' },
    { id: 102, title: 'Unknown origin', status: 'downloading' },
  ] } }));
  await page.route('**/api/v3/history?*', route => route.fulfill({ json: { records: [
    { id: 55, sourceTitle: 'History origin', eventType: 'grabbed', data: { indexer: 'Ygg', nzbInfoUrl: 'javascript:alert(1)' } },
    { id: 56, sourceTitle: 'Domain origin', eventType: 'grabbed', data: { nzbInfoUrl: 'https://indexer.test/details/56' } },
  ] } }));
  await page.goto('/downloads');
  const known = page.getByRole('row').filter({ has: page.getByText('Known origin', { exact: true }) });
  await expect(known.locator('.download-origin')).toHaveText(/Indexer:\s*Torrent9/);
  await expect(known.getByRole('link')).toHaveCount(0);
  await expect(known.locator('details')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('row').filter({ hasText: 'Unknown origin' }).locator('.download-origin')).toHaveText(/Indexer:\s*Unknown/);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('row').filter({ hasText: 'History origin' });
  await expect(history.locator('.download-origin')).toHaveText(/Indexer:\s*Ygg/);
  await expect(history.getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View source page for Domain origin' })).toContainText('indexer.test');
  expect(mutations).toEqual([]);
});

test('long source names wrap on small screens and remain plain text', async ({ page, mutations }) => {
  const indexer = '<script>alert(1)</script>' + 'LongIndexerName'.repeat(20);
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [
    { id: 101, title: 'Long origin', indexer, status: 'downloading' },
  ] } }));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/downloads');
  const origin = page.locator('.download-origin');
  await expect(origin).toContainText(indexer);
  await expect(origin.locator('script')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('history uses its details URL without fetching by title', async ({ page, mutations }) => {
  await page.route('**/api/v3/history?*', route => route.fulfill({ json: { records: [
    { id: 55, sourceTitle: 'History source', eventType: 'grabbed', data: { nzbInfoUrl: 'https://indexer.test/history/55' } },
    { id: 56, sourceTitle: 'Unsafe source', eventType: 'grabbed', data: { nzbInfoUrl: 'javascript:alert(1)' } },
  ] } }));
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View source page for History source' })).toHaveAttribute('href', 'https://indexer.test/history/55');
  await expect(page.getByRole('link', { name: 'View source page for Unsafe source' })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
