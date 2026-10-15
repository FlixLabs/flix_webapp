import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';
const records = Array.from({ length: 13 }, (_, index) => ({ ...movie, id: index + 1, title: `Movie ${String(index + 1).padStart(2, '0')}`, monitored: true }));

async function chooseAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Selection actions', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('selection spans pages, never opens sheets and resets when filtering', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: records }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await expect(page.getByText('12 selected across pages')).toBeVisible();
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Movie 13', exact: true }).check();
  await expect(page.getByText('13 selected across pages')).toBeVisible();
  await expect(page.locator('.v-dialog')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Movie 01');
  await expect(page.getByText('0 selected across pages')).toBeVisible();
  expect(mutations).toEqual([]);
});

test('batch search sends one command per selected eligible media', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [records[0], { ...records[1], status: 'announced' }, records[2]] }));
  await page.goto('/library'); await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await chooseAction(page, 'Search selected');
  await expect(page.getByText('3 succeeded, 0 failed, 0 skipped.')).toBeVisible();
  expect(mutations.map(item => item.body)).toEqual([{ name: 'MoviesSearch', movieIds: [1] }, { name: 'MoviesSearch', movieIds: [2] }, { name: 'MoviesSearch', movieIds: [3] }]);
  await expect(page.getByRole('checkbox', { name: 'Select Movie 02', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Select Movie 01', exact: true })).not.toBeChecked();
});

test('batch deletion requires confirmation and keeps failures selected after refreshing', async ({ page, mutations }) => {
  let remaining = records.slice(0, 2);
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: remaining }));
  const deleted: number[] = [];
  await page.route('**/api/v3/movie/*?deleteFiles=true', route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    expect(route.request().method()).toBe('DELETE'); deleted.push(id);
    if (id === 2) return route.fulfill({ status: 500, json: {} });
    remaining = remaining.filter(item => item.id !== id); return route.fulfill({ status: 204 });
  });
  await page.goto('/library'); await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await chooseAction(page, 'Remove selected');
  await expect(page.locator('.v-dialog')).toContainText('delete their files');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(deleted).toEqual([]);
  await chooseAction(page, 'Remove selected');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('1 succeeded, 1 failed, 0 skipped.')).toBeVisible();
  await expect(page.locator('.media-card')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Select Movie 02', exact: true })).toBeChecked();
  expect(deleted).toEqual([1, 2]); expect(mutations).toEqual([]);
});

test('batch monitoring preserves resource settings and confirms each saved state', async ({ page, mutations }) => {
  const resources = records.slice(0, 2).map(item => ({ ...item, path: `/movies/${item.title}`, qualityProfileId: 4 }));
  const writes: unknown[] = [];
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: resources }));
  await page.route('**/api/v3/movie/*', route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').pop()) - 1;
    if (route.request().method() === 'PUT') { resources[index] = route.request().postDataJSON(); writes.push(resources[index]); }
    return route.fulfill({ json: resources[index] });
  });
  await page.goto('/library'); await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await chooseAction(page, 'Unmonitor selected');
  await expect(page.getByText('2 succeeded, 0 failed, 0 skipped.')).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(resources.every(item => !item.monitored && item.qualityProfileId === 4 && item.path.startsWith('/movies/'))).toBe(true);
  await expect(page.getByText('0 selected across pages')).toBeVisible();
  expect(mutations).toEqual([]);
});

test('a running batch can stop after the in-flight command', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: records.slice(0, 3) }));
  let writes = 0; let finish!: () => Promise<void>;
  await page.route('**/api/v3/command', route => {
    writes++;
    finish = () => route.fulfill({ json: {} });
  });
  await page.goto('/library'); await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await chooseAction(page, 'Search selected');
  await expect.poll(() => writes).toBe(1);
  await page.getByRole('button', { name: 'Stop after current item', exact: true }).click();
  await finish();
  await expect(page.getByText('1 succeeded, 0 failed, 0 skipped. Stopped before all media were processed.')).toBeVisible();
  expect(writes).toBe(1);
  expect(mutations).toEqual([]);
  await expect(page.getByText('2 selected across pages')).toBeVisible();
});

test('changing instance clears selection and blocks old cards until the new library loads', async ({ page, mutations }) => {
  const config = { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' };
  await page.route('**/instances', route => route.fulfill({ json: [
    { name: 'Test instance', radarr: config, sonarr: config },
    { name: 'Second instance', radarr: { ...config, base_url: 'http://second.test' }, sonarr: config },
  ] }));
  await page.route(/radarr.test\/api\/v3\/movie\?/, route => route.fulfill({ json: records.slice(0, 1) }));
  let finish!: () => Promise<void>;
  await page.route(/second.test\/api\/v3\/movie\?/, route => { finish = () => route.fulfill({ json: records.slice(1, 2) }); });
  await page.goto('/library'); await page.getByRole('button', { name: 'Select media', exact: true }).click();
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await expect(page.getByText('1 selected across pages')).toBeVisible();
  await page.getByRole('combobox', { name: 'Instance', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Second instance', exact: true }).click();
  await expect(page.getByText('0 selected across pages')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select Movie 01', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Select page', exact: true })).toBeDisabled();
  await expect.poll(() => typeof finish).toBe('function'); await finish();
  await expect(page.getByRole('checkbox', { name: 'Select Movie 02', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});
