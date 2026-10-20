import { test, expect, movie, series } from './fixtures';

for (const view of ['library', 'outings', 'dashboard']) {
  test(`${view} navigates the displayed movie page without writes or lost search`, async ({ page, mutations }) => {
    const movies = Array.from({ length: 3 }, (_, i) => ({ ...movie, id: i + 1, tmdbId: 10 + i, title: `Example movie ${i + 1}` }));
    await page.route(/\/api\/v3\/movie(?:\?|\/lookup\?)/, route => route.fulfill({ json: movies }));
    await page.route(/\/discover\/movie\?/, route => route.fulfill({ json: { results: movies.map(item => ({ id: item.tmdbId, title: item.title, release_date: '2026-10-20' })), total_pages: 1 } }));
    await page.goto(`/${view}`);
    const search = page.getByRole('textbox', { name: 'Search', exact: true });
    await search.fill('Example');
    if (view === 'dashboard') {
      await page.getByRole('button', { name: 'Details for Example movie 1', exact: true }).click();
    } else {
      await expect(page.locator('.media-card')).toHaveCount(3);
      await page.locator('.media-card').first().click();
    }
    const dialog = page.locator('.v-dialog').filter({ has: page.getByRole('group', { name: 'Media navigation' }) });
    await expect(dialog.getByRole('button', { name: 'Previous media' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Next media' }).click();
    await expect(dialog.locator('.title-line')).toHaveText('Example movie 2');
    await expect(dialog.getByRole('group', { name: 'Media navigation' })).toContainText('2 / 3');
    await expect.poll(() => dialog.locator('.dialog-flex-text').evaluate(el => el.scrollTop)).toBe(0);
    await dialog.getByRole('button', { name: 'Next media' }).click();
    await expect(dialog.locator('.title-line')).toHaveText('Example movie 3');
    await expect(dialog.getByRole('button', { name: 'Next media' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Previous media' }).click();
    await expect(dialog.locator('.title-line')).toHaveText('Example movie 2');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(search).toHaveValue('Example');
    expect(mutations).toEqual([]);
  });
}

test('library series navigation loads the next series episodes', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/series\?/, route => route.fulfill({ json: [series, { ...series, id: 3, title: 'Other series' }] }));
  await page.route(/\/api\/v3\/episode\?/, route => route.fulfill({ json: [{ seasonNumber: 1, episodeNumber: 1, title: new URL(route.request().url()).searchParams.get('seriesId') === '3' ? 'Other pilot' : 'Pilot', hasFile: false }] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (2)', exact: true }).click();
  await page.locator('.media-card').first().click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog.getByRole('button', { name: 'Next media' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Next media' }).click();
  await expect(dialog.locator('.title-line')).toHaveText('Other series');
  await expect(dialog.getByRole('button', { name: 'Previous media' })).toBeEnabled();
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await dialog.getByRole('button', { name: 'Season 1 1 episode', exact: true }).click();
  await expect(dialog).toContainText('Other pilot');
  expect(mutations).toEqual([]);
});
