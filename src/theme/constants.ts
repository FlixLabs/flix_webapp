import colors from 'vuetify/util/colors'
import type { ThemeDefinition } from 'vuetify'

export const DEFAULT_THEME_NAME = 'flixDark';
export const LIGHT_THEME_NAME = 'flixLight';
export const DEFAULT_LIGHT_PRIMARY = '#A94F00';
export const THEME_STORAGE_KEY = 'flix_theme';

export function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === LIGHT_THEME_NAME ? LIGHT_THEME_NAME : DEFAULT_THEME_NAME;
  } catch {
    return DEFAULT_THEME_NAME;
  }
}

export function saveTheme(name: string) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name === LIGHT_THEME_NAME ? LIGHT_THEME_NAME : DEFAULT_THEME_NAME);
  } catch { /* Keep theme switching available when browser storage is blocked. */ }
}

export function applyPrimary(themes: Record<string, ThemeDefinition>, primary: string) {
  for (const name of [DEFAULT_THEME_NAME, LIGHT_THEME_NAME]) {
    const colors = themes[name]?.colors;
    if (colors) colors.primary = name === LIGHT_THEME_NAME && !isCustomPrimary(primary) ? DEFAULT_LIGHT_PRIMARY : primary;
  }
}

export const DEFAULT_PRIMARY = colors.orange.darken1

export function isCustomPrimary(value?: string | null) {
  const a = (value ?? '').trim().toLowerCase()
  const b = String(DEFAULT_PRIMARY).trim().toLowerCase()
  return !!a && a !== b
}
