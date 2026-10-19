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
      { downloadId: id, eventType: 'grabbed', data: { nzbInfoUrl: `https://indexer.test/${url.hostname}/42` } },
    ] : [] } });
  });
  await page.goto('/downloads');
  for (const host of ['radarr.test', 'sonarr.test']) {
    if (host === 'sonarr.test') await page.getByRole('button', { name: /^Series/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'Blocked release' });
    await expect(row).toContainText('Import needs attention');
    const link = row.getByRole('link', { name: 'View source page for Blocked release' });
    await expect(link).toHaveAttribute('href', `https://indexer.test/${host}/42`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('row').filter({ hasText: 'No source' }).getByRole('link')).toHaveCount(0);
  }
  expect(lookups.filter(value => value.endsWith(':abc'))).toHaveLength(2);
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
