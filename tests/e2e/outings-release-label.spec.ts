import { test, expect, movie, series } from './fixtures';

test('outings keeps release and premiere dates after library enrichment', async ({ page, mutations }) => {
  await page.route(/\/(upcoming|on_the_air)\?/, route => {
    const isMovie = new URL(route.request().url()).pathname.endsWith('/upcoming');
    return route.fulfill({ json: {
      results: [{
        id: isMovie ? movie.tmdbId : series.tmdbId,
        title: movie.title, name: series.title,
        release_date: '2026-10-09', first_air_date: '2026-10-10',
      }], total_pages: 1,
    } });
  });
  await page.goto('/outings');
  const card = page.locator('.media-card');
  // Library enrichment adds status and the year that previously hid the date.
  await expect(card).toContainText('Released');
  await expect(card.locator('.media-date')).toHaveText('Release 2026-10-09');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await expect(card).toContainText('Continuing');
  await expect(card.locator('.media-date')).toHaveText('Premiere 2026-10-10');
  await page.goto('/library');
  await expect(page.locator('.media-card .media-date')).toHaveText('2025');
  expect(mutations).toEqual([]);
});

test('outings handles invalid library data without losing the TMDB cards', async ({ page, mutations }) => {
  await page.route(/\/upcoming\?/, route => route.fulfill({ json: {
    results: [{ id: movie.tmdbId, title: movie.title, release_date: '2026-10-09' }], total_pages: 1,
  } }));
  await page.route(/\/on_the_air\?/, route => route.fulfill({ json: { results: [], total_pages: 1 } }));
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: { error: 'Unavailable' } }));
  await page.goto('/outings');
  await expect(page.locator('.v-alert').filter({ hasText: 'Invalid library response' })).toBeVisible();
  await expect(page.locator('.media-card')).toHaveCount(1);
  await expect(page.locator('.media-date')).toHaveText('Release 2026-10-09');
  expect(mutations).toEqual([]);
});

test('outings handles a missing season list and stops the episode loader', async ({ page, mutations }) => {
  await page.route(/\/upcoming\?/, route => route.fulfill({ json: { results: [], total_pages: 1 } }));
  await page.route(/\/on_the_air\?/, route => route.fulfill({ json: {
    results: [{ id: series.tmdbId, name: series.title, first_air_date: '2026-10-10' }], total_pages: 1,
  } }));
  await page.route(/\/tv\/20\?/, route => route.fulfill({ json: {} }));
  await page.goto('/outings');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  await expect(page.locator('.v-alert').filter({ hasText: 'Invalid season response from TMDB' })).toBeVisible();
  await expect(page.getByText('Research in progress...', { exact: true })).not.toBeVisible();
  expect(mutations).toEqual([]);
});
