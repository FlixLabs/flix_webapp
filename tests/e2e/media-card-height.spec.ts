import { test, expect, movie } from './fixtures';

const longTitle = 'A very long movie title with enough words to span several lines on both desktop and mobile screens';

for (const path of ['/outings', '/library']) {
  test(`${path} keeps short and long title cards the same height`, async ({ page, mutations }) => {
    const items = [
      { ...movie, id: 101, tmdbId: 101, title: 'Short' },
      { ...movie, id: 102, tmdbId: 102, title: longTitle },
    ];
    await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: items }));
    await page.route(/\/(upcoming|on_the_air)\?/, route => route.fulfill({ json: {
      results: new URL(route.request().url()).pathname.endsWith('/upcoming')
        ? items.map(item => ({ ...item, id: item.tmdbId, release_date: '2026-10-09' })) : [],
      total_pages: 1,
    } }));
    await page.goto(path);
    const cards = page.locator('.media-card');
    await expect(cards).toHaveCount(2);
    await expect.poll(async () => {
      const heights = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      return Math.abs(heights[0]! - heights[1]!);
    }).toBeLessThan(1);
    await expect(page.locator('.title-line').filter({ hasText: longTitle })).toHaveAttribute('title', longTitle);
    expect(mutations).toEqual([]);
  });
}
