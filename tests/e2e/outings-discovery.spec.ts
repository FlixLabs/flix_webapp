import { test, expect } from './fixtures';

test('outings orders regional releases across delayed pages and keeps pagination stable', async ({ page, mutations }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00'));
  await page.route(/\/discover\/(movie|tv)\?/, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tv')) return route.fulfill({ json: { results: [], total_pages: 1 } });
    expect(url.searchParams.get('release_date.gte')).toBe('2026-09-20');
    expect(url.searchParams.get('release_date.lte')).toBe('2027-01-18');
    expect(url.searchParams.get('with_release_type')).toBe('3|2');
    const number = Number(url.searchParams.get('page') ?? '1');
    if (number === 2) await new Promise(resolve => setTimeout(resolve, 150));
    const start = number === 1 ? 11 : number === 2 ? 1 : 6;
    const results = Array.from({ length: 5 }, (_, index) => {
      const id = start + index;
      return { id: 100 + id, title: `Release ${String(id).padStart(2, '0')}`,
        release_date: `2026-10-${String(id).padStart(2, '0')}` };
    });
    results.push({ id: 101, title: 'Release 01', release_date: '2026-10-01' });
    return route.fulfill({ json: { results, total_pages: 3 } });
  });
  await page.goto('/outings');
  await expect(page.getByRole('button', { name: 'Movies (15)', exact: true })).toBeVisible();
  await expect(page.locator('.media-card')).toHaveCount(12);
  await expect(page.locator('.title-line')).toHaveText(Array.from({ length: 12 }, (_, i) => `Release ${String(i + 1).padStart(2, '0')}`));
  await expect(page.getByText('Releases from 2026-09-20 to 2027-01-18', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(page.locator('.title-line')).toHaveText(['Release 13', 'Release 14', 'Release 15']);
  expect(mutations).toEqual([]);
});

test('outings shows only dated new series inside the discovery window', async ({ page, mutations }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00'));
  await page.route(/\/discover\/(movie|tv)\?/, route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/movie')) return route.fulfill({ json: { results: [], total_pages: 1 } });
    expect(url.searchParams.get('first_air_date.gte')).toBe('2026-09-20');
    expect(url.searchParams.get('first_air_date.lte')).toBe('2027-01-18');
    expect(url.searchParams.has('air_date.gte')).toBe(false);
    return route.fulfill({ json: { results: [
      { id: 100, name: 'Old continuing show', first_air_date: '2010-01-01' },
      { id: 101, name: 'New show', first_air_date: '2026-10-21' },
      { id: 102, name: 'Undated show' },
      { id: 103, name: 'Distant show', first_air_date: '2027-10-21' },
    ], total_pages: 1 } });
  });
  await page.goto('/outings');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await expect(page.locator('.media-card')).toHaveCount(1);
  await expect(page.locator('.title-line')).toHaveText('New show');
  await expect(page.locator('.media-date')).toHaveText('Premiere 2026-10-21');
  expect(mutations).toEqual([]);
});
