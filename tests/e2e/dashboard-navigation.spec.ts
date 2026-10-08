import { test, expect, movie, series } from './fixtures';

test('dashboard keeps media pages when switching tabs without repeating searches', async ({ page, mutations }) => {
  const lookups: string[] = [];
  await page.route(/\/api\/v3\/(movie|series)\/lookup\?/, route => {
    const url = new URL(route.request().url());
    lookups.push(url.pathname);
    const isMovie = url.pathname.includes('/movie/');
    return route.fulfill({ json: Array.from({ length: 9 }, (_, index) => ({
      ...(isMovie ? movie : series),
      id: 100 + index, tmdbId: 100 + index, tvdbId: 100 + index,
      title: `Example ${isMovie ? 'movie' : 'series'} ${index + 1}`,
    })) });
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  const movies = page.getByRole('region', { name: 'Movie results' });
  await expect(movies.locator('.v-list-item-title')).toHaveText([
    'Example movie 1 (2025)', 'Example movie 2 (2025)', 'Example movie 3 (2025)', 'Example movie 4 (2025)',
  ]);
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(movies).toContainText('Example movie 5');
  await page.getByRole('button', { name: 'Series (9)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Series results' })).toContainText('Example series 1');
  await expect(movies).toHaveCount(0);
  await page.getByRole('button', { name: 'Movies (9)', exact: true }).click();
  await expect(movies).toContainText('Example movie 5');
  expect(lookups).toHaveLength(2);
  await page.getByRole('button', { name: 'Series (9)', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Series (9)', exact: true })).toHaveClass(/v-btn--active/);
  expect(mutations).toEqual([]);
});

test('dashboard search and pagination remain below the app bar while scrolling', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: Array.from({ length: 9 }, (_, index) => ({
    ...movie, tmdbId: 100 + index, title: `Example movie ${index + 1}`,
  })) }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await expect(page.locator('.custom-list .v-list-item')).toHaveCount(4);
  await page.evaluate(() => window.scrollTo(0, 600));
  const toolbar = page.locator('.page-navigation');
  await expect.poll(async () => (await toolbar.boundingBox())?.y).toBe(64);
  await expect(page.getByRole('button', { name: 'Go to page 2', exact: true })).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Movie results' })).toContainText('Example movie 5');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
  expect(mutations).toEqual([]);
});

test('attention summary remains visible without expanding long lists', async ({ page, mutations }) => {
  await page.goto('/dashboard');
  const attention = page.getByRole('button', { name: /Needs attention/ });
  await expect(attention).toHaveAttribute('aria-expanded', 'false');
  await expect(attention).toContainText('2 downloads');
  await expect(attention).toContainText('1 missing episode');
  await expect(attention).toContainText('2 storage alerts');
  await expect(page.getByText('Not enough space').first()).not.toBeVisible();
  await attention.click();
  await expect(page.getByText('Not enough space').first()).toBeVisible();
  await attention.click();
  await expect(attention).toHaveAttribute('aria-expanded', 'false');
  expect(mutations).toEqual([]);
});
