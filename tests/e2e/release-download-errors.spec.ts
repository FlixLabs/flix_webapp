import { test, expect, movie, series } from './fixtures';

for (const type of ['movies', 'series']) {
  test(`${type}: choosing another release clears the previous provider failure before confirming`, async ({ page, mutations }) => {
    const media = type === 'movies' ? movie : series;
    await page.route('**/api/v3/release?*', route => route.fulfill({ json: [
      { guid: 'same-guid', indexerId: 7, title: 'Unavailable provider release', downloadAllowed: true },
      { guid: 'same-guid', indexerId: 9, title: 'Working provider release', downloadAllowed: true },
    ] }));
    await page.route(/\/api\/v3\/release$/, route => {
      const body = route.request().postDataJSON();
      mutations.push({ method: 'POST', path: '/api/v3/release', body });
      return route.fulfill({ status: body.indexerId === 7 ? 503 : 200, json: {} });
    });
    await page.goto('/library');
    if (type === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: `Open ${media.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const releases = page.getByRole('dialog', { name: `Choose Release - ${media.title}`, exact: true });
    await releases.getByRole('button', { name: 'Choose Unavailable provider release', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Download this release?', exact: true });
    await confirmation.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(confirmation.getByRole('alert')).toContainText('Unable to download this release');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await releases.getByRole('button', { name: 'Choose Working provider release', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('alert')).toHaveCount(0);
    expect(mutations.filter(item => item.path === '/api/v3/release')).toHaveLength(1);
    await confirmation.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(releases).toBeHidden();
    await expect(page.getByText('Unable to download this release', { exact: false })).toHaveCount(0);
    expect(mutations.filter(item => item.path === '/api/v3/release').map(item => (item.body as { indexerId: number }).indexerId)).toEqual([7, 9]);
  });
}
