import { test, expect, movie } from './fixtures';

for (const locale of ['en-US', 'fr-FR']) {
  test.describe(locale, () => {
    test.use({ locale });
    test('unparsed movie release requires explicit association and preserves identity', async ({ page, mutations }) => {
      const french = locale === 'fr-FR';
      const title = "Vol.au-dessus.d'un.nid.de.coucou.MULTI.1080p.AC3.x264-mHDgz";
      await page.route('**/api/v3/release?*', route => route.fulfill({ json: [
        { guid: 'unparsed', indexerId: 7, title, downloadAllowed: false, rejections: ['Unable to parse release'] },
        { guid: 'other', indexerId: 7, title: 'Other blocked release', downloadAllowed: false, rejections: ['Unknown Movie'] },
      ] }));
      await page.goto('/library');
      await page.getByRole('button', { name: `${french ? 'Ouvrir' : 'Open'} ${movie.title}`, exact: true }).click();
      await page.getByRole('button', { name: french ? 'Choisir une release' : 'Choose Release', exact: true }).click();
      const releases = page.getByRole('dialog', { name: french ? new RegExp(`^Choisir une release . ${movie.title}$`) : `Choose Release - ${movie.title}`, exact: true });
      await expect(releases.getByRole('button', { name: `${french ? 'Choisir' : 'Choose'} Other blocked release`, exact: true })).toBeDisabled();
      const associate = releases.getByRole('button', { name: french ? `Associer ${title} à ce film` : `Associate ${title} with this movie`, exact: true });
      await associate.click();
      const confirmation = page.getByRole('dialog', { name: french ? 'Télécharger cette release ?' : 'Download this release?', exact: true });
      await expect(confirmation).toContainText(movie.title);
      await expect(confirmation).toContainText(title);
      expect(mutations).toEqual([]);
      await confirmation.getByRole('button', { name: french ? 'Annuler' : 'Cancel', exact: true }).click();
      expect(mutations).toEqual([]);
      await associate.click();
      await confirmation.getByRole('button', { name: french ? 'Associer et télécharger' : 'Associate and download', exact: true }).click();
      await expect.poll(() => mutations.length).toBe(1);
      expect(mutations[0]).toMatchObject({ method: 'POST', path: '/api/v3/release', body: { guid: 'unparsed', indexerId: 7, movieId: movie.id } });
      await expect(confirmation).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
