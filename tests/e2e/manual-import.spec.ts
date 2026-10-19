import { test, expect, movie, series } from './fixtures';
import type { Page } from '@playwright/test';

const filename = 'Example.Movie.2025.720p.mkv';
const candidate = { id: 8, path: `/downloads/example/${filename}`, relativePath: filename, size: 2e9,
  movie, series, episodes: [{ id: 21, seasonNumber: 1, episodeNumber: 1, title: 'Pilot' }],
  quality: { quality: { id: 4, name: 'HDTV-720p' }, revision: { version: 1, real: 0, isRepack: 0 } },
  languages: [{ id: 1, name: 'English' }], rejections: [{ reason: 'Not an upgrade for existing file' }],
};
async function mockImport(page: Page, mutations: { method: string; path: string; body: unknown }[], reviewStatus = 200, command = { status: 'completed' }) {
  await page.route(/\/api\/v3\/queue\?/, route => route.fulfill({ json: { records: [{ id: 101, title: 'Completed download',
    downloadId: 'download-1', outputPath: '/downloads/example', status: 'completed', trackedDownloadState: 'importBlocked',
    size: 2e9, sizeleft: 0, languages: [], statusMessages: [{ title: 'Unable to import automatically', messages: ['Not an upgrade for existing file'] }],
  }] } }));
  await page.route(/\/api\/v3\/manualimport(?:\?|$)/, route => {
    if (route.request().method() === 'POST') {
      mutations.push({ method: 'POST', path: '/api/v3/manualimport', body: route.request().postDataJSON() });
      return route.fulfill({ status: reviewStatus, json: [candidate] });
    }
    return route.fulfill({ json: [candidate] });
  });
  await page.route(/\/api\/v3\/qualitydefinition$/, route => route.fulfill({ json: [{ quality: candidate.quality.quality }] }));
  await page.route(/\/api\/v3\/command(?:\/99)?$/, route => {
    if (route.request().method() === 'POST') {
      mutations.push({ method: 'POST', path: '/api/v3/command', body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: 99, status: 'queued' } });
    }
    return route.fulfill({ json: { id: 99, status: command.status } });
  });
}

test('manual import reviews rejected files and requires explicit confirmation before replacing', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await expect(page.getByText('Manual import can replace an existing file', { exact: false })).toBeVisible();
  const review = page.getByRole('button', { name: 'Review Import (0)', exact: true });
  await expect(review).toBeDisabled();
  expect(mutations).toEqual([]);
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toHaveClass(/text-warning/);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveClass(/text-on-surface/);
  expect(mutations.map(item => item.path)).toEqual(['/api/v3/manualimport']);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import completed', { exact: true })).toBeVisible();
  const commands = mutations.filter(item => item.path === '/api/v3/command');
  expect(commands).toHaveLength(1);
  expect(commands[0]!.body).toMatchObject({ name: 'ManualImport', importMode: 'auto', files: [{ path: candidate.path, movieId: movie.id, downloadId: 'download-1' }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('manual import is not offered for an active download', async ({ page, mutations }) => {
  await page.goto('/downloads');
  await expect(page.getByText('Download example', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Manual import / })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('a failed review never sends an import command', async ({ page, mutations }) => {
  await mockImport(page, mutations, 500);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect(page.getByText('Unable to review the selected files. No import was requested.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toHaveCount(0);
  expect(mutations.map(item => item.path)).toEqual(['/api/v3/manualimport']);
});

test('Sonarr imports only the selected episode associations', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Episodes', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import completed', { exact: true })).toBeVisible();
  const command = mutations.find(item => item.path === '/api/v3/command');
  expect(command?.body).toMatchObject({ files: [{ seriesId: series.id, episodeIds: [21] }] });
});

test('accepted imports remain visible after closing and reloading without resubmission', async ({ page, mutations }, testInfo) => {
  const command = { status: 'started' };
  await mockImport(page, mutations, 200, command);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import launched', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true })).not.toBeVisible();
  const activity = page.locator('.v-card').filter({ has: page.getByText('Manual imports', { exact: true }) });
  await expect(activity.getByText('Importing', { exact: true })).toBeVisible();
  await expect(page.getByText('Manual import: Importing', { exact: true })).toBeVisible();
  await activity.screenshot({ path: testInfo.outputPath('manual-import-tracking.png') });
  const stored = await page.evaluate(() => sessionStorage.getItem('flix:manual-imports:v1'));
  expect(stored).not.toContain('/downloads/example');
  expect(stored).not.toContain('test-only');
  await page.reload();
  await expect(activity.getByText('Importing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true });
  await expect(dialog.getByText('Import launched', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Review Import/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  command.status = 'failed';
  await activity.getByRole('button', { name: 'Check import status for Completed download', exact: true }).click();
  await expect(activity.getByText('Failed', { exact: true })).toBeVisible();
  command.status = 'completed';
  await activity.getByRole('button', { name: 'Check import status for Completed download', exact: true }).click();
  await expect(activity.getByText('Completed', { exact: true })).toBeVisible();
  expect(mutations.filter(item => item.path === '/api/v3/command')).toHaveLength(1);
  await activity.getByRole('button', { name: 'Dismiss import status for Completed download', exact: true }).click();
  await expect(activity).not.toBeVisible();
});
