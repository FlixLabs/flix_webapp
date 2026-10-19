import { test, expect, movie, series } from './fixtures';

for (const mediaType of ['movies', 'series']) {
  test(`${mediaType} release lists default to 25 items and retain filtering`, async ({ page, mutations }) => {
    const media = mediaType === 'movies' ? movie : series;
    await page.route('**/api/v3/release?*', route => route.fulfill({ json: Array.from({ length: 30 }, (_, i) => ({
      guid: `release-${i + 1}`, indexerId: 7, title: `Release ${i + 1}`, downloadAllowed: true,
    })) }));
    await page.goto('/library');
    if (mediaType === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: `Open ${media.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Choose Release - ${media.title}`, exact: true });
    await expect(dialog.getByRole('button', { name: /^Choose Release \d+$/ })).toHaveCount(25);
    await expect(dialog.getByRole('button', { name: 'Choose Release 25', exact: true })).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Choose Release 26', exact: true })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Filter releases', exact: true }).fill('Release 30');
    await expect(dialog.getByRole('button', { name: /^Choose Release \d+$/ })).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Choose Release 30', exact: true })).toHaveCount(1);
    expect(mutations).toEqual([]);
  });
}
