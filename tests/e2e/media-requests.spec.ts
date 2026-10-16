import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const film = { type: 'movies', tmdbId: 10, title: 'Requested movie', year: '2027', poster: '', overview: 'A requested movie synopsis' };
const series = { type: 'series', tmdbId: 20, tvdbId: 200, title: 'Requested series', year: '2027', poster: '', overview: 'A requested series synopsis', seasons: [{ number: 1, name: 'First', episodeCount: 5 }, { number: 2, name: 'Second', episodeCount: 5 }] };
const pending = { id: 'request-id', ...film, seasons: null, status: 'pending', createdAt: 1700000000000, subscribers: [{ id: 'guest', name: 'Guest' }] };
async function mock(page: Page, role = 'user', initial: Record<string, unknown>[] = []) {
  const state = { items: initial, writes: [] as { path: string; body: Record<string, unknown> }[], available: false, failedList: false };
  await page.addInitScript(() => localStorage.setItem('flix-session:/flix-api', JSON.stringify({ token: 'f'.repeat(64), expiresAt: Date.now() + 86400000 })));
  await page.route('**/session', route => route.fulfill({ json: { enabled: true, authenticated: true, role } }));
  await page.route('**/auth', route => route.fulfill({ json: { enabled: true } }));
  await page.route('**/requests**', async route => {
    if (route.request().resourceType() === 'document') return route.fallback();
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/flix-api/, '').replace(/^\/requests/, '');
    const method = route.request().method();
    if (method === 'POST') {
      const body = route.request().postDataJSON() ?? {};
      state.writes.push({ path, body });
      if (path.endsWith('/approve')) state.items[0] = { ...state.items[0], status: 'approved' };
      else if (path.endsWith('/reject')) state.items[0] = { ...state.items[0], status: 'rejected', reason: body.reason };
      else if (path.endsWith('/check')) state.items[0] = { ...state.items[0], status: 'pending' };
      else state.items.push({ ...pending, ...(body.type === 'movies' ? film : series), seasons: body.seasons });
      return route.fulfill({ json: state.items[0] ?? {} });
    }
    if (path === '/catalog/search') return route.fulfill({ json: { results: [url.searchParams.get('type') === 'series' ? series : film], page: 1, totalPages: 1 } });
    if (path.startsWith('/catalog/')) {
      const item = path.includes('/series/') ? series : film;
      return route.fulfill({ json: { ...item, availability: state.available ? 'available' : 'missing', requests: state.items.filter(request => request.type === item.type).map(request => ({ id: request.id, seasons: request.seasons, status: request.status, following: true })) } });
    }
    if (path === '/options') return route.fulfill({ json: url.searchParams.has('instance') ? { profiles: [{ id: 1, name: 'HD' }], folders: ['/movies'] } : { instances: ['Primary'] } });
    if (state.failedList) return route.fulfill({ status: 503, json: { error: 'Requests unavailable.' } });
    return route.fulfill({ json: { items: state.items, total: state.items.length, page: 1 } });
  });
  return state;
}

