import { test, expect } from './fixtures';

for (const type of ['movies', 'series']) {
  for (const scenario of ['queue', 'command', 'unavailable']) {
    test(`${type} removal rechecks ${scenario} imports after the confirmation opens`, async ({ page, mutations }) => {
      let changed = false;
      await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{
        id: 101, downloadId: 'test-download', title: 'Protected download', status: 'completed', size: 100, sizeleft: 0,
        trackedDownloadState: changed && scenario === 'queue' ? 'importing' : 'importBlocked',
      }] } }));
      await page.route('**/api/v3/command', route => route.fulfill(scenario === 'unavailable'
        ? { status: 503, json: {} }
        : { json: changed && scenario === 'command' ? [{ name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: 'test-download' }] } }] : [] }));
      await page.goto('/downloads');
      if (type === 'series') await page.getByRole('button', { name: /^Series/ }).click();
      await page.getByRole('button', { name: 'Remove Protected download', exact: true }).click();
      changed = true;
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      const reason = scenario === 'queue' ? 'Import in progress' : scenario === 'command' ? 'Import queued' : 'Import status unavailable';
      await expect(page.getByRole('alert').filter({ hasText: `${reason}. Removal is blocked` })).toBeVisible();
      expect(mutations.filter(item => item.method === 'DELETE')).toEqual([]);
    });
  }
}

test('known active imports disable the queue removal action immediately', async ({ page, mutations }) => {
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{
    id: 101, downloadId: 'test-download', title: 'Importing download', status: 'completed', trackedDownloadState: 'importing',
  }] } }));
  await page.goto('/downloads');
  await expect(page.getByRole('button', { name: 'Remove Importing download', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
});
