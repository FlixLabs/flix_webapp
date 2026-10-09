import { afterEach, expect, it, vi } from 'vitest';
import { fetchTmdbPage } from '@/composables/fetchTmdbPage';

afterEach(() => vi.unstubAllGlobals());

function mockResponse(data: unknown, status = 200) {
  const json = vi.fn().mockResolvedValue(data);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status === 200, status, json }));
  return json;
}

it('loads a valid page, including an empty result set', async () => {
  mockResponse({ results: [{ id: 1, title: 'Movie' }], total_pages: 2 });
  expect(await fetchTmdbPage('https://tmdb.test/upcoming')).toEqual({
    results: [{ id: 1, title: 'Movie' }], total_pages: 2,
  });
  mockResponse({ results: [], total_pages: 0 });
  expect(await fetchTmdbPage('https://tmdb.test/on_the_air')).toEqual({ results: [], total_pages: 1 });
});

it.each([undefined, null, {}, { results: null }, { results: {} },
  { results: [null] }, { results: [{}] }, { results: [], total_pages: '2' }])(
  'rejects invalid data without reading undefined results: %j', async data => {
    mockResponse(data);
    await expect(fetchTmdbPage('https://tmdb.test/upcoming?page=2')).rejects.toThrow('Invalid upcoming media response');
  },
);

it.each([401, 429, 500])('reports HTTP %i before attempting to parse results', async status => {
  const json = mockResponse({ status_message: 'Failure' }, status);
  await expect(fetchTmdbPage('https://tmdb.test/upcoming?page=2')).rejects.toThrow(`TMDB HTTP ${status}`);
  expect(json).not.toHaveBeenCalled();
});

it('reports malformed JSON explicitly', async () => {
  mockResponse(null).mockRejectedValue(new SyntaxError('Invalid JSON'));
  await expect(fetchTmdbPage('https://tmdb.test/upcoming')).rejects.toThrow('Invalid upcoming media response');
});
