import { test, expect, movie, series } from './fixtures';

for (const view of ['library', 'dashboard', 'outings']) {
  test(`${view} updates movie monitoring without a search or deletion`, async ({ page, mutations }) => {
    let resource = { ...movie, monitored: true, path: '/movies/Example', qualityProfileId: 4, tags: [3] };
    const writes: unknown[] = [];
    await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [resource] }));
    await page.route('**/api/v3/movie/1', async route => {
      if (route.request().method() === 'PUT') {
        resource = route.request().postDataJSON(); writes.push(resource);
        return route.fulfill({ status: 202, json: resource });
      }
      return route.fulfill({ json: resource });
    });
    await page.route(/\/(upcoming|on_the_air)\?/, route => route.fulfill({ json: { results: [{ id: 10, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.goto(`/${view}`);
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      const row = page.locator('.custom-list .v-list-item').filter({ hasText: movie.title });
      await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      await row.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else {
      if (view === 'outings') await expect(page.locator('.media-card').getByText('Existing', { exact: true })).toBeVisible();
      await page.locator('.media-card').click();
    }
    const control = page.getByRole('checkbox', { name: 'Monitor movie', exact: true });
    await expect(control).toBeChecked();
    await control.uncheck();
    await expect(control).toBeEnabled();
    await expect(control).not.toBeChecked();
    expect(writes).toEqual([{ ...movie, monitored: false, path: '/movies/Example', qualityProfileId: 4, tags: [3] }]);
    await control.check();
    await expect(control).toBeEnabled();
    await expect(control).toBeChecked();
    expect(writes).toHaveLength(2);
    expect(mutations).toEqual([]);
  });
}

test('series monitoring preserves per-season settings and specials', async ({ page, mutations }) => {
  let resource = { ...series, monitored: true, path: '/tv/Example', qualityProfileId: 4,
    seasons: [{ seasonNumber: 0, monitored: false }, { seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: true }] };
  const writes: typeof resource[] = [];
  await page.route(/\/api\/v3\/series\?/, route => route.fulfill({ json: [resource] }));
  await page.route('**/api/v3/series/2', route => {
    if (route.request().method() === 'PUT') { resource = route.request().postDataJSON(); writes.push(resource); }
    return route.fulfill({ json: resource });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  await page.getByRole('button', { name: 'Season monitoring' }).click();
  const season = page.getByRole('checkbox', { name: 'Monitor season 1', exact: true });
  await season.uncheck();
  await expect(season).toBeEnabled();
  await expect(season).not.toBeChecked();
  expect(writes[0]?.seasons).toEqual([{ seasonNumber: 0, monitored: false }, { seasonNumber: 1, monitored: false }, { seasonNumber: 2, monitored: true }]);
  await page.getByRole('checkbox', { name: 'Monitor series', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Monitor series', exact: true })).toBeEnabled();
  await expect(season).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Monitor season 2', exact: true })).toBeChecked();
  expect(writes[1]?.monitored).toBe(false);
  expect(writes[1]?.seasons).toEqual(writes[0]?.seasons);
  expect(mutations).toEqual([]);
});

test('an uncertain update can be reloaded without repeating the write', async ({ page, mutations }) => {
  let monitored = true;
  let reads = 0; let writes = 0;
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [{ ...movie, monitored }] }));
  await page.route('**/api/v3/movie/1', route => {
    if (route.request().method() === 'PUT') { monitored = false; writes++; return route.fulfill({ status: 202, json: {} }); }
    reads++;
    return reads === 2 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { ...movie, monitored } });
  });
  await page.goto('/library'); await page.locator('.media-card').click();
  const control = page.getByRole('checkbox', { name: 'Monitor movie', exact: true });
  await control.uncheck();
  await expect(page.getByText('Unable to confirm monitoring. Reload monitoring before trying again.')).toBeVisible();
  await expect(control).toBeChecked(); await expect(control).toBeDisabled();
  await page.getByRole('button', { name: 'Reload monitoring', exact: true }).click();
  await expect(control).toBeEnabled(); await expect(control).not.toBeChecked();
  expect(writes).toBe(1); expect(reads).toBe(3); expect(mutations).toEqual([]);
});
