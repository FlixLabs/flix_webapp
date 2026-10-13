import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { MediaType } from './useMediaService';

export function mediaQuery(type: MediaType, id: number, instance?: string | null): LocationQueryRaw {
  return { media: type, id: String(id), ...(instance ? { instance } : {}) };
}
export function mediaTarget(query: LocationQuery): { type: MediaType; id: number; instance: string | null } | null {
  if ((query.media !== 'movies' && query.media !== 'series') || typeof query.id !== 'string' || !/^\d+$/.test(query.id)) return null;
  const id = Number(query.id);
  if (!Number.isSafeInteger(id) || id <= 0 || (query.instance !== undefined && typeof query.instance !== 'string')) return null;
  return { type: query.media, id, instance: query.instance || null };
}
export function loginDestination(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://flix.invalid');
    if (url.origin !== 'https://flix.invalid' || !['/dashboard', '/library', '/calendar', '/outings', '/downloads', '/settings', '/system'].includes(url.pathname)) return '/dashboard';
    return url.pathname + url.search + url.hash;
  } catch { return '/dashboard'; }
}
