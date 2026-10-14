import { describe, expect, it } from 'vitest';
import { collectionMembers, libraryCollections, parseCollections, type MovieCollection } from '../src/composables/collections';

const saga: MovieCollection = { id: 1, tmdbId: 100, title: 'Example saga', movies: [
  { tmdbId: 12, title: 'Third', year: 2028, status: 'announced' },
  { tmdbId: 10, title: 'First', year: 2000, status: 'released' },
  { tmdbId: 11, title: 'Second', year: 2005, status: 'released' },
] };
describe('automatic collections', () => {
  it('shares native movie file availability and status with film cards', () => {
    const members = collectionMembers(saga, [
      { id: 1, tmdbId: 10, title: 'First', hasFile: true, status: 'inCinemas' },
      { id: 2, tmdbId: 11, title: 'Second' },
    ]);
    expect(members[0]).toMatchObject({ hasFile: true, status: 'inCinemas', state: 'Available' });
    expect(members[1]).toMatchObject({ hasFile: undefined, status: 'released', state: 'Unknown' });
    expect(members[2]).toMatchObject({ hasFile: false, status: 'announced', state: 'Upcoming' });
  });
  it('parses the Radarr schema without assuming optional metadata exists', () => {
    expect(parseCollections([saga])).toEqual([saga]);
    expect(parseCollections([])).toEqual([]);
    expect(parseCollections([{ ...saga, movies: null }])[0]?.movies).toEqual([]);
  });
  it.each([{}, [null], [{ ...saga, tmdbId: 0 }], [{ ...saga, movies: {} }], [{ ...saga, images: {} }], [{ ...saga, movies: [{}] }], [saga, saga], [{ ...saga, movies: [saga.movies[0], saga.movies[0]] }]])('rejects malformed collections: %j', value => {
    expect(() => parseCollections(value)).toThrow(/Invalid/);
  });
  it('uses TMDB identity rather than title or native movie ID', () => {
    const members = collectionMembers(saga, [{ id: 55, tmdbId: 10, title: 'Localized first', hasFile: true }, { id: 11, tmdbId: 999, title: 'Second', hasFile: true }]);
    expect(members.map(movie => movie.localId)).toEqual([55, undefined, undefined]);
    expect(members.map(movie => movie.state)).toEqual(['Available', 'Missing', 'Upcoming']);
  });
  it('does not treat an added movie without a file as available', () => {
    const members = collectionMembers(saga, [{ id: 1, tmdbId: 10, title: 'First', hasFile: false }]);
    expect(members[0]).toMatchObject({ state: 'Missing', inLibrary: true, localId: 1 });
    expect(members[1]).toMatchObject({ state: 'Missing', inLibrary: false });
  });
  it('keeps unknown file states and unreleased films distinct from missing films', () => {
    const members = collectionMembers({ ...saga, movies: [{ tmdbId: 10, title: 'Unknown' }, { tmdbId: 11, title: 'Cinema', status: 'inCinemas' }] }, [{ id: 1, tmdbId: 10, title: 'Unknown' }]);
    expect(members.map(movie => movie.state)).toEqual(['Upcoming', 'Unknown']);
    expect(collectionMembers(saga, [{ id: 1, tmdbId: 10, title: 'First' }])[0].state).toBe('Unknown');
  });
  it('sorts by release year and places unknown years last', () => {
    const members = collectionMembers({ ...saga, movies: [...saga.movies, { tmdbId: 13, title: 'Unknown', year: 0 }] }, []);
    expect(members.map(movie => movie.tmdbId)).toEqual([10, 11, 12, 13]);
  });
  it('shows only sagas connected to the active library and counts local files, not Radarr membership', () => {
    const groups = libraryCollections([saga, { ...saga, id: 2, tmdbId: 200, movies: [{ tmdbId: 99, title: 'Unrelated' }] }], [{ id: 1, tmdbId: 10, title: 'First', hasFile: false }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ available: 0, missing: 2 });
  });
});
