import { test, expect } from './fixtures';

for (const failure of ['invalid first page', 'invalid second page', 'HTTP 429']) {
  test(`outings handles ${failure} and recovers after reload`, async ({ page, mutations }) => {
    let fail = true;
    await page.route(/\/(upcoming|on_the_air)\?/, route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/on_the_air')) return route.fulfill({ json: { results: [], total_pages: 1 } });
      if (fail && failure === 'HTTP 429') return route.fulfill({ status: 429, json: { status_message: 'Rate limited' } });
      if (fail && (failure === 'invalid first page' || url.searchParams.get('page') === '2')) {
        return route.fulfill({ json: null });
      }
      return route.fulfill({ json: {
        results: [{ id: 100, title: 'Upcoming example', release_date: '2026-10-09' }],
        total_pages: fail ? 2 : 1,
      } });
    });
    await page.goto('/outings');
    const error = failure === 'HTTP 429' ? 'TMDB HTTP 429' : 'Invalid upcoming media response from TMDB';
    await expect(page.locator('.v-alert').filter({ hasText: error })).toBeVisible();
    await expect(page.getByText('Research in progress...', { exact: true })).not.toBeVisible();
    await expect(page.locator('.media-card')).toHaveCount(0);
    fail = false;
    await page.reload();
    await expect(page.locator('.media-card')).toHaveCount(1);
    await expect(page.locator('.media-card')).toContainText('Upcoming example');
    expect(mutations).toEqual([]);
  });
}
