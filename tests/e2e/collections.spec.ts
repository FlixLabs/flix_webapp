import { test, expect, movie } from './fixtures';

const saga = { id: 5, tmdbId: 100, title: 'Example saga', overview: 'A connected movie saga', missingMovies: 0, movies: [
  { tmdbId: 12, title: 'Future sequel', year: 2035, status: 'announced', images: [] },
  { tmdbId: 11, title: 'Missing sequel', year: 2026, status: 'released', images: [] },
  { tmdbId: 10, title: movie.title, year: movie.year, status: 'released', images: [] },
] };

for (const title of ['Example saga', 'A saga with a deliberately very long title that must not move or compress its icon']) {
  test(`movie collection link stays centered with title: ${title}`, async ({ page, mutations }) => {
    await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, collection: { tmdbId: 100, title } }] }));
    await page.goto('/library');
    await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
    const button = page.getByRole('button', { name: `Collection: ${title}`, exact: true });
    await expect(button).toBeVisible();
    const metrics = await button.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement!.getBoundingClientRect();
      const icon = el.querySelector('.v-btn__prepend')!.getBoundingClientRect();
      const label = el.querySelector('.text-truncate')!.getBoundingClientRect();
      return { centered: Math.abs(rect.x + rect.width / 2 - parent.x - parent.width / 2),
        aligned: Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2),
        iconRatio: icon.width / icon.height,
        contained: rect.left >= parent.left - 1 && rect.right <= parent.right + 1,
        display: getComputedStyle(el.querySelector('.v-btn__content')!).display };
    });
    expect(metrics.centered).toBeLessThanOrEqual(1);
    expect(metrics.aligned).toBeLessThanOrEqual(1);
    expect(metrics.iconRatio).toBeCloseTo(1);
    expect(metrics.contained).toBe(true);
    expect(metrics.display).toBe('flex');
    await expect(button).toHaveAttribute('title', `Collection: ${title}`);
    expect(mutations).toEqual([]);
  });
}

test('loads collection metadata once and keeps its counter when switching views', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/collection?*', route => { reads++; return route.fulfill({ json: [saga] }); });
  await page.goto('/library');
  await expect(page.getByRole('button', { name: `Open ${movie.title}`, exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
  expect(reads).toBe(1);
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
  }
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  const card = page.getByRole('button', { name: 'Open collection Example saga', exact: true });
  await expect(card).toBeEnabled();
  await expect(card).toContainText('1 available');
  await expect(card).toContainText('1 missing');
  await card.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  await expect(sheet).toBeVisible();
  const members = sheet.locator('.v-card[role="button"]');
  await expect(members).toHaveCount(3);
  await expect(members.nth(0)).toContainText(movie.title);
  await expect(members.nth(1)).toContainText('Missing');
  await expect(members.nth(2)).toContainText('Upcoming');
  await sheet.getByRole('button', { name: 'View Missing sequel', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Movie: Missing sequel', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await expect(preview.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('button', { name: 'View Missing sequel', exact: true })).toBeFocused();
  await sheet.getByRole('button', { name: `View ${movie.title}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  expect(mutations).toEqual([]);
});

test('discards a delayed collection response after switching instances', async ({ page, mutations }) => {
  const config = (host: string) => ({ base_url: `http://${host}.test`, api_key: 'test-only', root_folder_path: '/media' });
  await page.route('**/instances', route => route.fulfill({ json: [
    { name: 'First', radarr: config('first-radarr'), sonarr: config('first-sonarr') },
    { name: 'Second', radarr: config('second-radarr'), sonarr: config('second-sonarr') },
  ] }));
  let started = false; let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v3/collection?*', async route => {
    const first = new URL(route.request().url()).hostname.startsWith('first-');
    if (first) { started = true; await held; }
    await route.fulfill({ json: [{ ...saga, title: first ? 'Old saga' : 'Second saga' }] }).catch(() => {});
  });
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('combobox', { name: 'Instance', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Second', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open collection Second saga', exact: true })).toBeEnabled();
  release();
  await expect(page.getByRole('button', { name: 'Open collection Old saga', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('paginates large sagas and restores focus after closing with Escape', async ({ page, mutations }) => {
  const large = { ...saga, movies: Array.from({ length: 28 }, (_, index) => ({ tmdbId: 10 + index, title: `Saga movie ${index + 1}`, year: 1990 + index, status: 'released', images: [] })) };
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [large] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  const opener = page.getByRole('button', { name: 'Open collection Example saga', exact: true });
  await opener.press('Space');
  const sheet = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  const width = page.viewportSize()!.width;
  const perPage = width < 600 ? 4 : width < 960 ? 6 : 8;
  await expect(sheet.locator('.v-card[role="button"]')).toHaveCount(perPage);
  await sheet.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(sheet.getByRole('button', { name: `View Saga movie ${perPage + 1}`, exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'View Saga movie 1', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(mutations).toEqual([]);
});

test('keeps collection recovery in the error message rather than adding a toolbar action', async ({ page, mutations }) => {
  let recovered = false;
  await page.route('**/api/v3/collection?*', route => recovered
    ? route.fulfill({ json: [saga] }) : route.fulfill({ status: 503, json: {} }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  const card = page.getByRole('button', { name: 'Open collection Example saga', exact: true });
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh collections', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry Collections', exact: true })).toBeVisible();
  recovered = true;
  await page.getByRole('button', { name: 'Retry Collections', exact: true }).click();
  await expect(card).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Retry Collections', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('opens the saga from a library movie sheet and preserves the library search', async ({ page, mutations }) => {
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, collection: { tmdbId: 100, title: 'Example saga' } }] }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Collection: Example saga', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close collection', exact: true }).click();
  await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  expect(mutations).toEqual([]);
});

test('retries unavailable or malformed collections without showing an empty success', async ({ page, mutations }) => {
  let calls = 0;
  await page.route('**/api/v3/collection?*', route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: calls === 2 ? [{ ...saga, movies: {} }] : [saga] });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry Collections', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByText('No automatic movie collections in this library')).toHaveCount(0);
  await retry.click();
  await expect(page.getByText('Invalid collection movies response. Please try again.', { exact: false })).toBeVisible();
  await retry.click();
  await expect(page.getByRole('button', { name: 'Open collection Example saga', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('searches and clears collections without horizontal overflow', async ({ page, mutations }) => {
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('No match');
  await expect(page.getByText('No collections match your search')).toBeVisible();
  await page.getByRole('button', { name: 'Clear Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open collection Example saga', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('keeps a movie without a local file missing even when Radarr has it in the library', async ({ page, mutations }) => {
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, hasFile: false, movieFile: null }] }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Example saga', exact: true }).click();
  const member = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true }).getByRole('button', { name: `View ${movie.title}`, exact: true });
  await expect(member).toContainText('Missing');
  await expect(member).toContainText('In library');
  expect(mutations).toEqual([]);
});
