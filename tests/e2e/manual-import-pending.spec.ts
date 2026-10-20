import { test, expect, movie, series } from './fixtures';

for (const type of ['movies', 'series']) {
  for (const state of ['importPending', 'importing', 'imported', 'unknown', undefined, 'importBlocked', 'importFailed']) {
    const eligible = state === 'importBlocked' || state === 'importFailed';
    test(`${type} ${state ?? 'missing state'} ${eligible ? 'allows' : 'blocks'} manual import`, async ({ page, mutations }) => {
      let inspections = 0;
      await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{
        id: 101, title: 'Completed download', downloadId: 'download-1', status: 'completed', trackedDownloadState: state,
        trackedDownloadStatus: 'warning', errorMessage: 'Service warning',
      }] } }));
      await page.route('**/api/v3/command', route => route.fulfill({ json: [] }));
      await page.route('**/api/v3/manualimport?*', route => {
        inspections++;
        return route.fulfill({ json: [{ id: 1, path: '/downloads/File.mkv', movie, series,
          quality: { quality: { id: 4, name: 'HDTV-720p' } }, languages: [{ id: 1, name: 'English' }], episodes: [],
        }] });
      });
      await page.route('**/api/v3/qualitydefinition', route => route.fulfill({ json: [{ quality: { id: 4, name: 'HDTV-720p' } }] }));
      await page.route('**/api/v3/language', route => route.fulfill({ json: [{ id: 1, name: 'English' }] }));
      await page.goto('/downloads');
      if (type === 'series') await page.getByRole('button', { name: /^Series/ }).click();
      await expect(page.getByText('Completed download', { exact: true }).first()).toBeVisible();
      const button = page.getByRole('button', { name: 'Manual import Completed download', exact: true });
      if (eligible) {
        await button.click();
        await expect(page.getByRole('checkbox', { name: 'Select /downloads/File.mkv', exact: true })).toBeVisible();
        expect(inspections).toBe(1);
      } else {
        await expect(button).toHaveCount(0);
        expect(inspections).toBe(0);
      }
      expect(mutations).toEqual([]);
    });
  }
}
