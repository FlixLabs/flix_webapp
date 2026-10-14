import { test, expect, movie, series } from './fixtures';

test('queue media titles open canonical sheets on place and restore focus without changing filters', async ({ page, mutations }) => {
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [{ id: 101, movieId: 1, seriesId: 2, title: 'Download example', status: 'downloading', size: 100, sizeleft: 50, added: '2026-01-01' }] } }));
  await page.route('**/api/v3/movie/1', route => route.fulfill({ json: movie }));
  await page.route('**/api/v3/series/2', route => route.fulfill({ json: series }));
  await page.goto('/downloads');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Download example');
  const opener = page.getByRole('button', { name: 'Open media for Download example', exact: true });
  const row = page.getByRole('row').filter({ has: opener });
  await expect(row).toBeVisible();
  expect((await row.locator('td').nth(1).innerText()).match(/downloading/gi)).toHaveLength(1);
  await opener.click();
  const sheet = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await sheet.locator('.dialog-flex-text').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(sheet.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Movie.mkv');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Download example');
  expect(new URL(page.url()).pathname).toBe('/downloads');
  await page.getByRole('button', { name: /^Series/ }).click();
  await opener.click();
  await expect(page.getByRole('dialog', { name: `Series: ${series.title}`, exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('history titles also open the associated media and missing IDs stay plain text', async ({ page, mutations }) => {
  await page.route('**/api/v3/history?*', route => route.fulfill({ json: { records: [{ id: 55, movieId: 1, sourceTitle: 'History release', date: '2026-01-01', eventType: 'grabbed' }, { id: 56, sourceTitle: 'Unlinked release', date: '2026-01-01' }] } }));
  await page.route('**/api/v3/movie/1', route => route.fulfill({ json: movie }));
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open media for Unlinked release', exact: true })).toHaveCount(0);
  await expect(page.getByText('Unlinked release', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open media for History release', exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('unavailable media keeps the queue usable and retries inside the sheet', async ({ page, mutations }) => {
  let ready = false;
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [{ id: 101, movieId: 1, title: 'Release', status: 'completed', trackedDownloadState: 'importBlocked', added: '2026-01-01' }] } }));
  await page.route('**/api/v3/movie/1', route => ready ? route.fulfill({ json: movie }) : route.fulfill({ status: 404, json: {} }));
  await page.goto('/downloads');
  const opener = page.getByRole('button', { name: 'Open media for Release', exact: true });
  const row = page.getByRole('row').filter({ has: opener });
  await expect(row).toContainText('Import needs attention');
  await expect(row).toContainText('completed', { ignoreCase: true });
  await opener.click();
  await expect(page.getByText('This media is no longer available in the selected library.', { exact: false })).toBeVisible();
  ready = true;
  await page.getByRole('button', { name: 'Retry Download media', exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
