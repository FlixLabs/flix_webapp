import { createHash } from 'node:crypto';
import { test, expect } from './fixtures';

const release = 'Example.Movie.2026.1080p.Bluray.Long.Release.Title';
const serviceError = 'Not enough storage space on the destination volume';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

for (const locale of ['en-GB', 'fr-FR']) {
  test.describe(locale, () => {
    test.use({ locale });
    const french = locale === 'fr-FR';

    test('status chips wrap without clipping and prioritize service errors over filenames', async ({ page, mutations }) => {
      const service = hash(JSON.stringify(['movies', 'http://radarr.test', 'test-only']));
      await page.addInitScript(entry => {
        sessionStorage.setItem('flix:manual-imports:v1', JSON.stringify([entry]));
      }, {
        key: `${service}:77`, service, download: hash('blocked-download'), type: 'movies',
        title: 'Tracked import', commandId: 77, status: 'unknown', createdAt: Date.now(),
        error: 'Unable to check the import status. The command may still be running.',
      });
      await page.route('**/api/v3/command/77', route => route.fulfill({ status: 503, json: {} }));
      await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: 1, records: [{
        id: 101, title: release, downloadId: 'blocked-download', status: 'completed',
        trackedDownloadState: 'importBlocked', trackedDownloadStatus: 'warning',
        statusMessages: [
          { title: release, messages: [serviceError, 'Permission denied'] },
          { title: release, messages: [serviceError] },
        ],
        size: 100, sizeleft: 0, added: '2026-01-01', downloadClient: 'Example client',
      }] } }));
      await page.goto('/downloads');
      const row = page.locator('.downloads-table tbody tr').first();
      const status = row.locator('.download-status');
      await expect(status.locator('.download-warning')).toHaveText(serviceError);
      await expect(status).not.toContainText(release);
      await expect(status.locator('.download-status-chip')).toHaveText([
        french ? 'Importation à vérifier' : 'Import needs attention',
        french ? 'Import manuel : Statut indisponible' : 'Manual import: Status unavailable',
      ]);

      for (const width of [1440, 1024, 960, 768, 393, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const chips = status.locator('.download-status-chip');
        await expect(chips).toHaveCount(2);
        for (const chip of await chips.all()) {
          await expect(chip).toBeVisible();
          const geometry = await chip.evaluate(element => {
            const content = element.querySelector('.v-chip__content')!;
            const bounds = element.getBoundingClientRect();
            const cell = element.closest('td')!.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(content);
            const lines = Array.from(range.getClientRects());
            return {
              fitsContent: content.scrollWidth <= content.clientWidth + 1 && content.scrollHeight <= content.clientHeight + 1,
              fitsCell: bounds.left >= cell.left - 1 && bounds.right <= cell.right + 1,
              fitsText: lines.every(line => line.left >= bounds.left - 1 && line.right <= bounds.right + 1
                && line.top >= bounds.top - 1 && line.bottom <= bounds.bottom + 1),
            };
          });
          expect(geometry, `chip geometry at ${width}px`).toEqual({ fitsContent: true, fitsCell: true, fitsText: true });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('.downloads-table .v-table__wrapper').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width === 1440 || width === 393) await page.screenshot({ path: `/tmp/flix-download-status-${locale}-${test.info().project.name}-${width}.png`, fullPage: true });
      }

      const actions = row.locator('.download-actions');
      await expect(actions.locator('button')).toHaveCount(2);
      expect(await actions.evaluate(el => Array.from(el.children).every(child => child.tagName === 'BUTTON'))).toBe(true);
      await expect(actions.locator('button').last()).toBeEnabled();
      await row.locator('summary').click();
      const details = row.locator('details');
      await expect(details.getByText(release, { exact: true })).toHaveCount(1);
      await expect(details.getByText(serviceError, { exact: true })).toHaveCount(1);
      await expect(details.getByText('Permission denied', { exact: true })).toBeVisible();
      await expect(details.getByText('Example client', { exact: true })).toBeVisible();
      expect(mutations).toEqual([]);
    });

    test('protection reasons appear once in Status while Actions contain only guarded buttons', async ({ page, mutations }) => {
      const scenarios = [
        { title: 'Pending download', state: 'importPending', reason: french ? 'Import automatique en attente ; suppression protégée.' : 'Automatic import pending; removal is protected.' },
        { title: 'Importing download', state: 'importing', reason: french ? 'Import en cours' : 'Import in progress' },
        { title: 'Unknown download', state: 'unknown', reason: french ? 'Statut de l’import indisponible' : 'Import status unavailable' },
        { title: 'Rejected extension', state: 'importPending', messages: ["Invalid video file, unsupported extension: '.bad'"], reason: french ? 'Import automatique rejeté : extension de fichier non prise en charge. La suppression reste protégée.' : 'Automatic import rejected: unsupported file extension. Removal remains protected.' },
        { title: 'Rejected import', state: 'importPending', messages: ['Unable to parse file'], reason: french ? 'Import automatique refusé ; vérification manuelle disponible. La suppression reste protégée.' : 'Automatic import rejected; manual review is available. Removal remains protected.' },
      ];
      await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { totalRecords: scenarios.length, records: scenarios.map((scenario, index) => ({
        id: 101 + index, title: scenario.title, downloadId: `protected-${index}`, status: 'completed',
        trackedDownloadState: scenario.state, trackedDownloadStatus: scenario.messages ? 'warning' : 'ok',
        statusMessages: scenario.messages ? [{ title: scenario.title, messages: scenario.messages }] : [],
      })) } }));
      await page.goto('/downloads');
      for (const scenario of scenarios) {
        const row = page.locator('.downloads-table tbody tr').filter({ has: page.locator('.download-title', { hasText: scenario.title }) });
        const status = row.locator('.download-status');
        await expect(status.getByText(scenario.reason, { exact: true })).toBeVisible();
        await expect(row.getByText(scenario.reason, { exact: true })).toHaveCount(1);
        const actions = row.locator('.download-actions');
        expect(await actions.evaluate(el => Array.from(el.childNodes).every(child =>
          child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()))).toBe(true);
        expect(await actions.evaluate(el => Array.from(el.children).every(child => child.tagName === 'BUTTON'))).toBe(true);
        await expect(actions.locator('button').last()).toBeDisabled();
        await expect(actions.locator('button')).toHaveCount(scenario.title === 'Rejected import' ? 2 : 1);
      }
      const pendingStatus = page.locator('.download-status').first();
      await expect(pendingStatus.locator('.download-status-chip')).toHaveText(french ? 'Téléchargement terminé' : 'Download complete');
      await expect(pendingStatus.getByText(french ? 'Terminé' : 'Completed', { exact: true })).toHaveCount(0);
      expect(mutations).toEqual([]);
    });
  });
}
