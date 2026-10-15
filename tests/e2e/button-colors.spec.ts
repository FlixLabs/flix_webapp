import { test, expect, movie, releaseTitle } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectSemanticColor(button: Locator, token: string) {
  await expect(button).toBeVisible();
  await expect(button).toHaveClass(new RegExp(`text-${token}`));
  await expect.poll(() => button.evaluate((el, token) => {
    // Vuetify applies the theme's high-emphasis opacity to neutral text.
    const probe = document.createElement('span');
    probe.style.color = token === 'on-surface'
      ? 'color-mix(in srgb, rgb(var(--v-theme-on-surface)) calc(var(--v-high-emphasis-opacity) * 100%), transparent)'
      : `rgb(var(--v-theme-${token}))`;
    el.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const actual = getComputedStyle(el).color;
    return actual === expected ? null : { actual, expected };
  }, token)).toBeNull();
}

for (const theme of ['flixDark', 'flixLight']) {
  test(`dialog actions use semantic colors in ${theme}`, async ({ page, mutations }) => {
    await page.addInitScript(theme => localStorage.setItem('flix_theme', theme), theme);
    await page.route('**/color', route => route.fulfill({ json: { primary: '#F08C28' } }));
    await page.goto('/library');
    const types = page.locator('.media-type-toggle');
    await expect(types.getByRole('button', { name: /^Movies/ })).toHaveClass(/text-primary/);
    await expect(types.getByRole('button', { name: /^Series/ })).not.toHaveClass(/text-primary/);
    const tools = page.getByRole('button', { name: 'Library tools', exact: true });
    await expect(tools).not.toHaveClass(/text-primary/);
    await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
    await expectSemanticColor(sheet.getByRole('button', { name: 'Close', exact: true }), 'on-surface');
    await expectSemanticColor(sheet.getByRole('button', { name: 'Choose Release', exact: true }), 'primary');
    const search = sheet.getByRole('button', { name: 'Search Again', exact: true });
    await expectSemanticColor(search, 'primary');
    await expect.poll(() => search.evaluate(el => getComputedStyle(el).color)).toBe('rgb(240, 140, 40)');
    const remove = sheet.getByRole('button', { name: 'Remove', exact: true });
    await expectSemanticColor(remove, 'error');
    await remove.click();
    const deletion = page.getByRole('dialog', { name: 'Confirm deletion', exact: true });
    await expectSemanticColor(deletion.getByRole('button', { name: 'Confirm', exact: true }), 'error');
    await expectSemanticColor(deletion.getByRole('button', { name: 'Cancel', exact: true }), 'on-surface');
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
    await sheet.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const releases = page.getByRole('dialog', { name: `Choose Release - ${movie.title}`, exact: true });
    await expectSemanticColor(releases.getByRole('button', { name: 'Close', exact: true }), 'on-surface');
    await expectSemanticColor(releases.getByRole('button', { name: 'Search releases', exact: true }), 'primary');
    await releases.getByRole('button', { name: `Choose ${releaseTitle}`, exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Download this release?', exact: true });
    await expectSemanticColor(confirmation.getByRole('button', { name: 'Download', exact: true }), 'primary');
    await expectSemanticColor(confirmation.getByRole('button', { name: 'Cancel', exact: true }), 'on-surface');
    expect(mutations).toEqual([]);
  });
}
