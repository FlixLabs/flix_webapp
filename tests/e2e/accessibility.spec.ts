import { test, expect, movie, releaseTitle } from './fixtures';

test('search uses the native field focus border without an overlapping input outline', async ({ page, mutations }) => {
  await page.goto('/library');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await expect(search).toBeVisible();
  await search.click();
  await expect(search).toBeFocused();
  await expect(page.locator('.v-field').filter({ has: search })).toHaveClass(/v-field--focused/);
  expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(search).toBeFocused();
  expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(mutations).toEqual([]);
});

async function waitForDialog(page: import('@playwright/test').Page) {
  await expect.poll(() => page.locator('.v-overlay--active').evaluateAll(elements =>
    elements.flatMap(element => element.getAnimations({ subtree: true })).filter(animation =>
      animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)
    ).length
  )).toBe(0);
}

test('declares the UI language and supports the skip link with the keyboard', async ({ page, mutations }) => {
  await page.goto('/library');
  await expect(page.locator('.media-card').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(mutations).toEqual([]);
});

for (const path of ['/library', '/outings']) {
  for (const key of ['Enter', 'Space']) {
    test(`${path} opens cards with ${key}, traps focus and returns it after Escape`, async ({ page, mutations }) => {
      await page.route(/\/discover\/(movie|tv)\?/, route => route.fulfill({ json: { results: [{ ...movie, id: 10, release_date: '2026-10-01', first_air_date: '2026-10-01', name: movie.title }], total_pages: 1 } }));
      await page.goto(path);
      const card = page.getByRole('button', { name: 'Open Example movie', exact: true });
      await expect(card).toBeVisible();
      await card.focus();
      await page.keyboard.press(key);
      const dialog = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
      await expect(dialog).toBeVisible();
      await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
        expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(card).toBeFocused();
      expect(mutations).toEqual([]);
    });
  }
}

test('nested release dialogs are named and cancellation keeps focus in the media sheet', async ({ page, mutations }) => {
  await page.goto('/library');
  const card = page.getByRole('button', { name: 'Open Example movie', exact: true });
  await card.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
  const choose = sheet.getByRole('button', { name: 'Choose Release', exact: true });
  await choose.press('Enter');
  const releases = page.getByRole('dialog', { name: 'Choose Release - Example movie', exact: true });
  const release = releases.getByRole('button', { name: `Choose ${releaseTitle}`, exact: true });
  await release.press('Enter');
  const confirmation = page.getByRole('dialog', { name: 'Download this release?', exact: true });
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirmation).not.toBeVisible();
  await expect(release).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(releases).not.toBeVisible();
  await expect(choose).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(card).toBeFocused();
  expect(mutations).toEqual([]);
});

test('deletion starts on Cancel and never executes when dismissed with the keyboard', async ({ page, mutations }) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie', exact: true }).press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
  const remove = sheet.getByRole('button', { name: 'Remove', exact: true });
  await remove.press('Enter');
  const confirmation = page.getByRole('dialog', { name: 'Confirm deletion', exact: true });
  await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(remove).toBeFocused();
  expect(mutations).toEqual([]);
});

test('notifications can be dismissed without a mouse', async ({ page, mutations }) => {
  await page.goto('/library?media=movies&id=999');
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  await expect(dismiss).toBeVisible();
  await dismiss.press('Enter');
  await expect(page.locator('.fixed-alert')).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('selection mode exposes checkboxes without a duplicate card tab stop', async ({ page, mutations }) => {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Select media', exact: true }).click();
  const card = page.getByRole('group', { name: 'Select Example movie', exact: true });
  await expect(card).not.toHaveAttribute('tabindex', '0');
  const checkbox = card.getByRole('checkbox', { name: 'Select Example movie', exact: true });
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await checkbox.press('Space');
  await expect(checkbox).not.toBeChecked();
  expect(mutations).toEqual([]);
});

for (const theme of ['flixDark', 'flixLight']) {
  test(`${theme} preserves native field focus and contrasting dialog focus with a custom accent`, async ({ page, mutations }) => {
    await page.addInitScript(theme => localStorage.setItem('flix_theme', theme), theme);
    await page.route('**/color', route => route.fulfill({ json: { primary: theme === 'flixLight' ? '#FFFFFF' : '#000000' } }));
    await page.goto('/library');
    const search = page.getByRole('textbox', { name: 'Search', exact: true });
    await search.focus();
    async function contrast(locator: import('@playwright/test').Locator, surface: string) {
      return locator.evaluate((element, surface) => {
        const style = getComputedStyle(element);
        const background = getComputedStyle(document.querySelector(surface)!).backgroundColor;
        function luminance(color: string) {
          const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
            const channel = Number(value) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
        }
        const foreground = luminance(style.outlineColor); const base = luminance(background);
        return { style: style.outlineStyle, width: style.outlineWidth, ratio: (Math.max(foreground, base) + 0.05) / (Math.min(foreground, base) + 0.05) };
      }, surface);
    }
    await expect(page.locator('.v-field').filter({ has: search })).toHaveClass(/v-field--focused/);
    expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
    await page.getByRole('button', { name: 'Open Example movie', exact: true }).press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
    await expect(dialog).toBeVisible();
    await waitForDialog(page);
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await close.focus();
    expect(await contrast(close, '.dialog-flex')).toMatchObject({ style: 'solid', width: '2px' });
    expect((await contrast(close, '.dialog-flex')).ratio).toBeGreaterThanOrEqual(3);
    expect(mutations).toEqual([]);
  });
}

test('reduced motion keeps dialogs keyboard usable without long transitions', async ({ page, mutations }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/library');
  const card = page.getByRole('button', { name: 'Open Example movie', exact: true });
  await card.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
  await expect(dialog).toBeVisible();
  const duration = await dialog.locator('.v-overlay__content').evaluate(el => getComputedStyle(el).transitionDuration);
  expect(duration.split(',').every(value => parseFloat(value) < 0.01)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  expect(mutations).toEqual([]);
});
