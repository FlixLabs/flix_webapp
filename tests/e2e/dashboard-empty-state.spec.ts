import { test, expect } from './fixtures';

for (const type of ['movies', 'series'] as const) {
  for (const restored of [false, true]) {
    test(`${type}: no empty-state flash during ${restored ? 'restored' : 'new'} search or delayed responses`, async ({ page, mutations }) => {
      await page.addInitScript(({ type, restored }) => {
        localStorage.setItem('dashboard_media_type', type);
        if (restored) localStorage.setItem(`dashboard_search_${location.href}`, 'Absent');
        const flashes: string[] = [];
        (window as unknown as { emptyFlashes: string[] }).emptyFlashes = flashes;
        new MutationObserver(() => {
          for (const el of document.querySelectorAll('.v-alert')) {
            if (/No (movies|series) found/.test(el.textContent ?? '')) flashes.push(el.textContent ?? '');
          }
        }).observe(document, { subtree: true, childList: true, characterData: true });
      }, { type, restored });
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      let started = 0;
      await page.route(/\/api\/v3\/(movie|series)\/lookup\?/, async route => {
        started++;
        await pending;
        await route.fulfill({ json: [] });
      });
      try {
        await page.goto('/dashboard');
        const input = page.getByRole('textbox', { name: 'Search', exact: true });
        if (!restored) await input.fill('Absent');
        await expect(input).toHaveValue('Absent');
        await expect.poll(() => started).toBe(2);
        expect(await page.evaluate(() => (window as unknown as { emptyFlashes: string[] }).emptyFlashes)).toEqual([]);
        const results = page.getByRole('region', { name: type === 'movies' ? 'Movie results' : 'Series results', exact: true });
        await expect(results).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByText(type === 'movies' ? 'No movies found' : 'No series found', { exact: true })).toHaveCount(0);
        release();
        await expect(results).toHaveAttribute('aria-busy', 'false');
        await expect(page.getByText(type === 'movies' ? 'No movies found' : 'No series found', { exact: true })).toBeVisible();
        expect(mutations).toEqual([]);
      } finally { release(); }
    });
  }
}

test('a failed search shows its error, not an empty result', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/(movie|series)\/lookup\?/, route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Absent');
  await expect(page.getByText('Search failed (503)', { exact: false })).toBeVisible();
  await expect(page.getByText(/No (movies|series) found/)).toHaveCount(0);
  expect(mutations).toEqual([]);
});
