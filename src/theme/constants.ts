import colors from 'vuetify/util/colors'

export const DEFAULT_THEME_NAME = 'light';

export const DEFAULT_PRIMARY = colors.orange.darken1

export function isCustomPrimary(value?: string | null) {
  const a = (value ?? '').trim().toLowerCase()
  const b = String(DEFAULT_PRIMARY).trim().toLowerCase()
  return !!a && a !== b
}
