import { test, expect, movie, series } from './fixtures';
import type { Locator } from '@playwright/test';

async function settle(dialog: Locator) {
  await dialog.evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
}
async function openSettings(dialog: Locator) {
  await settle(dialog);
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
  await expect(dialog.locator('.media-supplemental-details')).toBeVisible();
  await dialog.getByRole('button', { name: 'Media settings', exact: true }).scrollIntoViewIfNeeded();
  await dialog.getByRole('button', { name: 'Media settings', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Quality profile', exact: true })).toBeEnabled();
  await settle(dialog);
}

for (const view of ['library', 'dashboard', 'outings']) {
  test(`${view} saves existing movie profiles and tags without a search or file move`, async ({ page, mutations }) => {
    let resource = { ...movie, qualityProfileId: 1, tags: [3], path: '/movies/Example', monitored: true };
    const writes: typeof resource[] = []; const reads: string[] = [];
    await page.route('**/api/v3/movie/1*', route => {
      reads.push(route.request().method());
      if (route.request().method() === 'PUT') {
        expect(new URL(route.request().url()).searchParams.get('moveFiles')).toBe('false');
        resource = route.request().postDataJSON(); writes.push(resource);
        return route.fulfill({ status: 202, json: resource });
      }
      return route.fulfill({ json: resource });
    });
    await page.route(/\/api\/v3\/qualityprofile(?:\?|$)/i, route => route.fulfill({ json: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD' }] }));
    await page.route('**/api/v3/tag', route => route.fulfill({ json: [{ id: 3, label: 'Original' }, { id: 7, label: 'Family' }] }));
    await page.route(/\/discover\/movie\?/, route => route.fulfill({ json: { results: [{ id: movie.tmdbId, title: movie.title, release_date: '2026-10-20' }], total_pages: 1 } }));
    await page.goto(`/${view}`);
    if (view === 'dashboard') {
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: `Details for ${movie.title}`, exact: true }).click();
    } else {
      if (view === 'outings') await expect(page.locator('.media-card')).toContainText('Existing');
      await page.locator('.media-card').click();
    }
    const dialog = page.locator('.v-dialog'); expect(reads).toEqual([]);
    await openSettings(dialog);
    await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Quality profile', exact: true }).locator('..').click();
    await page.getByRole('option', { name: 'HD', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Tags', exact: true }).locator('..').click();
    await page.getByRole('option', { name: 'Family', exact: true }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(dialog).toContainText('Media settings saved.');
    expect(writes).toEqual([{ ...movie, qualityProfileId: 2, tags: [3, 7], path: '/movies/Example', monitored: true }]);
    expect(reads).toEqual(['GET', 'GET', 'PUT', 'GET']); expect(mutations).toEqual([]);
    await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  });
}

test('Sonarr 4 does not expose an editable obsolete language profile', async ({ page, mutations }) => {
  await page.route('**/api/v3/series/2', route => route.fulfill({ json: { ...series, qualityProfileId: 1, tags: [], languageProfileId: 1 } }));
  await page.route('**/api/v3/qualityprofile', route => route.fulfill({ json: [{ id: 1, name: 'Any' }] }));
  await page.route('**/api/v3/tag', route => route.fulfill({ json: [] }));
  await page.route('**/api/v3/system/status', route => route.fulfill({ json: { version: '4.0.0' } }));
  await page.goto('/library'); await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog.locator('.v-expansion-panel-title').filter({ hasText: 'Season 1' })).toBeAttached();
  await openSettings(dialog);
  await expect(dialog.getByRole('combobox', { name: 'Language profile', exact: true })).not.toBeAttached();
  await expect(dialog).toContainText('No separate editable language profile was detected.');
  expect(mutations).toEqual([]);
});

test('failed settings updates require reloading instead of repeating the PUT', async ({ page, mutations }) => {
  let puts = 0;
  await page.route('**/api/v3/movie/1*', route => {
    if (route.request().method() === 'PUT') { puts++; return route.fulfill({ status: 503, json: {} }); }
    return route.fulfill({ json: { ...movie, qualityProfileId: 1, tags: [] } });
  });
  await page.route('**/api/v3/qualityprofile', route => route.fulfill({ json: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD' }] }));
  await page.route('**/api/v3/tag', route => route.fulfill({ json: [] }));
  await page.goto('/library'); await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog'); await openSettings(dialog);
  await dialog.getByRole('combobox', { name: 'Quality profile', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(dialog).toContainText('Unable to confirm settings.');
  await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reload settings', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Quality profile', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  expect(puts).toBe(1); expect(mutations).toEqual([]);
});

test('Sonarr 3 language profiles can be changed without changing seasons', async ({ page, mutations }) => {
  let resource = { ...series, qualityProfileId: 1, tags: [], languageProfileId: 1, seasons: [{ seasonNumber: 1, monitored: false }] };
  const writes: typeof resource[] = [];
  await page.route('**/api/v3/series/2*', route => {
    if (route.request().method() === 'PUT') { resource = route.request().postDataJSON(); writes.push(resource); }
    return route.fulfill({ json: resource });
  });
  await page.route('**/api/v3/qualityprofile', route => route.fulfill({ json: [{ id: 1, name: 'Any' }] }));
  await page.route('**/api/v3/tag', route => route.fulfill({ json: [] }));
  await page.route('**/api/v3/system/status', route => route.fulfill({ json: { version: '3.0.10.1567' } }));
  await page.route('**/api/v3/languageprofile', route => route.fulfill({ json: [{ id: 1, name: 'English' }, { id: 2, name: 'French' }] }));
  await page.goto('/library'); await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click(); const dialog = page.locator('.v-dialog');
  await expect(dialog.locator('.v-expansion-panel-title').filter({ hasText: 'Season 1' })).toBeAttached();
  await openSettings(dialog);
  await dialog.getByRole('combobox', { name: 'Language profile', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'French', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(dialog).toContainText('Media settings saved.');
  expect(writes).toEqual([{ ...series, qualityProfileId: 1, tags: [], languageProfileId: 2, seasons: [{ seasonNumber: 1, monitored: false }] }]);
  expect(mutations).toEqual([]);
});

test('saving settings locks navigation, monitoring and destructive actions', async ({ page, mutations }) => {
  let resource = { ...movie, qualityProfileId: 1, tags: [], monitored: true };
  let complete!: () => Promise<void>;
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [resource, { ...resource, id: 2, tmdbId: 11, title: 'Other movie' }] }));
  await page.route('**/api/v3/movie/1*', async route => {
    if (route.request().method() === 'PUT') {
      resource = route.request().postDataJSON();
      await new Promise<void>(resolve => { complete = async () => { await route.fulfill({ json: resource }); resolve(); }; });
      return;
    }
    return route.fulfill({ json: resource });
  });
  await page.route('**/api/v3/qualityprofile', route => route.fulfill({ json: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD' }] }));
  await page.route('**/api/v3/tag', route => route.fulfill({ json: [] }));
  await page.goto('/library'); await page.locator('.media-card').first().click();
  const dialog = page.locator('.v-dialog'); await openSettings(dialog);
  await dialog.getByRole('combobox', { name: 'Quality profile', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect.poll(() => !!complete).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Next media' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Choose Release', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Monitor movie', exact: true })).toBeDisabled();
  await complete(); await expect(dialog).toContainText('Media settings saved.');
  await expect(dialog.getByRole('button', { name: 'Next media' })).toBeEnabled();
  expect(mutations).toEqual([]);
});
