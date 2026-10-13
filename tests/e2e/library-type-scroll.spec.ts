import { test, expect, movie, series } from './fixtures';

test('library scrolls back to its navigation for every media type transition', async ({ page, mutations }) => {
  let release!: () => void;
  let moduleRequested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/components/common/LibraryCollections.vue*', async route => {
    moduleRequested = true;
    await held;
    await route.continue();
  });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 700 });
  const movies = Array.from({ length: 25 }, (_, index) => ({ ...movie, id: index + 1 }));
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: movies }));
  await page.route('**/api/v3/series?*', route => route.fulfill({ json: Array.from({ length: 25 }, (_, index) => ({ ...series, id: index + 1 })) }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, tmdbId: 100 + index, title: `Saga ${index + 1}`, movies: [{ tmdbId: movie.tmdbId, title: movie.title }],
  })) }));
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'Collections (25)', exact: true })).toBeVisible();
  await page.locator('[aria-label="Media type"]').evaluate(el => el.setAttribute('data-persistent-navigation', 'true'));
  // Include returning to Movies when the parent still remembers Movies,
  // and opening Collections while Movies is already selected.
  for (const type of ['Movies', 'Series', 'Series', 'Movies', 'Collections', 'Collections', 'Movies', 'Collections', 'Series', 'Collections']) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const target = (await page.getByRole('button', { name: `${type} (25)`, exact: true }).boundingBox())!;
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    await expect(page.locator('[aria-label="Media type"] .v-btn--active')).toContainText(type);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
    await expect(page.locator('[aria-label="Media type"]')).toHaveAttribute('data-persistent-navigation', 'true');
    await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toBeInViewport();
    if (type === 'Collections') {
      await expect.poll(() => moduleRequested).toBe(true);
      release();
      await expect(page.getByRole('button', { name: 'Open collection Saga 1', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(200);
    }
  }
  expect(mutations).toEqual([]);
});
