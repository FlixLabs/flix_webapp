import { test, expect, movie, series } from './fixtures';

for (const type of ['movies', 'series']) {
  test(`${type} pending automatic import still permits manual review without an active command`, async ({ page, mutations }) => {
    await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{
      id: 101, title: 'Pending download', downloadId: 'pending-id', status: 'completed', trackedDownloadState: 'importPending',
      trackedDownloadStatus: 'warning', errorMessage: 'No eligible files',
    }] } }));
    await page.route('**/api/v3/command', route => route.fulfill({ json: [] }));
    await page.route('**/api/v3/manualimport?*', route => route.fulfill({ json: [{ id: 1, path: '/downloads/File.mkv', movie, series,
      quality: { quality: { id: 4, name: 'HDTV-720p' } }, languages: [{ id: 1, name: 'English' }], episodes: [],
    }] }));
    await page.route('**/api/v3/qualitydefinition', route => route.fulfill({ json: [{ quality: { id: 4, name: 'HDTV-720p' } }] }));
    await page.route('**/api/v3/language', route => route.fulfill({ json: [{ id: 1, name: 'English' }] }));
    await page.goto('/downloads');
    if (type === 'series') await page.getByRole('button', { name: /^Series/ }).click();
    await expect(page.getByRole('button', { name: 'Remove Pending download', exact: true })).toBeDisabled();
    await expect(page.getByText('Automatic import pending; removal is protected.', { exact: true })).toBeVisible();
    await expect(page.getByText('Import queued', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Manual import Pending download', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Select /downloads/File.mkv', exact: true })).toBeVisible();
    expect(mutations).toEqual([]);
  });
}
