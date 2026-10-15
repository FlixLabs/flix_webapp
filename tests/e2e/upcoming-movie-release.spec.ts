import { test, expect, movie } from './fixtures';

for (const status of ['announced', 'inCinemas']) {
  test(`library movie with Radarr status ${status} offers both search actions`, async ({ page, mutations }) => {
    const searches: URL[] = [];
    await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, status, hasFile: false, movieFile: undefined, statistics: { sizeOnDisk: 0 } }] }));
    await page.route('**/api/v3/release?*', route => {
      searches.push(new URL(route.request().url()));
      return route.fulfill({ json: [] });
    });
    await page.goto('/library');
    await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
    const automatic = sheet.getByRole('button', { name: 'Search', exact: true });
    await expect(automatic).toBeEnabled();
    await sheet.getByRole('button', { name: 'Choose Release', exact: true }).click();
    const releases = page.getByRole('dialog', { name: `Choose Release - ${movie.title}`, exact: true });
    await expect(releases.getByText('No release found.', { exact: true })).toBeVisible();
    expect(searches).toHaveLength(1);
    expect(searches[0]!.searchParams.get('movieId')).toBe(String(movie.id));
    expect(mutations).toEqual([]);
    await releases.getByRole('button', { name: 'Close', exact: true }).click();
    await automatic.click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0]).toMatchObject({ method: 'POST', path: '/api/v3/command', body: { name: 'MoviesSearch', movieIds: [movie.id] } });
  });
}
