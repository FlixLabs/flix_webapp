import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const hash = 'a'.repeat(40);
const filename = 'Movie.2026-Groupe';
const review = { reviewId: 'b'.repeat(64), originalName: filename, proposedName: filename + '.mkv', format: 'matroska' };
async function setup(page: Page, outcome = 200, configured = true) {
  const calls: { action: string; body: unknown }[] = [];
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Test instance', has_download_clients: true,
    has_download_extension_repair: configured,
    radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }] }));
  await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{ id: 101, downloadId: hash,
    title: filename, status: 'completed', trackedDownloadState: 'importPending', trackedDownloadStatus: 'warning',
    size: 1024, sizeleft: 0, languages: [],
    statusMessages: [{ title: filename, messages: ["Invalid video file, unsupported extension: '.2026-Groupe'"] }] }] } }));
  await page.route('**/download-clients/*/extension-*', route => {
    const action = new URL(route.request().url()).pathname.endsWith('extension-review') ? 'review' : 'repair';
    calls.push({ action, body: route.request().postDataJSON() });
    return route.fulfill(action === 'review' ? { json: review } : outcome === 200
      ? { json: { status: 'renamed' } } : { status: outcome, json: { code: 'RENAME_UNCERTAIN' } });
  });
  await page.goto('/downloads');
  return { calls, open: () => page.getByRole('button', { name: `Correct file extension for ${filename}`, exact: true }).click(),
    dialog: page.getByRole('dialog', { name: 'Correct file extension', exact: true }) };
}
test('checks without renaming, keeps details during closing, and requires explicit confirmation', async ({ page, mutations }) => {
  const { calls, open, dialog } = await setup(page);
  await expect(page.getByText('Automatic import rejected: unsupported file extension. Removal remains protected.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Remove ${filename}`, exact: true })).toBeDisabled();
  await open();
  await expect(dialog.getByText(`Proposed filename: ${filename}.mkv`, { exact: true })).toBeVisible();
  expect(calls).toEqual([{ action: 'review', body: { mediaType: 'movies', downloadId: hash } }]);
  const retained = await dialog.getByRole('button', { name: 'Close', exact: true }).evaluate(async button => {
    const text = button.closest('.v-dialog')!.textContent;
    button.click(); await new Promise(resolve => requestAnimationFrame(resolve));
    return button.closest('.v-dialog')!.textContent === text;
  });
  expect(retained).toBe(true);
  await expect(dialog).not.toBeVisible();
  expect(calls).toHaveLength(1);
  await open();
  await dialog.getByRole('button', { name: 'Confirm rename', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Filename corrected in Deluge.');
  expect(calls.filter(call => call.action === 'repair')).toEqual([{ action: 'repair', body: { reviewId: review.reviewId } }]);
  await expect(dialog.getByRole('button', { name: 'Confirm rename', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
test('uncertain rename responses disable resubmission without retrying the write', async ({ page, mutations }) => {
  const { calls, open, dialog } = await setup(page, 502);
  await open();
  await dialog.getByRole('button', { name: 'Confirm rename', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No automatic retry was made.');
  await expect(dialog.getByRole('button', { name: 'Confirm rename', exact: true })).toHaveCount(0);
  expect(calls.filter(call => call.action === 'repair')).toHaveLength(1);
  expect(mutations).toEqual([]);
});
for (const [code, message] of [
  ['PATH_OUTSIDE_DOWNLOADS', 'The Deluge download path is outside downloads_root.'],
  ['FILE_IDENTITY_CHANGED', 'The file name, size or identity changed.'],
  ['FILE_EXTENSION_ALREADY_VALID', 'Deluge already reports a supported video extension. No file was renamed.'],
  ['TORRENT_IDENTITY_CHANGED', 'The torrent is missing, incomplete or present in multiple clients.'],
  ['REPAIR_VERIFICATION_UNAVAILABLE', 'Extension repair could not be verified.'],
  ['UNKNOWN_FUTURE_CODE', 'Extension repair could not be verified.'],
]) {
  test(`explains review refusal ${code} without offering or requesting a rename`, async ({ page, mutations }) => {
    const { calls, open, dialog } = await setup(page);
    let reviews = 0;
    await page.route('**/download-clients/*/extension-review', route => {
      reviews++;
      return route.fulfill({ status: 422, json: { code, error: 'Private backend details must not be displayed' } });
    });
    await open();
    await expect(dialog.getByRole('alert')).toContainText(message);
    await expect(dialog).not.toContainText('Private backend details');
    await expect(dialog.getByRole('button', { name: 'Confirm rename', exact: true })).toHaveCount(0);
    expect(reviews).toBe(1);
    expect(calls).toEqual([]);
    expect(mutations).toEqual([]);
  });
}
test('handles a non-JSON review error without exposing its body or requesting a rename', async ({ page, mutations }) => {
  const { calls, open, dialog } = await setup(page);
  await page.route('**/download-clients/*/extension-review', route => route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Private proxy details</h1>' }));
  await open();
  await expect(dialog.getByRole('alert')).toContainText('Extension repair could not be verified.');
  await expect(dialog).not.toContainText('Private proxy details');
  await expect(dialog.getByRole('button', { name: 'Confirm rename', exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(mutations).toEqual([]);
});
for (const locale of ['en-US', 'fr-FR']) {
  test.describe(`extension action layout ${locale}`, () => {
    test.use({ locale });
    test('keeps the full action label inside its button and table cell at every breakpoint', async ({ page, mutations }) => {
      const { calls } = await setup(page);
      const button = page.getByRole('button', { name: locale === 'fr-FR'
        ? `Corriger l’extension du fichier pour ${filename}` : `Correct file extension for ${filename}`, exact: true });
      for (const width of [1440, 1024, 768, 600, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(button).toBeVisible();
        await expect.poll(() => button.evaluate(element => {
          const label = element.querySelector('.v-btn__content');
          const parent = element.closest('td');
          if (!element.isConnected || !label || !parent) return false;
          const range = document.createRange(); range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          const cell = parent.getBoundingClientRect();
          return text.left >= bounds.left && text.right <= bounds.right
            && text.top >= bounds.top && text.bottom <= bounds.bottom
            && bounds.left >= cell.left && bounds.right <= cell.right
            && document.documentElement.scrollWidth <= window.innerWidth;
        })).toBe(true);
      }
      expect(calls).toEqual([]);
      expect(mutations).toEqual([]);
    });
  });
}
test('older or unconfigured API instances do not offer extension repair', async ({ page, mutations }) => {
  const { calls } = await setup(page, 200, false);
  await expect(page.getByText('Automatic import rejected: unsupported file extension. Removal remains protected.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Correct file extension for ${filename}`, exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(mutations).toEqual([]);
});

test.describe('French extension repair', () => {
  test.use({ locale: 'fr-FR' });
  test('explains an incorrect downloads_root mapping in French without renaming', async ({ page, mutations }) => {
    const { calls } = await setup(page);
    await page.route('**/download-clients/*/extension-review', route => route.fulfill({ status: 422, json: { code: 'PATH_OUTSIDE_DOWNLOADS' } }));
    await page.getByRole('button', { name: `Corriger l’extension du fichier pour ${filename}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Corriger l’extension du fichier', exact: true });
    await expect(dialog.getByRole('alert')).toContainText('Le chemin de téléchargement Deluge est en dehors de downloads_root.');
    await expect(dialog.getByRole('button', { name: 'Confirmer le renommage', exact: true })).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(mutations).toEqual([]);
  });
  test('translates verification, confirmation and successful rename', async ({ page, mutations }) => {
    const { calls } = await setup(page);
    await page.getByRole('button', { name: `Corriger l’extension du fichier pour ${filename}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Corriger l’extension du fichier', exact: true });
    await expect(dialog.getByText(`Nom proposé pour le fichier: ${filename}.mkv`, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirmer le renommage', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Nom de fichier corrigé dans Deluge.');
    expect(calls.filter(call => call.action === 'repair')).toHaveLength(1);
    expect(mutations).toEqual([]);
  });
});
