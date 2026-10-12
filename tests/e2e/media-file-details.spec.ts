import { test, expect, movie } from './fixtures';

const file = {
  ...movie.movieFile, dateAdded: '2026-10-12T10:00:00Z',
  mediaInfo: { resolution: '1920x1080', videoCodec: 'x264', audioCodec: 'DTS', audioLanguages: 'French / English', subtitles: 'French' },
};

for (const view of ['library', 'dashboard', 'outings']) {
  test(`${view} preserves movie file metadata without additional reads`, async ({ page, mutations }) => {
    const reads: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/v3/')) reads.push(request.url());
    });
    await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [{ ...movie, statistics: undefined, movieFile: file }] }));
    await page.route(/\/(upcoming|on_the_air)\?/, route => route.fulfill({ json: { results: [{ id: 10, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.goto(`/${view}`);
    let readsBeforeOpening = 0;
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      const row = page.locator('.custom-list .v-list-item').filter({ hasText: movie.title });
      await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      readsBeforeOpening = reads.length;
      await row.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else {
      await expect(page.locator('.media-card').getByText(movie.title, { exact: true })).toBeVisible();
      // The existing marker appears after the asynchronous library check in Outings.
      if (view === 'outings') await expect(page.locator('.media-card').getByText('Existing', { exact: true })).toBeVisible();
      readsBeforeOpening = reads.length;
      await page.locator('.media-card').click();
    }
    const dialog = page.locator('.v-dialog');
    await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const details = dialog.locator('.media-file-details');
    await expect(details.getByText('1920x1080', { exact: true })).toBeVisible();
    await expect(details.getByText('French / English', { exact: true })).toBeVisible();
    await expect(details.getByText('French', { exact: true })).toBeVisible();
    await expect(details.getByText('x264', { exact: true })).toBeVisible();
    await expect(details.getByText('DTS', { exact: true })).toBeVisible();
    await expect(details.getByText('File added', { exact: true }).locator('..')).toContainText('2026');
    await expect(details.getByText('Size (GB)', { exact: true }).locator('..')).toContainText('4.00');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    expect(mutations).toEqual([]);
    expect(reads).toHaveLength(readsBeforeOpening);
  });
}

test('episodes share the file details layout and tolerate missing metadata', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/episode\?/, route => route.fulfill({ json: [{
    id: 21, title: 'Pilot', seasonNumber: 1, episodeNumber: 1, hasFile: true,
    episodeFile: { size: 2e9, relativePath: 'Pilot.mkv', quality: {} },
  }] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog');
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  await dialog.getByRole('button', { name: /Season 1/ }).click();
  const details = dialog.locator('.media-file-details');
  await expect(details).toBeAttached();
  await dialog.locator('.v-expansion-panel').filter({ has: page.locator('.v-expansion-panel-title').filter({ hasText: 'Season 1' }) }).locator('.v-expansion-panel-text').evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(details.getByText('Resolution', { exact: true })).toBeVisible();
  await expect(details.getByText('Not provided', { exact: true })).toHaveCount(7);
  await expect(details.getByText('Quality', { exact: true }).locator('..')).toContainText('Not provided');
  await expect(details.getByText('Size (GB)', { exact: true }).locator('..')).toContainText('2.00');
  expect(mutations).toEqual([]);
});
