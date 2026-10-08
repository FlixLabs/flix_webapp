import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { defaultLibraryFilters, savedLibraryFilters, saveLibraryFilters, useLibraryFilters } from '@/composables/useLibraryFilters';
afterEach(() => vi.unstubAllGlobals());

const items = [
  { title: 'Beta', year: 2025, hasFile: true, quality: '1080p', status: 'released', sizeOnDisk: 4e9, added: '2026-01-01' },
  { title: 'Alpha', year: 2024, hasFile: false, status: 'announced', sizeOnDisk: 0, added: '2026-02-01' },
];
describe('library filters', () => {
  it('validates persisted filters and tolerates blocked storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ availability: 'wrong', sort: 'wrong', year: 'bad', minSizeGB: -1, descending: true }) });
    expect(savedLibraryFilters()).toEqual({ ...defaultLibraryFilters(), descending: true });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } });
    expect(savedLibraryFilters()).toEqual(defaultLibraryFilters());
    expect(() => saveLibraryFilters(defaultLibraryFilters())).not.toThrow();
  });
  it('sorts without mutating the library', () => {
    const source = ref([...items]);
    const filters = ref(defaultLibraryFilters());
    const { filteredItems } = useLibraryFilters(source, ref(''), filters);
    expect(filteredItems.value.map(item => item.title)).toEqual(['Alpha', 'Beta']);
    filters.value.sort = 'added';
    filters.value.descending = true;
    expect(filteredItems.value[0]?.title).toBe('Alpha');
    filters.value.sort = 'size';
    expect(filteredItems.value[0]?.title).toBe('Beta');
    expect(source.value[0]?.title).toBe('Beta');
  });
  it('combines search, status, quality, year and size', () => {
    const filters = ref({ ...defaultLibraryFilters(), status: 'released', quality: '1080p', year: 2025, minSizeGB: 3 });
    const { filteredItems } = useLibraryFilters(ref(items), ref(' beta '), filters);
    expect(filteredItems.value).toHaveLength(1);
    filters.value.minSizeGB = 5;
    expect(filteredItems.value).toEqual([]);
  });
  it('supports series statistics and missing files', () => {
    const filters = ref(defaultLibraryFilters());
    filters.value.availability = 'existing';
    const { filteredItems } = useLibraryFilters(ref([
      { title: 'Existing', statistics: { episodeFileCount: 2, sizeOnDisk: 8e9 } },
      { title: 'Missing', statistics: { episodeFileCount: 0 } },
    ]), ref(null), filters);
    expect(filteredItems.value[0]?.title).toBe('Existing');
    filters.value.availability = 'missing';
    expect(filteredItems.value[0]?.title).toBe('Missing');
  });
});