test('guest requests a film, sees pending approval and never accesses service credentials', async ({ page, mutations }, testInfo) => {
  const state = await mock(page);
  const unsafe: string[] = [];
  page.on('request', request => { if (/\/instances$|radarr\.test|sonarr\.test/.test(request.url())) unsafe.push(request.url()); });
  await page.goto('/requests');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Requested movie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Requested movie', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('requests-browse.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open Requested movie', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request media', exact: true });
  await expect(dialog.getByText('A requested movie synopsis', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(dialog.getByText('Your request has been saved.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Follow request', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'My requests', exact: true }).click();
  await expect(page.getByText('Pending approval', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('requests-list.png'), fullPage: true });
  expect(state.writes).toEqual([{ path: '', body: { type: 'movies', tmdbId: 10, seasons: null } }]);
  expect(unsafe).toEqual([]); expect(mutations).toEqual([]);
});
test('guest chooses a season instead of requesting every season', async ({ page, mutations }) => {
  const state = await mock(page);
  await page.goto('/requests');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Requested series');
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await page.getByRole('button', { name: 'Open Requested series', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request media', exact: true });
  await dialog.getByLabel('Choose seasons', { exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Seasons', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Season 2 · Second', exact: true }).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(dialog.getByText('Your request has been saved.', { exact: true })).toBeVisible();
  expect(state.writes[0]!.body.seasons).toEqual([2]); expect(mutations).toEqual([]);
});
test('available movies cannot generate a redundant request', async ({ page, mutations }) => {
  const state = await mock(page); state.available = true;
  await page.goto('/requests');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Movie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Open Requested movie', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Request media', exact: true });
  await expect(dialog.getByText('Available', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send request', exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]); expect(mutations).toEqual([]);
});
test('administrator approves a request with server-provided instance, profile and folder', async ({ page, mutations }) => {
  const state = await mock(page, 'admin', [{ ...pending }]);
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review request', exact: true });
  await expect(dialog.getByRole('button', { name: 'Approve request', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Approve request', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/request-id/approve', body: { instance: 'Primary', profileId: 1, rootFolder: '/movies' } }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});
test('administrator can refuse with a reason without submitting an approval', async ({ page, mutations }) => {
  const state = await mock(page, 'admin', [{ ...pending }]);
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review request', exact: true });
  await dialog.getByRole('textbox', { name: 'Refusal reason (optional)', exact: true }).fill('Not for this library');
  await dialog.getByRole('button', { name: 'Refuse', exact: true }).click();
  await expect(page.getByText('Refused', { exact: true })).toBeVisible();
  await expect(page.getByText('Not for this library', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/request-id/reject', body: { reason: 'Not for this library' } }]); expect(mutations).toEqual([]);
});
test('uncertain approvals offer a read-only service check instead of another add', async ({ page, mutations }) => {
  const state = await mock(page, 'admin', [{ ...pending, status: 'needs-review' }]);
  await page.goto('/requests');
  await expect(page.getByRole('button', { name: 'Review request', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check service', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review request', exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/request-id/check', body: {} }]); expect(mutations).toEqual([]);
});
test('initial loading never flashes the empty request state', async ({ page, mutations }) => {
  await mock(page, 'admin');
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/requests?page=*', async route => { await barrier; return route.fulfill({ json: { items: [], total: 0, page: 1 } }); });
  await page.goto('/requests');
  await expect(page.getByRole('progressbar', { name: 'Loading data...', exact: true })).toBeVisible();
  await expect(page.getByText('No requests yet.', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('No requests yet.', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('malformed request data shows a retryable error rather than crashing the page', async ({ page, mutations }) => {
  await mock(page, 'admin');
  let valid = false;
  await page.route('**/requests?page=*', route => route.fulfill({ json: { items: valid ? [] : [{ ...pending, type: 'series', seasons: undefined }], total: valid ? 0 : 1, page: 1 } }));
  await page.goto('/requests');
  await expect(page.getByText('Requests unavailable.', { exact: true })).toBeVisible();
  valid = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('No requests yet.', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('an uncertain approval cannot be resubmitted from the same dialog', async ({ page, mutations }) => {
  await mock(page, 'admin', [{ ...pending }]);
  let approvals = 0;
  await page.route('**/requests/request-id/approve', route => {
    approvals++;
    return route.fulfill({ status: 502, json: { error: 'Media service request failed.' } });
  });
  await page.goto('/requests');
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review request', exact: true });
  await dialog.getByRole('button', { name: 'Approve request', exact: true }).click();
  await expect(dialog.getByText('Media service request failed.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Approve request', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Refuse', exact: true })).toBeDisabled();
  expect(approvals).toBe(1); expect(mutations).toEqual([]);
});
test('request and account routes remain API-only', async ({ page, mutations }) => {
  await mock(page);
  const standalone = process.env.FLIX_TEST_API_MODE === 'false';
  const apiReads: string[] = [];
  page.on('request', request => { if (request.url().includes('/flix-api/') || new URL(request.url()).hostname === 'flix.test') apiReads.push(request.url()); });
  await page.goto('/requests');
  if (standalone) {
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByText('Requests', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Users', { exact: true })).toHaveCount(0);
    for (const path of ['/account', '/join', '/users']) { await page.goto(path); await expect(page).toHaveURL(/\/dashboard$/); }
    expect(apiReads).toEqual([]);
  } else {
    await expect(page).toHaveURL(/\/requests$/);
    await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
  }
  expect(mutations).toEqual([]);
});
test.describe('French request controls', () => {
  test.use({ locale: 'fr-FR' });
  test('translates request navigation, status and dialog accessibility labels', async ({ page, mutations }) => {
    await mock(page, 'user', [{ ...pending }]);
    await page.goto('/requests');
    await expect(page.getByRole('heading', { name: 'Demandes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mes demandes', exact: true }).click();
    await expect(page.getByText('En attente de validation', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rechercher un média', exact: true }).click();
    await page.getByRole('textbox', { name: 'Rechercher', exact: true }).fill('Film');
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
    await page.getByRole('button', { name: 'Ouvrir Requested movie', exact: true }).click();
    await page.getByRole('dialog', { name: 'Demander un média', exact: true }).getByRole('button', { name: 'Fermer', exact: true }).click();
    expect(mutations).toEqual([]);
  });
});
