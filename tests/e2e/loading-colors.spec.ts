import { test, expect, movie } from './fixtures';

for (const theme of ['flixDark', 'flixLight']) {
  for (const view of ['releases', 'downloads']) {
    test(`${view} loading bar follows the custom primary color in ${theme}`, async ({ page, mutations, isMobile }) => {
      await page.addInitScript(theme => localStorage.setItem('flix_theme', theme), theme);
      await page.route('**/color', route => route.fulfill({ json: { primary: '#F08C28' } }));
      let finish!: () => void;
      const pending = new Promise<void>(resolve => { finish = resolve; });
      await page.route(view === 'releases' ? '**/api/v3/release?*' : '**/api/v3/queue?*', async route => {
        await pending;
        await route.fulfill({ json: view === 'releases' ? [] : { totalRecords: 0, records: [] } });
      });
      try {
        await page.goto(view === 'releases' ? '/library' : '/downloads');
        if (view === 'releases') {
          await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
          await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
        }
        const scope = view === 'releases'
          ? page.getByRole('dialog', { name: `Choose Release - ${movie.title}`, exact: true })
          : page.locator('.downloads-table');
        const bar = scope.locator('.v-data-table-progress .v-progress-linear');
        if (isMobile) {
          // Vuetify replaces the header loader with a loading row on mobile.
          await expect(scope.locator('.v-data-table-rows-loading')).toBeVisible();
          await expect(bar).toHaveCount(0);
        } else {
          await expect(bar).toBeVisible();
          const segment = bar.locator('.v-progress-linear__indeterminate .long');
          await expect(segment).toHaveClass(/bg-primary/);
          await expect.poll(() => segment.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(240, 140, 40)');
        }
        finish();
        await expect(bar).toHaveCount(0);
        await expect(scope.locator('.v-data-table-rows-loading')).toHaveCount(0);
        expect(mutations).toEqual([]);
      } finally {
        finish();
      }
    });
  }
}
