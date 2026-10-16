import { computed, ref, type Ref } from 'vue';
import { useLocalizedLibrarySearch } from './useLocalizedLibrarySearch';
import { localizedMediaTitle } from './useLocalizedMedia';
import { formatLocale } from '@/i18n/preferences';
import type { MediaType } from './useMediaService';

export interface LibraryFilters {
  availability: 'all' | 'existing' | 'missing';
  status: string | null;
  quality: string | null;
  year: number | null;
  minSizeGB: number | null;
  sort: 'title' | 'added' | 'size' | 'year';
  descending: boolean;
}
export const defaultLibraryFilters = (): LibraryFilters => ({
  availability: 'all', status: null, quality: null, year: null,
  minSizeGB: null, sort: 'title', descending: false,
});
export function savedLibraryFilters(): LibraryFilters {
  const defaults = defaultLibraryFilters();
  try {
    const value = JSON.parse(localStorage.getItem('flix.preferences.library.filters') ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    return {
      availability: ['all', 'existing', 'missing'].includes(value.availability) ? value.availability : defaults.availability,
      status: typeof value.status === 'string' ? value.status : null,
      quality: typeof value.quality === 'string' ? value.quality : null,
      year: typeof value.year === 'number' && Number.isInteger(value.year) && value.year > 0 ? value.year : null,
      minSizeGB: typeof value.minSizeGB === 'number' && Number.isFinite(value.minSizeGB) && value.minSizeGB >= 0 ? value.minSizeGB : null,
      sort: ['title', 'added', 'size', 'year'].includes(value.sort) ? value.sort : defaults.sort,
      descending: value.descending === true,
    };
  } catch { return defaults; }
}
export function saveLibraryFilters(filters: LibraryFilters) {
  try { localStorage.setItem('flix.preferences.library.filters', JSON.stringify(filters)); } catch {}
}
interface LibraryItem {
  id?: number; tmdbId?: unknown; tvdbId?: unknown;
  title: string; hasFile?: boolean; quality?: string | null; status?: string;
  year?: number; added?: string; sizeOnDisk?: number;
  statistics?: { sizeOnDisk?: number; episodeFileCount?: number };
}
export function useLibraryFilters<T extends LibraryItem>(items: Ref<T[]>, search: Ref<string | null>, filters: Ref<LibraryFilters>, translation?: { type: MediaType; enabled: () => boolean }) {
  const translated = translation ? useLocalizedLibrarySearch(items, search, translation.type, translation.enabled) : { matches: ref(new Set<number>()), loading: ref(false) };
  const filteredItems = computed(() => {
    const f = filters.value;
    const size = (item: T) => item.statistics?.sizeOnDisk ?? item.sizeOnDisk ?? 0;
    const result = items.value.filter(item => {
      const existing = item.hasFile ?? (item.statistics?.episodeFileCount ?? 0) > 0;
      const term = (search.value ?? '').trim().toLocaleLowerCase(formatLocale.value);
      return (item.title.toLocaleLowerCase(formatLocale.value).includes(term)
        || localizedMediaTitle(item, translation?.type ?? 'movies').toLocaleLowerCase(formatLocale.value).includes(term)
        || item.id != null && translated.matches.value.has(item.id))
        && (f.availability === 'all' || existing === (f.availability === 'existing'))
        && (!f.status || item.status === f.status)
        && (!f.quality || item.quality === f.quality)
        && (f.year === null || item.year === Number(f.year))
        && (f.minSizeGB === null || size(item) >= Math.max(0, Number(f.minSizeGB) || 0) * 1e9);
    });
    return result.sort((a, b) => {
      // Keep ordering stable while individual metadata translations arrive.
      const title = (item: T) => item.title;
      const difference = f.sort === 'title' ? title(a).localeCompare(title(b), formatLocale.value)
        : f.sort === 'size' ? size(a) - size(b)
        : f.sort === 'year' ? (a.year ?? 0) - (b.year ?? 0)
        : (Date.parse(a.added ?? '') || 0) - (Date.parse(b.added ?? '') || 0);
      return (f.descending ? -difference : difference) || title(a).localeCompare(title(b), formatLocale.value);
    });
  });
  return { filteredItems, translationLoading: translated.loading };
}
