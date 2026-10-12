import { test, expect, movie, series } from './fixtures';

for (const view of ['library', 'dashboard', 'outings']) {
  test(`${view} loads media history only when expanded and shows service failure details`, async ({ page, mutations }) => {
    const reads: string[] = [];
    await page.route(/\/api\/v3\/history\?/, route => {
      reads.push(route.request().url());
      return route.fulfill({ json: { totalRecords: 1, records: [{ id: 1, movieId: movie.id, eventType: 'downloadFailed', sourceTitle: 'Example.release', date: '2026-10-12T10:00:00Z', data: { message: 'Not enough disk space' } }] } });
    });
    await page.route(/\/upcoming\?/, route => route.fulfill({ json: { results: [{ id: movie.tmdbId, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.goto(`/${view}`);
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else {
      if (view === 'outings') await expect(page.locator('.media-card')).toContainText('Existing');
      await page.locator('.media-card').click();
    }
    const dialog = page.locator('.v-dialog');
    expect(reads).toEqual([]);
    await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await dialog.getByRole('button', { name: 'Media history', exact: true }).click();
    await expect(dialog).toContainText('Not enough disk space');
    await expect(dialog).toContainText('Download failed');
    expect(new URL(reads[0]!).searchParams.get('movieIds')).toBe(String(movie.id));
    await dialog.getByRole('button', { name: 'Refresh history', exact: true }).click();
    await expect.poll(() => reads.length).toBe(2);
    expect(mutations).toEqual([]);
  });
}

test('series history retries errors and paginates on the service', async ({ page, mutations }) => {
  const pages: string[] = []; let fail = true;
  await page.route(/\/api\/v3\/history\?/, route => {
    const url = new URL(route.request().url()); pages.push(url.searchParams.get('page')!);
    expect(url.searchParams.get('seriesIds')).toBe(String(series.id));
    expect(url.searchParams.get('includeEpisode')).toBe('true');
    if (fail) { fail = false; return route.fulfill({ status: 503, json: {} }); }
    return route.fulfill({ json: { totalRecords: 11, records: [{ id: 3, seriesId: series.id, eventType: 'downloadFolderImported', sourceTitle: `Page ${url.searchParams.get('page')}`, episode: { seasonNumber: 1, episodeNumber: 2, title: 'Second episode' } }] } });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog.locator('.v-expansion-panel-title').filter({ hasText: 'Season 1' })).toBeAttached();
  await dialog.evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  await expect(dialog.locator('.media-supplemental-details')).toBeVisible();
  await dialog.getByRole('button', { name: 'Media history', exact: true }).scrollIntoViewIfNeeded();
  await dialog.getByRole('button', { name: 'Media history', exact: true }).click();
  await expect(dialog).toContainText('Unable to load media history');
  await dialog.evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await dialog.getByRole('button', { name: 'Retry history', exact: true }).click();
  await expect(dialog).toContainText('S01E02 - Second episode');
  await dialog.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(dialog).toContainText('Page 2');
  expect(pages).toEqual(['1', '1', '2']); expect(mutations).toEqual([]);
});

test('switching sheets clears history and keeps the next media history collapsed', async ({ page, mutations }) => {
  const ids: string[] = [];
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [movie, { ...movie, id: 2, tmdbId: 11, title: 'Other movie' }] }));
  await page.route(/\/api\/v3\/history\?/, route => {
    const id = new URL(route.request().url()).searchParams.get('movieIds')!; ids.push(id);
    return route.fulfill({ json: { totalRecords: 1, records: [{ id: 1, movieId: Number(id), eventType: 'grabbed', sourceTitle: `History for movie ${id}` }] } });
  });
  await page.goto('/library'); await page.locator('.media-card').first().click();
  const dialog = page.locator('.v-dialog');
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await dialog.getByRole('button', { name: 'Media history', exact: true }).click();
  await expect(dialog).toContainText('History for movie 1');
  await dialog.getByRole('button', { name: 'Next media' }).click();
  await expect(dialog.locator('.title-line')).toHaveText('Other movie');
  await expect(dialog.getByText('History for movie 1', { exact: true })).not.toBeAttached();
  expect(ids).toEqual(['1']);
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await dialog.getByRole('button', { name: 'Media history', exact: true }).click();
  await expect(dialog).toContainText('History for movie 2');
  expect(ids).toEqual(['1', '2']); expect(mutations).toEqual([]);
});

test('new dashboard media have no service history before being added', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, id: 0, tmdbId: 77, title: 'New movie' }] }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New movie');
  await page.getByRole('button', { name: 'Details for New movie', exact: true }).click();
  await expect(page.locator('.v-dialog').getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  await expect(page.locator('.v-dialog').getByRole('button', { name: 'Media history', exact: true })).not.toBeAttached();
  expect(mutations).toEqual([]);
});
