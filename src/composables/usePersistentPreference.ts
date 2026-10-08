import { ref, watch, type Ref } from 'vue';

export function readPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(`flix.preferences.${key}`);
    if (raw === null) return structuredClone(fallback);
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
export function usePersistentPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T) {
  const value = ref(readPreference(key, fallback, valid)) as Ref<T>;
  watch(value, current => {
    try { localStorage.setItem(`flix.preferences.${key}`, JSON.stringify(current)); }
    catch { /* Preferences must not prevent navigation when storage is unavailable. */ }
  }, { deep: true, flush: 'sync', immediate: true });
  return value;
}
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isMediaType = (value: unknown): value is 'movies' | 'series' => value === 'movies' || value === 'series';
