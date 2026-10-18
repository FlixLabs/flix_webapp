import { test, expect, movie, series, releaseTitle } from './fixtures';

for (const locale of ['en-US', 'fr-FR']) {
  test.describe(locale, () => {
    test.use({ locale });
    for (const mediaType of ['movies', 'series']) {
      test(`${mediaType} releases open source details without choosing or downloading`, async ({ page, context, mutations }) => {
        const french = locale === 'fr-FR';
        const media = mediaType === 'movies' ? movie : series;
        const source = 'https://indexer.example.test/details/42';
        await page.route('**/api/v3/release?*', route => route.fulfill({ json: [
          { guid: 'first', indexerId: 7, title: releaseTitle, infoUrl: source, downloadUrl: 'https://indexer.example.test/download/42', downloadAllowed: true },
          { guid: 'https://indexer.example.test/guid/42', indexerId: 7, title: 'No details', downloadUrl: 'https://indexer.example.test/download/42' },
          { guid: 'unsafe', indexerId: 7, title: 'Unsafe details', infoUrl: 'javascript:alert(1)' },
        ] }));
        await context.route('https://indexer.example.test/**', route => {
          expect(route.request().url()).toBe(source);
          expect(route.request().headers().authorization).toBeUndefined();
          expect(route.request().headers().referer).toBeUndefined();
          return route.fulfill({ contentType: 'text/html', body: '<h1>Source details</h1>' });
        });
        await page.goto('/library');
        if (mediaType === 'series') await page.getByRole('button', { name: french ? 'Séries (1)' : 'Series (1)', exact: true }).click();
        await page.getByRole('button', { name: `${french ? 'Ouvrir' : 'Open'} ${media.title}`, exact: true }).click();
        await page.getByRole('button', { name: french ? 'Choisir une release' : 'Choose Release', exact: true }).click();
        const dialog = page.locator('.v-dialog').last();
        const link = dialog.getByRole('link', { name: `${french ? 'Voir la fiche source de' : 'View source page for'} ${releaseTitle}`, exact: true });
        await expect(link).toHaveAttribute('href', source);
        await expect(dialog.getByRole('link')).toHaveCount(1);
        const popupPromise = page.waitForEvent('popup');
        await link.click();
        const popup = await popupPromise;
        await expect(popup.getByRole('heading', { name: 'Source details' })).toBeVisible();
        expect(await popup.evaluate(() => window.opener === null)).toBe(true);
        await popup.close();
        await expect(link).toBeVisible();
        expect(mutations).toEqual([]);
      });
    }
  });
}
