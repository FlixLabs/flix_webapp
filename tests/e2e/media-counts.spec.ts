import { test, expect } from './fixtures';

for (const path of ['/library', '/dashboard', '/outings', '/downloads', '/calendar']) {
  test(`${path} shows unknown counts while loading and zero only after an empty response`, async ({ page, mutations }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/api\/v3\/(movie|series|collection)(\/lookup)?\?|\/api\/v3\/(queue|calendar)\?|\/discover\/(movie|tv)\?/, async route => {
      await held;
      const url = new URL(route.request().url());
      const json = /\/discover\/(movie|tv)$/.test(url.pathname) ? { results: [], total_pages: 1 }
        : url.pathname.endsWith('/queue') ? { records: [], totalRecords: 0 } : [];
      await route.fulfill({ json }).catch(() => {});
    });
    try {
      await page.goto(path);
      if (path === '/dashboard') {
        await expect(page.getByRole('button', { name: 'Movies (0)', exact: true })).toBeVisible();
        await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
      }
      await expect(page.getByRole('button', { name: 'Movies (...)', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Series (...)', exact: true })).toBeVisible();
      if (path === '/library') await expect(page.getByRole('button', { name: 'Collections (...)', exact: true })).toBeVisible();
      release();
      await expect(page.getByRole('button', { name: 'Movies (0)', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Series (0)', exact: true })).toBeVisible();
      if (path === '/library') await expect(page.getByRole('button', { name: 'Collections (0)', exact: true })).toBeVisible();
      expect(mutations).toEqual([]);
    } finally { release(); }
  });
}
