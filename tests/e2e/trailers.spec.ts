import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const video = (overrides = {}) => ({
  site: 'YouTube', type: 'Trailer', key: 'abcdefghijk', name: 'Official trailer',
  iso_639_1: 'en', official: true, published_at: '2026-01-01', ...overrides,
});
async function openMedia(page: Page, kind: 'movie' | 'series' = 'movie') {
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  if (kind === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Details for Example ' + kind, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: (kind === 'movie' ? 'Movie' : 'Series') + ': Example ' + kind, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('loads the movie player only on click and removes it on close, preserving the sheet and focus', async ({ page, mutations }) => {
  const embeds: string[] = [];
  await page.route('https://www.youtube-nocookie.com/embed/**', route => {
    embeds.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<html><body>Mock trailer player</body></html>' });
  });
  await page.route('**/movie/10/videos?*', route => route.fulfill({ json: { results: [video()] } }));
  const sheet = await openMedia(page);
  const button = sheet.getByRole('button', { name: 'Trailer', exact: true });
  await expect(button).toBeVisible();
  expect(embeds).toHaveLength(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await button.click();
  const player = page.getByRole('dialog', { name: 'Trailer: Example movie', exact: true });
  await expect(player).toBeVisible();
  await expect(player.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcdefghijk\?autoplay=0/);
  await expect.poll(() => embeds.length).toBe(1);
  const link = player.getByRole('link', { name: 'Open on YouTube' });
  await expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await player.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await player.screenshot({ path: test.info().outputPath('trailer.png') });
  await player.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await button.click();
  await page.mouse.click(5, 5);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(button).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  await button.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  expect(mutations).toEqual([]);
});

test('offers a series trailer in the preferred content language', async ({ page, mutations }) => {
  await page.addInitScript(() => localStorage.setItem('flix.preferences.language.content', '"fr"'));
  const languages: string[] = [];
  await page.route('**/tv/20/videos?*', route => {
    languages.push(new URL(route.request().url()).searchParams.get('language')!);
    return route.fulfill({ json: { results: [video({ key: 'bcdefghijkl', iso_639_1: 'fr' }), video()] } });
  });
  await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  const sheet = await openMedia(page, 'series');
  await sheet.getByRole('button', { name: 'Trailer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trailer: Example series', exact: true }).locator('iframe')).toHaveAttribute('src', /\/bcdefghijkl\?/);
  expect(languages).toHaveLength(1);
  expect(languages[0]).toMatch(/^fr-/);
  expect(mutations).toEqual([]);
});

test('hides the action for empty video results without loading any player', async ({ page, mutations }) => {
  const sheet = await openMedia(page);
  await expect(sheet.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  await expect(sheet.getByRole('button', { name: 'Trailer', exact: true })).toHaveCount(0);
  await expect(sheet).not.toContainText('Unable to load trailers');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('allows retrying failed trailer metadata without disabling native actions', async ({ page, mutations }) => {
  let failed = true;
  await page.route('**/movie/10/videos?*', route => failed
    ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { results: [video()] } }));
  const sheet = await openMedia(page);
  await expect(sheet).toContainText('Unable to load trailers. Check TMDB and retry.');
  await expect(sheet.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  failed = false;
  await sheet.getByRole('button', { name: 'Retry Trailer', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Trailer', exact: true })).toBeVisible();
  await expect(sheet).not.toContainText('Unable to load trailers');
  expect(mutations).toEqual([]);
});

test('does not leak stale trailer metadata into a closed or different media sheet', async ({ page, mutations }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/movie/10/videos?*', async route => {
    requested = true;
    await waiting;
    await route.fulfill({ json: { results: [video()] } }).catch(() => {});
  });
  const sheet = await openMedia(page);
  await expect.poll(() => requested).toBe(true);
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  release();
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Details for Example series', exact: true }).click();
  const seriesSheet = page.getByRole('dialog', { name: 'Series: Example series', exact: true });
  await expect(seriesSheet).toBeVisible();
  await expect(seriesSheet.getByRole('button', { name: 'Trailer', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(mutations).toEqual([]);
});
