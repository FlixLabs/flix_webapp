import { test, expect } from './fixtures';

function gate() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

test('native storage is revealed once root folders and disks have both settled', async ({ page, mutations }) => {
  const roots = gate();
  let disksRead = 0;
  await page.route('**/api/v3/diskspace?*', route => {
    disksRead++;
    return route.fulfill({ json: [{ path: '/', freeSpace: 5e9, totalSpace: 100e9 }] });
  });
  await page.route('**/api/v3/rootfolder?*', async route => {
    await roots.pending;
    await route.fulfill({ json: [{ path: '/movies', accessible: true, freeSpace: 5e9 }] });
  });
  try {
    await page.goto('/system');
    await expect(page.getByRole('status', { name: 'Loading system information', exact: true })).toBeVisible();
    await expect.poll(() => disksRead).toBe(2);
    await expect(page.getByTestId('system-content')).toHaveCount(0);
    await expect(page.getByText('No storage location available.', { exact: true })).toHaveCount(0);
    roots.release();
    await expect(page.getByTestId('system-content')).toBeVisible();
    await expect(page.getByText('Movie Storage', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading system information', exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  } finally { roots.release(); }
});

test('agent storage has one initial placeholder and refresh does not move its cards', async ({ page, mutations }) => {
  await page.route('**/instances', route => route.fulfill({ json: [{ name: 'Storage test', has_storage_agent: true,
    radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }] }));
  const first = gate(); const refresh = gate(); let requests = 0;
  await page.route('**/storage/**', async route => {
    const request = ++requests;
    await (request === 1 ? first.pending : refresh.pending);
    await route.fulfill({ json: { collectedAt: '2026-10-15T10:00:00Z', locations: ['movies', 'series', 'downloads'].map(id => ({
      id, path: `/storage/${id}`, available: true, totalBytes: 100e9, availableBytes: 50e9, usagePercent: 50,
    })) } });
  });
  try {
    await page.goto('/system');
    await expect(page.getByRole('status', { name: 'Loading system information', exact: true })).toBeVisible();
    await expect(page.getByText('Movie Storage', { exact: true })).toHaveCount(0);
    first.release();
    const downloads = page.locator('.v-card').filter({ has: page.getByText('Download Storage', { exact: true }) });
    await expect(downloads.locator('table')).toBeVisible();
    const position = () => downloads.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    const top = await position();
    await page.getByRole('button', { name: 'Refresh Storage', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByTestId('system-content')).toHaveAttribute('aria-busy', 'true');
    await expect(downloads.locator('table')).toBeVisible();
    expect(Math.abs(await position() - top)).toBeLessThan(1);
    refresh.release();
    await expect(page.getByTestId('system-content')).toHaveAttribute('aria-busy', 'false');
    expect(Math.abs(await position() - top)).toBeLessThan(1);
    expect(mutations).toEqual([]);
  } finally { first.release(); refresh.release(); }
});

test('status waits for both host configuration and system status without hiding navigation', async ({ page, mutations }) => {
  const status = gate();
  await page.route('**/api/v3/config/host?*', route => route.fulfill({ json: { instanceName: 'Test host' } }));
  await page.route('**/api/v3/system/status?*', async route => {
    await status.pending;
    await route.fulfill({ json: { version: '1.0', startTime: '2026-10-15T10:00:00Z' } });
  });
  try {
    await page.goto('/system');
    await page.getByRole('button', { name: 'Status', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Loading system information', exact: true })).toBeVisible();
    await expect(page.getByText('Host Configuration', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Storage', exact: true })).toBeVisible();
    status.release();
    await expect(page.getByText('Host Configuration', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading system information', exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  } finally { status.release(); }
});
