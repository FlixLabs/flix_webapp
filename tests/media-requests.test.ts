import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestsApi, requestStrings, requestItems, parseRequests, parseRequestDetail, requestStatus, requestColor, requestLanguage } from '@/composables/mediaRequests';
import { contentLanguage, region } from '@/i18n';
beforeEach(() => { vi.stubEnv('VITE_FLIX_API_URL', 'https://api.test'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); contentLanguage.value = 'en'; region.value = 'US'; });
it('sends requests to Flix only and displays sanitized API errors', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ items: [], total: 0, page: 1 }));
  vi.stubGlobal('fetch', fetch);
  await expect(requestsApi('?page=1')).resolves.toMatchObject({ items: [] });
  expect(fetch.mock.calls[0]![0]).toBe('https://api.test/requests?page=1');
  expect(fetch.mock.calls[0]![1].redirect).toBe('error');
  fetch.mockResolvedValue(Response.json({ error: 'Configure TMDB_API_KEY on the API to enable media requests.' }, { status: 503 }));
  await expect(requestsApi('/catalog/search')).rejects.toThrow('Configure TMDB_API_KEY');
});
it('rejects malformed lists instead of attempting to render non-iterable responses', () => {
  expect(() => requestItems(null, 'requests')).toThrow();
  expect(() => requestItems([null], 'requests')).toThrow();
  expect(() => requestStrings(['valid', {}])).toThrow();
  expect(() => requestStrings({})).toThrow();
  expect(requestStrings(['/movies'])).toEqual(['/movies']);
});
it('uses the same status labels and colors for every request view', () => {
  expect(requestStatus('available')).toBe('Available');
  expect(requestColor('available')).toBe('success');
  expect(requestColor('rejected')).toBe('error');
  expect(requestColor('needs-review')).toBe('warning');
  expect(requestStatus('unexpected')).toBe('Unknown');
});
it('keeps content language and regional metadata preferences, including original titles', () => {
  contentLanguage.value = 'fr'; region.value = 'CA'; expect(requestLanguage()).toBe('fr-CA');
  contentLanguage.value = 'original'; expect(requestLanguage()).toBe('original');
});
it('rejects malformed season arrays, subscriber arrays and request details before rendering', () => {
  const item = { id: 'request', type: 'series', tmdbId: 20, title: 'Series', poster: '', year: '2027', seasons: [1], status: 'pending', createdAt: Date.now() };
  expect(parseRequests([item])).toHaveLength(1);
  for (const seasons of [undefined, {}, [], [null], ['1']]) expect(() => parseRequests([{ ...item, seasons }])).toThrow();
  expect(() => parseRequests([{ ...item, subscribers: [null] }])).toThrow();
  expect(() => parseRequestDetail({ ...item, availability: 'missing', requests: [] })).toThrow();
});
