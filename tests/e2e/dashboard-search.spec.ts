import { test, expect, movie } from './fixtures';

test('dashboard finds translated series using a confirmed TVDB identity', async ({ page, mutations }) => {
  await page.route('**/search/tv?*', route => route.fulfill({ json: { results: [{ id: 71446, name: 'La casa de papel', original_name: 'La casa de papel' }] } }));
  await page.route('**/tv/71446/external_ids?*', route => route.fulfill({ json: { id: 71446, tvdb_id: 327417 } }));
  await page.route(/\/api\/v3\/series\/lookup\?/, route => {
    const identifier = new URL(route.request().url()).searchParams.get('term') === 'tvdb:327417';
    return route.fulfill({ json: identifier ? [{ title: 'Money Heist', tvdbId: 327417, year: 2017, images: [] }] : [] });
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('La casa de papel');
  await page.getByRole('button', { name: /^Series/ }).click();
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'Money Heist (2017)' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('clearing a slow translated series search cannot restore results', async ({ page, mutations }) => {
  let started = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/search/tv?*', route => route.fulfill({ json: { results: [{ id: 71446, name: 'La casa de papel' }] } }));
  await page.route('**/tv/71446/external_ids?*', async route => {
    started = true;
    await held;
    await route.fulfill({ json: { id: 71446, tvdb_id: 327417 } }).catch(() => {});
  });
  await page.goto('/dashboard');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('La casa de papel');
  await page.getByRole('button', { name: /^Series/ }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.locator('.custom-list').first()).toContainText('Example series');
  await search.fill('');
  release();
  await page.waitForTimeout(500);
  await expect(page.locator('.custom-list')).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('dashboard finds Alexandre (2004) through a validated Radarr lookup', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, tmdbId: 100, title: 'Alexandre', year: 1983 }] }));
  await page.route('**/search/movie?*', route => route.fulfill({ json: { results: [{ id: 1966, title: 'Alexandre', original_title: 'Alexander' }] } }));
  await page.route('**/api/v3/movie/lookup/tmdb?*', route => route.fulfill({ json: { ...movie, id: 0, tmdbId: 1966, title: 'Alexander', year: 2004 } }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Alexandre');
  await expect(page.locator('.custom-list').first().locator('.v-list-item-title')).toHaveText(['Alexandre (1983)', 'Alexander (2004)']);
  expect(mutations).toEqual([]);
});

test('native results remain visible when translated search is unavailable', async ({ page, mutations }) => {
  await page.route('**/search/movie?*', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await expect(page.locator('.custom-list').first()).toContainText('Example movie');
  await expect(page.getByRole('button', { name: 'Retry Movie search', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('native results appear immediately and clearing a slow translated lookup discards it', async ({ page, mutations }) => {
  let started = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/search/movie?*', route => route.fulfill({ json: { results: [{ id: 1966, title: 'Alexandre' }] } }));
  await page.route('**/api/v3/movie/lookup/tmdb?*', async route => {
    started = true;
    await held;
    await route.fulfill({ json: { ...movie, tmdbId: 1966, title: 'Alexander', year: 2004 } }).catch(() => {});
  });
  await page.goto('/dashboard');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('Alexandre');
  await expect.poll(() => started).toBe(true);
  await expect(page.locator('.custom-list').first()).toContainText('Example movie');
  await search.fill('');
  release();
  await page.waitForTimeout(500);
  await expect(page.locator('.custom-list')).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('identifier searches do not call TMDB search', async ({ page, mutations }) => {
  let queries = 0;
  await page.route('**/search/movie?*', route => { queries++; return route.fulfill({ json: { results: [] } }); });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('tmdb:1966');
  await expect(page.locator('.custom-list').first()).toContainText('Example movie');
  await page.waitForTimeout(500);
  expect(queries).toBe(0);
  expect(mutations).toEqual([]);
});

test('dashboard ranks exact titles above newer sequels', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [
    { ...movie, id: 3, tmdbId: 30, title: 'Matrix Reloaded', year: 2003 },
    { ...movie, id: 4, tmdbId: 40, title: 'Matrix', year: 1999 },
  ] }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Matrix');
  const titles = page.locator('.custom-list').first().locator('.v-list-item-title');
  await expect(titles).toHaveText(['Matrix (1999)', 'Matrix Reloaded (2003)']);
  expect(mutations).toEqual([]);
});

test('dashboard encodes search terms and debounces typing', async ({ page, mutations }) => {
  const queries: string[] = [];
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.get('term') ?? '');
    return route.fulfill({ json: [{ ...movie, title: params.get('term') }] });
  });
  await page.goto('/dashboard');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('Alpha');
  await search.fill('A & B');
  await expect(page.locator('.custom-list').first()).toContainText('A & B');
  expect(queries).toEqual(['A & B']);
  expect(mutations).toEqual([]);
});

test('clearing a pending search cannot restore its results', async ({ page, mutations }) => {
  let started = false;
  await page.route(/\/api\/v3\/(movie|series)\/lookup\?/, async route => {
    started = true;
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: [movie] });
  });
  await page.goto('/dashboard');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('Example');
  await expect.poll(() => started).toBe(true);
  await search.fill('');
  await page.waitForTimeout(800);
  await expect(page.locator('.custom-list')).toHaveCount(0);
  expect(mutations).toEqual([]);
});
