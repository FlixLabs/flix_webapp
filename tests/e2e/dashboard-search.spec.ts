import { test, expect, movie } from './fixtures';

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
