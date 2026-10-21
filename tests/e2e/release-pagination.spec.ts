import { test, expect, movie, series } from './fixtures';

for (const mediaType of ['movies', 'series']) {
  test(`${mediaType} release lists default to 25 items and retain filtering`, async ({ page, mutations }) => {
    const media = mediaType === 'movies' ? movie : series;
    await page.route('**/api/v3/release?*', route => route.fulfill({ json: Array.from({ length: 30 }, (_, i) => ({
      guid: `release-${i + 1}`, indexerId: 7, title: `Release ${i + 1}`, downloadAllowed: true,
    })) }));
    await page.goto('/library');
    if (mediaType === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: `Open ${media.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Choose Release - ${media.title}`, exact: true });
    await expect(dialog.getByRole('button', { name: /^Choose Release \d+$/ })).toHaveCount(25);
    await expect(dialog.getByRole('button', { name: 'Choose Release 25', exact: true })).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Choose Release 26', exact: true })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Filter releases', exact: true }).fill('Release 30');
    await expect(dialog.getByRole('button', { name: /^Choose Release \d+$/ })).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: 'Choose Release 30', exact: true })).toHaveCount(1);
    expect(mutations).toEqual([]);
  });
}

for (const mediaType of ['movies', 'series']) {
  test(`${mediaType} releases and confirmation keep their contents while closing`, async ({ page, mutations }) => {
    const media = mediaType === 'movies' ? movie : series;
    await page.route('**/api/v3/release?*', route => route.fulfill({ json: [{
      guid: 'retained-release', indexerId: 7, title: 'Retained release', downloadAllowed: true,
    }] }));
    await page.goto('/library');
    if (mediaType === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: `Open ${media.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Choose Release - ${media.title}`, exact: true });
    await dialog.getByRole('textbox', { name: 'Filter releases', exact: true }).fill('Retained');
    await dialog.getByRole('button', { name: 'Choose Retained release', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Download this release?', exact: true });
    const retained = await confirmation.getByRole('button', { name: 'Cancel', exact: true }).evaluate(async button => {
      const overlay = button.closest('.v-dialog')!;
      const before = overlay.querySelector('.v-card-text')!.textContent;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return overlay.querySelector('.v-card-text')!.textContent === before;
    });
    expect(retained).toBe(true);
    await expect(confirmation).not.toBeVisible();
    const state = await dialog.getByRole('button', { name: 'Close', exact: true }).evaluate(async button => {
      const overlay = button.closest('.v-dialog')!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return { release: overlay.textContent?.includes('Retained release'),
        filter: Array.from(overlay.querySelectorAll('input')).some(input => input.value === 'Retained'),
        leaving: !!overlay.querySelector('.fade-transition-leave-active') };
    });
    expect(state).toEqual({ release: true, filter: true, leaving: true });
    await expect(dialog).not.toBeVisible();
    expect(mutations).toEqual([]);
  });
}
