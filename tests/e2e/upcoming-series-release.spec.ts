import { test, expect, series } from './fixtures';

for (const hasEpisodes of [true, false]) {
  test(`upcoming library series expose interactive releases ${hasEpisodes ? 'with episodes' : 'without inventing seasons'}`, async ({ page, mutations }) => {
    const searches: URL[] = [];
    await page.route('**/api/v3/series?*', route => route.fulfill({ json: [{ ...series, status: 'upcoming' }] }));
    await page.route('**/api/v3/episode?*', route => route.fulfill({ json: hasEpisodes ? Array.from({ length: 8 }, (_, i) => ({ id: i + 100, seriesId: series.id, seasonNumber: 1, episodeNumber: i + 1, title: `Episode ${i + 1}`, hasFile: false })) : [] }));
    await page.route('**/api/v3/release?*', route => {
      searches.push(new URL(route.request().url()));
      return route.fulfill({ json: [] });
    });
    await page.goto('/library');
    await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: `Open ${series.title}`, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: `Series: ${series.title}`, exact: true });
    const automatic = sheet.getByRole('button', { name: 'Search', exact: true });
    const interactive = sheet.getByRole('button', { name: 'Choose Release', exact: true });
    if (hasEpisodes) {
      await expect(automatic).toBeEnabled();
      await interactive.click();
      const releases = page.getByRole('dialog', { name: `Choose Release - ${series.title}`, exact: true });
      await expect(releases.getByText('No release found.', { exact: true })).toBeVisible();
      expect(searches).toHaveLength(1);
      expect(searches[0]!.searchParams.get('seriesId')).toBe(String(series.id));
      expect(searches[0]!.searchParams.get('seasonNumber')).toBe('1');
      await releases.getByRole('button', { name: 'Close', exact: true }).click();
      expect(mutations).toEqual([]);
      await automatic.click();
      await expect.poll(() => mutations.length).toBe(1);
      expect(mutations[0]).toMatchObject({ method: 'POST', path: '/api/v3/command', body: { name: 'SeriesSearch', seriesId: series.id } });
    } else {
      await expect(sheet.getByText('No episodes available for this series. Refresh its metadata in Sonarr before searching.', { exact: true })).toBeVisible();
      await expect(automatic).toBeDisabled();
      await expect(interactive).toBeDisabled();
      expect(searches).toEqual([]);
      expect(mutations).toEqual([]);
    }
  });
}
