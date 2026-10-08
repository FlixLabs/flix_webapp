import { test as base, expect } from '@playwright/test';

const poster = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="gray"/></svg>';
export const movie = { id: 1, tmdbId: 10, title: 'Example movie', year: 2025, status: 'released', hasFile: true, overview: 'A movie overview', statistics: { sizeOnDisk: 4e9 }, movieFile: { size: 4e9, relativePath: 'Movie.mkv', quality: { quality: { name: 'Bluray-1080p' } } }, images: [{ coverType: 'poster', remoteUrl: poster }] };
export const series = { id: 2, tmdbId: 20, tvdbId: 20, title: 'Example series', year: 2025, status: 'continuing', overview: 'A series overview', statistics: { sizeOnDisk: 0, episodeFileCount: 0 }, images: [{ coverType: 'poster', remoteUrl: poster }] };
export const releaseTitle = 'Example.Movie.2025.1080p.Bluray.Long.Release.Title';
export const test = base.extend<{ mutations: { method: string; path: string; body: unknown }[] }>({
  mutations: async ({ page }, use) => {
    const mutations: { method: string; path: string; body: unknown }[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.text().startsWith('[browser-error] ')) errors.push(message.text());
    });
    // Vite handles window errors before Playwright's pageerror event sees them.
    await page.addInitScript(() => window.addEventListener('error', event => {
      if (event.message) console.error(`[browser-error] ${event.message}`);
    }));
    await page.addInitScript(() => sessionStorage.setItem('flix_webapp_is_authenticated', 'true'));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/flix-api/, '');
      if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/flix-api')) return route.continue();
      if (request.method() === 'OPTIONS') return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      if (request.method() !== 'GET') {
        mutations.push({ method: request.method(), path, body: request.postDataJSON() });
        return route.fulfill({ json: {} });
      }
      let json: unknown = [];
      if (path === '/instances') json = [{ name: 'Test instance', radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' }, sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }];
      else if (path === '/auth' || path === '/color') json = {};
      else if (path === '/api/v3/movie' || path === '/api/v3/movie/lookup') json = [movie];
      else if (path === '/api/v3/series' || path === '/api/v3/series/lookup') json = [series];
      else if (path === '/api/v3/episode') json = [{ id: 21, seriesId: 2, seasonNumber: 1, episodeNumber: 1, title: 'Pilot', hasFile: false }, { id: 31, seriesId: 2, seasonNumber: 2, episodeNumber: 1, title: 'Second season', hasFile: false }];
      else if (path === '/api/v3/release') json = [{ guid: 'selected', indexerId: 7, title: releaseTitle, size: 4e9, quality: { quality: { name: 'Bluray-1080p' } }, seeders: 20, indexer: 'Test indexer', protocol: 'torrent', downloadAllowed: true }];
      else if (path === '/api/v3/queue') json = { totalRecords: 1, records: [{ id: 101, title: 'Download example', size: 1e9, sizeleft: 5e8, timeleft: '00:10:00', status: 'downloading', trackedDownloadStatus: 'warning', errorMessage: 'Not enough space', added: '2026-01-01', languages: [] }] };
      else if (path === '/api/v3/history') json = { records: [] };
      else if (path.toLowerCase() === '/api/v3/qualityprofile') json = [{ id: 1, name: 'Any' }];
      else if (path === '/api/v3/calendar') {
        const date = new Date(); date.setDate(15);
        const release = date.toISOString();
        json = url.hostname === 'radarr.test' ? Array.from({ length: 7 }, (_, i) => ({ ...movie, id: i + 1, title: `Calendar movie ${i + 1} with a long title`, digitalRelease: release })) : [];
      }
      else if (path === '/api/v3/wanted/missing') json = { totalRecords: 1, records: [{ id: 21, seriesId: 2, seasonNumber: 1, episodeNumber: 1, title: 'Pilot', series: { title: series.title } }] };
      else if (path === '/api/v3/rootfolder') json = [{ path: url.hostname === 'radarr.test' ? '/movies' : '/tv', accessible: true, freeSpace: 5e9 }];
      else if (path === '/api/v3/diskspace') json = [{ path: '/', freeSpace: 5e9, totalSpace: 100e9 }];
      return route.fulfill({ json });
    });
    await use(mutations);
    expect(errors).toEqual([]);
  },
});
export { expect };
