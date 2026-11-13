export interface CatalogCollection {
  tmdbId: number;
  title: string;
  overview?: string;
  poster?: string;
}
export interface CatalogCollectionMovie extends CatalogCollection { year?: number; release_date?: string }
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid collection response from TMDB.');
  return value as Record<string, unknown>;
}
function parseItem(value: unknown, titleKey: 'name' | 'title'): CatalogCollection {
  const item = record(value);
  if (!positive(item.id) || typeof item[titleKey] !== 'string' || !item[titleKey].trim()) throw new Error('Invalid collection response from TMDB.');
  return { tmdbId: item.id, title: item[titleKey].trim(),
    overview: typeof item.overview === 'string' ? item.overview : undefined,
    poster: typeof item.poster_path === 'string' && /^\/[a-zA-Z0-9_.-]+$/.test(item.poster_path)
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined };
}
export function parseCollectionSearch(value: unknown) {
  const data = record(value);
  if (!Array.isArray(data.results) || !Number.isSafeInteger(data.total_pages) || Number(data.total_pages) < 0
    || !Number.isSafeInteger(data.total_results) || Number(data.total_results) < 0) throw new Error('Invalid collection response from TMDB.');
  const items = data.results.map(item => parseItem(item, 'name'));
  if (new Set(items.map(item => item.tmdbId)).size !== items.length
    || items.length > Number(data.total_results) || (items.length > 0 && data.total_pages === 0)) throw new Error('Invalid collection response from TMDB.');
  return { items, pages: Math.min(Number(data.total_pages), 500), total: Number(data.total_results) };
}
export function parseCollectionDetail(value: unknown, expectedId: number) {
  const data = record(value);
  const collection = parseItem(data, 'name');
  if (collection.tmdbId !== expectedId || !Array.isArray(data.parts)) throw new Error('Invalid collection response from TMDB.');
  const members: CatalogCollectionMovie[] = data.parts.map(value => {
    const item = record(value);
    const date = typeof item.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.release_date) ? item.release_date : undefined;
    return { ...parseItem(item, 'title'), release_date: date, year: date ? Number(date.slice(0, 4)) : undefined };
  });
  if (new Set(members.map(item => item.tmdbId)).size !== members.length) throw new Error('Invalid collection response from TMDB.');
  members.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.title.localeCompare(b.title));
  return { ...collection, members };
}
