import { test, expect } from './fixtures';

for (const locale of ['en-US', 'fr-FR']) {
  test.describe(locale, () => {
    test.use({ locale });
    test('season headers count downloaded and missing episodes with localized plurals', async ({ page, mutations }, testInfo) => {
      await page.route(/\/api\/v3\/episode\?/, route => route.fulfill({ json: [
        { id: 21, seriesId: 2, seasonNumber: 1, episodeNumber: 1, title: 'Downloaded pilot', hasFile: true, episodeFile: { size: 2e9 } },
        { id: 22, seriesId: 2, seasonNumber: 1, episodeNumber: 2, title: 'Missing episode', hasFile: false },
        { id: 31, seriesId: 2, seasonNumber: 2, episodeNumber: 1, title: 'Single episode', hasFile: false },
      ] }));
      await page.goto('/library');
      await page.getByRole('button', { name: locale === 'fr-FR' ? 'Séries (1)' : 'Series (1)', exact: true }).click();
      await page.locator('.media-card').click();
      const dialog = page.locator('.v-dialog');
      const body = dialog.locator('.dialog-flex-text');
      await expect(dialog.locator('.v-expansion-panel')).toHaveCount(2);
      await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const first = dialog.locator('.v-expansion-panel-title').filter({ hasText: locale === 'fr-FR' ? 'Saison 1' : 'Season 1' });
      const second = dialog.locator('.v-expansion-panel-title').filter({ hasText: locale === 'fr-FR' ? 'Saison 2' : 'Season 2' });
      await expect(first).toContainText(locale === 'fr-FR' ? '2 épisodes' : '2 episodes');
      await expect(first.getByRole('textbox', { name: locale === 'fr-FR' ? 'Taille (Go)' : 'Size (GB)', exact: true })).toHaveValue(locale === 'fr-FR' ? '2,00' : '2.00');
      await expect(second).toContainText(locale === 'fr-FR' ? '1 épisode' : '1 episode');
      await expect(first).toBeInViewport();
      expect(await first.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('season-episode-count.png') });
      await first.click();
      await expect(dialog.getByText('Missing episode', { exact: true })).toBeVisible();
      expect(mutations).toEqual([]);
    });
  });
}
