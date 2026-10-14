import { test, expect, movie, series } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectInlineBadges(card: Locator, labels: string[]) {
  const chips = card.locator('.media-card-tags .v-chip');
  await expect(chips).toHaveText(labels);
  const geometry = await card.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const tags = Array.from(el.querySelectorAll('.media-card-tags .v-chip')).map(node => {
      const rect = node.getBoundingClientRect();
      const text = node.querySelector('.text-truncate')!;
      const style = getComputedStyle(node);
      return { center: rect.y + rect.height / 2, left: rect.left, right: rect.right,
        paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight),
        textFits: text.scrollWidth <= text.clientWidth + 1 };
    });
    return { tags, left: bounds.left, right: bounds.right, height: getComputedStyle(el.querySelector('.media-card-status')!).height };
  });
  if (geometry.tags.length > 1) expect(Math.abs(geometry.tags[0]!.center - geometry.tags[1]!.center)).toBeLessThanOrEqual(1);
  for (const tag of geometry.tags) {
    expect(tag.left).toBeGreaterThanOrEqual(geometry.left);
    expect(tag.right).toBeLessThanOrEqual(geometry.right);
    expect(tag.paddingLeft).toBeGreaterThan(4);
    expect(tag.paddingRight).toBeGreaterThan(4);
    if (geometry.right - geometry.left >= 160) expect(tag.textFits).toBe(true);
  }
  expect(geometry.height).toBe('64px');
}

test('movie, series and collection gallery badges stay side by side at every breakpoint', async ({ page, mutations }) => {
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [{ id: 1, tmdbId: 100, title: 'Example saga', movies: [
    { tmdbId: movie.tmdbId, title: movie.title, status: 'released' }, { tmdbId: 11, title: 'Missing sequel', status: 'released' },
  ] }] }));
  await page.goto('/library');
  for (const width of [320, 393, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
    await expectInlineBadges(page.getByRole('button', { name: `Open ${movie.title}`, exact: true }), ['Existing', 'Released']);
    await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await expectInlineBadges(page.getByRole('button', { name: `Open ${series.title}`, exact: true }), ['Continuing']);
    await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
    await expectInlineBadges(page.getByRole('button', { name: 'Open collection Example saga', exact: true }), ['1 Existing', '1 Missing']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(mutations).toEqual([]);
});

test('outings uses the same inline movie badges without losing its release label', async ({ page, mutations }) => {
  await page.route(/\/(upcoming|on_the_air)\?/, route => route.fulfill({ json: {
    results: [{ id: movie.tmdbId, title: movie.title, name: series.title, release_date: '2026-10-01', first_air_date: '2026-10-01' }], total_pages: 1,
  } }));
  await page.goto('/outings');
  for (const width of [320, 393, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const card = page.getByRole('button', { name: `Open ${movie.title}`, exact: true });
    await expectInlineBadges(card, ['Existing', 'Released']);
    await expect(card.locator('.media-date')).toHaveText('Release 2026-10-01');
  }
  expect(mutations).toEqual([]);
});

test('long badges remain on one row without overflowing and expose their complete labels', async ({ page, mutations }) => {
  const status = 'A very long service reported status';
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, status }] }));
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto('/library');
  const card = page.getByRole('button', { name: `Open ${movie.title}`, exact: true });
  await expect(card.locator('.v-chip').last()).toHaveAttribute('title', status);
  const chips = await card.locator('.v-chip').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { y: rect.y, right: rect.right, parentRight: node.closest('.media-card')!.getBoundingClientRect().right };
  }));
  expect(chips[0]!.y).toBe(chips[1]!.y);
  expect(chips.every(chip => chip.right <= chip.parentRight)).toBe(true);
  expect(mutations).toEqual([]);
});
