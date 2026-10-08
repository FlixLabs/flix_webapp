import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMediaType, isString, readPreference, usePersistentPreference } from '@/composables/usePersistentPreference';
afterEach(() => vi.unstubAllGlobals());
describe('persistent preferences', () => {
  it('preserves a legacy instance fallback when no local preference exists', () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const value = usePersistentPreference('instance', 'Previous instance', isString);
    expect(value.value).toBe('Previous instance');
    expect(storage.setItem).toHaveBeenCalledWith('flix.preferences.instance', '"Previous instance"');
  });
  it('uses stable keys and stores changes synchronously', () => {
    const storage = { getItem: vi.fn().mockReturnValue('"series"'), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const value = usePersistentPreference('library.view', 'movies', isMediaType);
    expect(value.value).toBe('series');
    value.value = 'movies';
    expect(storage.setItem).toHaveBeenCalledWith('flix.preferences.library.view', '"movies"');
  });
  it.each(['broken', '123', '"unknown"'])('ignores invalid saved views: %s', value => {
    vi.stubGlobal('localStorage', { getItem: () => value });
    expect(readPreference('view', 'movies', isMediaType)).toBe('movies');
  });
  it('does not break when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } });
    const value = usePersistentPreference('search', '', isString);
    expect(() => { value.value = 'Movie'; }).not.toThrow();
  });
});
