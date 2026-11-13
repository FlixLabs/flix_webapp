import { describe, expect, it } from 'vitest';
import { parseCollectionDetail, parseCollectionSearch } from '@/composables/tmdbCollections';

describe('catalog collections', () => {
  it('validates search identity, posters and bounded pagination', () => {
    expect(parseCollectionSearch({ results: [{ id: 42, name: 'Example saga', poster_path: '/poster.jpg' }], total_pages: 700, total_results: 10000 }))
      .toMatchObject({ items: [{ tmdbId: 42, title: 'Example saga', poster: 'https://image.tmdb.org/t/p/w500/poster.jpg' }], pages: 500, total: 10000 });
    expect(parseCollectionSearch({ results: [], total_pages: 0, total_results: 0 })).toMatchObject({ items: [], total: 0 });
  });
  it('rejects malformed results, duplicate IDs and mismatched detail identity', () => {
    for (const value of [null, {}, { results: {}, total_pages: 1, total_results: 1 },
      { results: [{ id: -1, name: 'No identity' }], total_pages: 1, total_results: 1 },
      { results: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }], total_pages: 1, total_results: 2 }]) {
      expect(() => parseCollectionSearch(value)).toThrow('Invalid collection response');
    }
    expect(() => parseCollectionDetail({ id: 2, name: 'Wrong saga', parts: [] }, 1)).toThrow('Invalid collection response');
  });
  it('orders films by release year, tolerates missing dates and does not invent membership or files', () => {
    const detail = parseCollectionDetail({ id: 1, name: 'Saga', parts: [
      { id: 20, title: 'Later', release_date: '2026-01-01' }, { id: 30, title: 'Unknown date' },
      { id: 10, title: 'Earlier', release_date: '2000-01-01', poster_path: 'https://untrusted.test/poster.jpg' },
    ] }, 1);
    expect(detail.members.map(item => item.tmdbId)).toEqual([10, 20, 30]);
    expect(detail.members[0]?.poster).toBeUndefined();
    expect(detail.members[0]).not.toHaveProperty('hasFile');
    expect(() => parseCollectionDetail({ id: 1, name: 'Saga', parts: [{ id: 1, title: 'A' }, { id: 1, title: 'A' }] }, 1)).toThrow();
  });
});
