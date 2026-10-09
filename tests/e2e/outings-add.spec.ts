import { test, expect } from './fixtures';

for (const media of ['movies', 'series'] as const) {
  test(`outings can add ${media} with a previously selected instance`, async ({ page, mutations }) => {
    await page.addInitScript(() => localStorage.setItem('flix.preferences.instance', JSON.stringify('Test instance')));
    await page.route(/\/(upcoming|on_the_air)\?/, route => {
      const isMovie = new URL(route.request().url()).pathname.endsWith('/upcoming');
      return route.fulfill({ json: { results: [{
        id: isMovie ? 100 : 200, title: 'Upcoming movie', name: 'Upcoming series',
        release_date: '2026-10-20', first_air_date: '2026-10-20',
      }], total_pages: 1 } });
    });
    await page.route(/\/tv\/200\/external_ids\?/, route => route.fulfill({ json: { tvdb_id: 300 } }));
    await page.route(/\/tv\/200\?/, route => route.fulfill({ json: { seasons: [] } }));
    await page.goto('/outings');
    if (media === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.locator('.media-card').click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Choose quality', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Quality' })).toHaveValue('Any');
    expect(mutations).toEqual([]);
    if (media === 'series') {
      await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
        .some(entry => entry.name.includes('/tv/200/external_ids')))).toBe(true);
    }
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0]).toMatchObject({ method: 'POST', path: `/api/v3/${media === 'movies' ? 'movie' : 'series'}`,
      body: { qualityProfileId: 1, rootFolderPath: media === 'movies' ? '/movies' : '/tv',
        ...(media === 'movies' ? { tmdbId: 100 } : { tvdbId: 300 }) } });
  });
}
