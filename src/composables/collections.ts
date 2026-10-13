import { optionalList, requireList } from './apiResponse';

export interface CollectionMovie {
  tmdbId: number;
  title: string;
  year?: number;
  overview?: string;
  status?: string;
  runtime?: number;
  images?: unknown;
}
export interface MovieCollection {
  id: number;
  tmdbId: number;
  title: string;
  overview?: string;
  images?: unknown;
  movies: CollectionMovie[];
}
export interface LibraryMovie {
  id: number;
  tmdbId?: number;
  title: string;
  hasFile?: boolean;
  prependAvatar?: string;
  collection?: { tmdbId?: number; title?: string } | null;
}
export type CollectionState = 'Available' | 'Missing' | 'Upcoming' | 'Unknown';

const positiveId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;
export function parseCollections(value: unknown): MovieCollection[] {
  const collections = requireList<MovieCollection>(value, 'collections', ['title']);
  const ids = new Set<number>();
  const tmdbIds = new Set<number>();
  return collections.map(collection => {
    if (!positiveId(collection.id) || !positiveId(collection.tmdbId) || ids.has(collection.id) || tmdbIds.has(collection.tmdbId)) throw new Error('Invalid collections response. Please try again.');
    ids.add(collection.id); tmdbIds.add(collection.tmdbId);
    collectionPoster(collection.images);
    const movies = collection.movies == null ? [] : requireList<CollectionMovie>(collection.movies, 'collection movies', ['title']);
    const members = new Set<number>();
    for (const movie of movies) {
      if (!positiveId(movie.tmdbId) || members.has(movie.tmdbId)) throw new Error('Invalid collection movies response. Please try again.');
      members.add(movie.tmdbId);
      collectionPoster(movie.images);
    }
    return { ...collection, movies };
  });
}
export function collectionPoster(images: unknown): string | undefined {
  const image = optionalList<{ coverType?: string; remoteUrl?: string; url?: string }>(images, 'collection images').find(image => image.coverType === 'poster');
  return [image?.remoteUrl, image?.url].find(url => typeof url === 'string' && /^https?:\/\//.test(url));
}
function movieIndex(library: LibraryMovie[]) {
  const index = new Map<number, LibraryMovie>();
  for (const movie of library) if (positiveId(movie.tmdbId)) index.set(movie.tmdbId, movie);
  return index;
}
export function collectionMembers(collection: MovieCollection, library: LibraryMovie[], byTmdb = movieIndex(library)) {
  return collection.movies.map(movie => {
    const local = byTmdb.get(movie.tmdbId);
    const state: CollectionState = local?.hasFile === true ? 'Available'
      : movie.status === 'announced' || movie.status === 'inCinemas' ? 'Upcoming'
      : local ? local.hasFile === false ? 'Missing' : 'Unknown'
      : movie.status === 'released' ? 'Missing' : 'Unknown';
    return { ...movie, localId: local?.id, state, inLibrary: !!local,
      poster: local?.prependAvatar || collectionPoster(movie.images) };
  }).sort((a, b) => {
    const year = (movie: CollectionMovie) => Number.isInteger(movie.year) && Number(movie.year) > 0 ? Number(movie.year) : Infinity;
    return year(a) - year(b) || a.title.localeCompare(b.title) || a.tmdbId - b.tmdbId;
  });
}
export function libraryCollections(collections: MovieCollection[], library: LibraryMovie[]) {
  const byTmdb = movieIndex(library);
  const libraryIds = new Set(library.map(movie => movie.tmdbId));
  const collectionIds = new Set(library.map(movie => movie.collection?.tmdbId).filter(positiveId));
  return collections.filter(collection => collectionIds.has(collection.tmdbId) || collection.movies.some(movie => libraryIds.has(movie.tmdbId)))
    .map(collection => {
      const members = collectionMembers(collection, library, byTmdb);
      return { ...collection, members, available: members.filter(movie => movie.state === 'Available').length,
        missing: members.filter(movie => movie.state === 'Missing').length,
        poster: collectionPoster(collection.images) || members.find(movie => movie.poster)?.poster };
    }).sort((a, b) => a.title.localeCompare(b.title));
}
