import { test, expect, movie, series } from './fixtures';
import { calendarRange } from '../../src/composables/useCalendar';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00'));
});
async function events(page: import('@playwright/test').Page, requests: string[]) {
  await page.route(/\/api\/v3\/calendar\?/, route => {
    requests.push(route.request().url());
    return route.fulfill({ json: route.request().url().includes('radarr') ? [
      { ...movie, title: 'Example movie', digitalRelease: '2026-10-05', monitored: true },
      { ...movie, id: 3, title: 'Missing movie', digitalRelease: '2026-10-06', hasFile: false, monitored: true },
      { ...movie, id: 4, title: 'Future movie', digitalRelease: '2026-10-20', hasFile: false, monitored: false },
      { ...movie, id: 5, title: 'Unknown movie', digitalRelease: '2026-10-08', hasFile: undefined, monitored: undefined },
      { ...movie, id: 6, title: 'Cinema movie', inCinemas: '2026-10-05', hasFile: false, monitored: true },
    ] : [{ id: 22, seriesId: series.id, title: 'Pilot', airDate: '2026-10-07', hasFile: false, monitored: true, seasonNumber: 1, episodeNumber: 1, series: { ...series, monitored: true } }] });
  });
}
async function filter(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('combobox', { name: 'Event filter', exact: true }).locator('..').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('uses a readable agenda on mobile and a grid on desktop', async ({ page, mutations }, info) => {
  const requests: string[] = []; await events(page, requests); await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Movies (5)', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') {
    await expect(page.getByLabel('Calendar agenda', { exact: true })).toBeVisible();
    await expect(page.locator('.calendar-entry')).toHaveCount(6);
  } else await expect(page.locator('.v-calendar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/flix-calendar-${info.project.name}.png`, fullPage: true });
  expect(mutations).toEqual([]);
});

test('filters reported file and monitoring states without additional requests', async ({ page, mutations }) => {
  const requests: string[] = []; await events(page, requests); await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Movies (5)', exact: true })).toBeVisible();
  await filter(page, 'Missing');
  await expect(page.getByRole('button', { name: 'Movies (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Series (1)', exact: true })).toBeVisible();
  await filter(page, 'Available');
  await expect(page.getByRole('button', { name: 'Movies (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Series (0)', exact: true })).toBeVisible();
  await filter(page, 'Monitored');
  await expect(page.getByRole('button', { name: 'Movies (3)', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2); expect(mutations).toEqual([]);
});

test('opens a movie sheet from an agenda event and restores the calendar on Back', async ({ page, mutations }) => {
  const requests: string[] = []; await events(page, requests); await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Movies (5)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.locator('.calendar-entry').filter({ hasText: 'Example movie (Digital)' }).click();
  await expect(page).toHaveURL(/\/library\?media=movies&id=1/);
  await expect(page.locator('.v-dialog .title-line')).toHaveText('Example movie');
  await page.goBack();
  await expect(page.getByLabel('Calendar agenda', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Event filter', exact: true })).toHaveValue('All events');
  expect(mutations).toEqual([]);
});

test('opens a movie sheet directly from a calendar event', async ({ page, mutations }) => {
  const requests: string[] = []; await events(page, requests); await page.goto('/calendar');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await filter(page, 'Available');
  await page.locator('.v-calendar .calendar-event-title').filter({ hasText: 'Example movie (Digital)' }).click();
  await expect(page).toHaveURL(/\/library\?media=movies&id=1/);
  await expect(page.locator('.v-dialog .title-line')).toHaveText('Example movie');
  expect(mutations).toEqual([]);
});

test('navigation and view changes request matching periods and Today returns to the current month', async ({ page, mutations }) => {
  const requests: string[] = []; await events(page, requests); await page.goto('/calendar');
  await expect.poll(() => requests.length).toBe(2);
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect.poll(() => requests.length).toBe(4);
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await expect.poll(() => requests.length).toBe(6);
  await page.getByRole('combobox', { name: 'Calendar view', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Week', exact: true }).click();
  await expect.poll(() => requests.length).toBe(8);
  const params = new URL(requests.at(-1)!).searchParams;
  const expected = calendarRange('2026-10-12', 'week');
  expect(params.get('start')).toBe(expected.start.toISOString());
  expect(params.get('end')).toBe(expected.end.toISOString());
  expect(mutations).toEqual([]);
});

test('agenda pagination limits scrolling and keeps data cached', async ({ page, mutations }) => {
  const requests: string[] = [];
  await page.route(/\/api\/v3\/calendar\?/, route => {
    requests.push(route.request().url());
    return route.fulfill({ json: route.request().url().includes('radarr') ? Array.from({ length: 10 }, (_, i) => ({ ...movie, id: i + 1, title: `Movie ${i + 1}`, digitalRelease: `2026-10-${String(i + 1).padStart(2, '0')}` })) : [] });
  });
  await page.goto('/calendar'); await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.locator('.calendar-agenda .v-card')).toHaveCount(7);
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(page.locator('.calendar-agenda .v-card')).toHaveCount(3);
  await expect(page.locator('.calendar-agenda')).toContainText('Movie 10');
  expect(requests).toHaveLength(2); expect(mutations).toEqual([]);
});

test('busy agenda days expose all full titles without an unbounded inline list', async ({ page, mutations }) => {
  const title = 'A very long movie title that should remain readable '.repeat(5);
  await page.route(/\/api\/v3\/calendar\?/, route => route.fulfill({ json: route.request().url().includes('radarr')
    ? Array.from({ length: 7 }, (_, i) => ({ ...movie, id: i + 1, title: i === 6 ? title : `Movie ${i + 1}`, digitalRelease: '2026-10-05' })) : [] }));
  await page.goto('/calendar'); await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.locator('.calendar-entry')).toHaveCount(4);
  await page.getByRole('button', { name: 'Show all 7 events', exact: true }).click();
  const dialog = page.locator('.v-dialog'); await expect(dialog.locator('.calendar-entry')).toHaveCount(7);
  await expect(dialog.getByText(`${title} (Digital)`, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('calendar and agenda preserve the selected theme without horizontal overflow', async ({ page, mutations }) => {
  const requests: string[] = []; await events(page, requests);
  for (const theme of ['flixLight', 'flixDark']) {
    await page.goto('/calendar');
    await page.evaluate(value => localStorage.setItem('flix_theme', value), theme);
    await page.goto('/calendar');
    await expect(page.locator('.v-application')).toHaveClass(new RegExp(`v-theme--${theme}`));
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.locator('.v-calendar')).toBeVisible();
    await expect(page.locator('.calendar-event-title').first()).toHaveCSS('white-space', 'normal');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    await expect(page.getByLabel('Calendar agenda', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(mutations).toEqual([]);
});
