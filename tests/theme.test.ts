import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPrimary, DEFAULT_THEME_NAME, DEFAULT_PRIMARY, DEFAULT_LIGHT_PRIMARY, getSavedTheme, LIGHT_THEME_NAME, saveTheme, THEME_STORAGE_KEY } from '@/theme/constants';

afterEach(() => vi.unstubAllGlobals());

describe('theme preferences', () => {
  it('uses a more legible default accent in light mode without overriding custom colors', () => {
    const themes = {
      [DEFAULT_THEME_NAME]: { colors: { primary: '#AA5500' } },
      [LIGHT_THEME_NAME]: { colors: { primary: '#AA5500' } },
    };
    applyPrimary(themes, DEFAULT_PRIMARY);
    expect(themes[DEFAULT_THEME_NAME]!.colors.primary).toBe(DEFAULT_PRIMARY);
    expect(themes[LIGHT_THEME_NAME]!.colors.primary).toBe(DEFAULT_LIGHT_PRIMARY);
    applyPrimary(themes, '#AA5500');
    expect(themes[LIGHT_THEME_NAME]!.colors.primary).toBe('#AA5500');
  });
  it.each([null, '', 'invalid', DEFAULT_THEME_NAME])('keeps the dark default for %s', value => {
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(value) });
    expect(getSavedTheme()).toBe(DEFAULT_THEME_NAME);
  });

  it('restores and saves the light preference', () => {
    const storage = { getItem: vi.fn().mockReturnValue(LIGHT_THEME_NAME), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    expect(getSavedTheme()).toBe(LIGHT_THEME_NAME);
    saveTheme(LIGHT_THEME_NAME);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, LIGHT_THEME_NAME);
    saveTheme(DEFAULT_THEME_NAME);
    expect(storage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, DEFAULT_THEME_NAME);
  });

  it('still works when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Blocked'); },
      setItem: () => { throw new Error('Blocked'); },
    });
    expect(getSavedTheme()).toBe(DEFAULT_THEME_NAME);
    expect(() => saveTheme(LIGHT_THEME_NAME)).not.toThrow();
  });

  it('shares custom and reset primary colors without changing surfaces', () => {
    const themes = {
      [DEFAULT_THEME_NAME]: { colors: { primary: '#FF9800', surface: '#1B1E22' } },
      [LIGHT_THEME_NAME]: { colors: { primary: '#FF9800', surface: '#FFFFFF' } },
    };
    for (const primary of ['#AA5500', '#FF9800']) {
      applyPrimary(themes, primary);
      expect(themes[DEFAULT_THEME_NAME]!.colors.primary).toBe(primary);
      expect(themes[LIGHT_THEME_NAME]!.colors.primary).toBe(primary);
    }
    expect(themes[DEFAULT_THEME_NAME]!.colors.surface).toBe('#1B1E22');
    expect(themes[LIGHT_THEME_NAME]!.colors.surface).toBe('#FFFFFF');
  });
});
