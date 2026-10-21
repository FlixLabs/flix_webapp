import { test, expect, movie, series } from './fixtures';
import { closeWithoutCollapsing } from './dialog-transition';

test('closing a media sheet keeps its refresh error until the fade has finished', async ({ page, mutations }) => {
  await page.route('**/api/v3/movie/1', route => route.fulfill({ status: 404, json: {} }));
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(dialog).toContainText('This media is no longer available');
  await closeWithoutCollapsing(dialog);
  expect(mutations).toEqual([]);
});

for (const view of ['library', 'dashboard', 'outings', 'downloads']) {
  test(`${view} refreshes an open movie in place on return and stops after closing`, async ({ page, mutations }) => {
    let updated = false;
    let reads = 0;
    await page.route('**/api/v3/movie/1', route => {
      reads++;
      return route.fulfill({ json: updated ? { ...movie, movieFile: { ...movie.movieFile, relativePath: 'Updated.mkv' } } : movie });
    });
    await page.route(/\/discover\/movie\?/, route => route.fulfill({ json: { results: [{ id: movie.tmdbId, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.route('**/api/v3/queue?*', route => route.fulfill({ json: { records: [{ id: 101, movieId: movie.id, title: 'Release', status: 'downloading', size: 100, sizeleft: 50 }] } }));
    await page.goto(`/${view}`);
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else if (view === 'downloads') {
      await page.getByRole('button', { name: 'Open media for Release', exact: true }).click();
    } else {
      if (view === 'outings') await expect(page.locator('.media-card')).toContainText('Existing');
      await page.locator('.media-card').click();
    }
    const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.evaluate(async el => {
      await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    });
    await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Movie.mkv');
    const scroll = await dialog.locator('.dialog-flex-text').evaluate(el => el.scrollTop);
    const initialReads = reads;
    updated = true;
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Updated.mkv');
    expect(reads).toBe(initialReads + 1);
    expect(await dialog.locator('.dialog-flex-text').evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(scroll - 1);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(150);
    expect(reads).toBe(initialReads + 1);
    expect(mutations).toEqual([]);
  });
}

test('movie updates retain the snapshot on error and offer a safe retry', async ({ page, mutations }) => {
  let fail = true;
  await page.route('**/api/v3/movie/1', route => fail ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: movie }));
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(dialog).toContainText('This media is no longer available');
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  fail = false;
  await dialog.getByRole('button', { name: 'Retry Media updates', exact: true }).click();
  await expect(dialog).not.toContainText('This media is no longer available');
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('series updates refresh episode files without collapsing the season', async ({ page, mutations }) => {
  let updated = false;
  await page.route('**/api/v3/series/2', route => route.fulfill({ json: series }));
  await page.route('**/api/v3/episode?*', route => route.fulfill({ json: [{ id: 21, title: 'First episode', seasonNumber: 1, episodeNumber: 1, hasFile: updated, episodeFile: updated ? { relativePath: 'Episode.mkv', size: 1e9 } : undefined }] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Series: ${series.title}`, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  const season = dialog.getByRole('button', { name: /Season 1/ });
  await season.scrollIntoViewIfNeeded();
  await season.click();
  await expect(dialog.getByText('First episode', { exact: true })).toBeVisible();
  await dialog.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = Math.max(1, el.scrollTop); });
  updated = true;
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(season).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Episode.mkv');
  expect(mutations).toEqual([]);
});

test('unsaved settings pause updates without losing the selected profile', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/movie/1*', route => { reads++; return route.fulfill({ json: { ...movie, qualityProfileId: 1, tags: [] } }); });
  await page.route(/\/api\/v3\/qualityprofile(?:\?|$)/, route => route.fulfill({ json: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD' }] }));
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await dialog.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  const settings = dialog.getByRole('button', { name: 'Media settings', exact: true });
  await settings.scrollIntoViewIfNeeded(); await settings.click();
  const profile = dialog.getByRole('combobox', { name: 'Quality profile', exact: true });
  await expect(profile).toBeEnabled();
  await profile.locator('..').click();
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
  const initialReads = reads;
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(150);
  expect(reads).toBe(initialReads);
  await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('an open release dialog suspends background media updates', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/movie/1', route => { reads++; return route.fulfill({ json: movie }); });
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await dialog.getByRole('button', { name: 'Choose Release', exact: true }).click();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(150);
  expect(reads).toBe(0);
  expect(mutations).toEqual([]);
});

test('expanded history keeps its events visible during background updates', async ({ page, mutations }) => {
  let reads = 0;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v3/movie/1', route => route.fulfill({ json: movie }));
  await page.route('**/api/v3/history?*', async route => {
    const current = ++reads;
    if (current > 1) await waiting;
    await route.fulfill({ json: { totalRecords: 1, records: [{ id: 1, movieId: movie.id, eventType: 'grabbed', sourceTitle: current > 1 ? 'New release' : 'Original release' }] } });
  });
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await dialog.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  const history = dialog.getByRole('button', { name: 'Media history', exact: true });
  await history.scrollIntoViewIfNeeded(); await history.click();
  await expect(dialog.getByText('Original release', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => reads).toBe(2);
  await expect(dialog.getByText('Original release', { exact: true })).toBeVisible();
  release();
  await expect(dialog.getByText('New release', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
