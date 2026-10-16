import { apiFetch } from './apiSession';
import { requireObject, requireList } from './apiResponse';
import { contentLanguage, region } from '@/i18n';
export type RequestMedia = { type: 'movies' | 'series'; tmdbId: number; title: string; year: string; poster: string; overview?: string; tvdbId?: number | null; seasons?: { number: number; name: string; episodeCount: number }[] };
export type MediaRequest = { id: string; type: 'movies' | 'series'; tmdbId: number; title: string; year: string; poster: string; seasons: number[] | null; status: 'pending' | 'processing' | 'approved' | 'available' | 'rejected' | 'needs-review'; reason?: string; actionError?: string; availabilityKnown?: boolean; createdAt: number; subscribers?: { id: string; name: string }[]; instance?: string };
export type RequestDetail = RequestMedia & { availability: string; requests: { id: string; seasons: number[] | null; status: string; following: boolean }[] };
export const requestLanguage = () => contentLanguage.value === 'original' ? 'original' : `${contentLanguage.value}-${region.value}`;
export async function requestsApi(path: string, options: RequestInit = {}) {
  const response = await apiFetch(`${String(import.meta.env.VITE_FLIX_API_URL).replace(/\/$/, '')}/requests${path}`, {
    ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = requireObject<Record<string, unknown>>(await response.json(), 'media requests');
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Requests unavailable.');
  return data;
}
export function requestItems<T extends object>(value: unknown, label: string): T[] { return requireList<T>(value, label); }
export function requestStrings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('Requests unavailable.');
  return value;
}
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const scope = (value: unknown) => value === null || Array.isArray(value) && value.length > 0 && value.every(id);
function media(value: unknown) {
  const item = requireObject<RequestMedia>(value, 'media requests');
  if (!id(item.tmdbId) || !['movies', 'series'].includes(item.type) || typeof item.title !== 'string' || !item.title || typeof item.year !== 'string' || typeof item.poster !== 'string') throw new Error('Requests unavailable.');
  return item;
}
export function parseRequestSearch(value: unknown) { return requestItems<RequestMedia>(value, 'media requests').map(media); }
export function parseRequests(value: unknown) {
  return requestItems<MediaRequest>(value, 'media requests').map(item => {
    media(item);
    if (typeof item.id !== 'string' || !item.id || !scope(item.seasons) || typeof item.status !== 'string' || !Number.isFinite(item.createdAt)
      || item.reason !== undefined && typeof item.reason !== 'string' || item.actionError !== undefined && typeof item.actionError !== 'string'
      || item.subscribers !== undefined && (!Array.isArray(item.subscribers) || item.subscribers.some(user => !user || typeof user.name !== 'string' || typeof user.id !== 'string'))) throw new Error('Requests unavailable.');
    return item;
  });
}
export function parseRequestDetail(value: unknown) {
  const item = media(value) as RequestDetail;
  if (!['available', 'missing', 'unknown'].includes(item.availability) || !Array.isArray(item.requests) || item.requests.some(request => !request || typeof request.id !== 'string' || !scope(request.seasons) || typeof request.status !== 'string' || typeof request.following !== 'boolean')) throw new Error('Requests unavailable.');
  if (item.type === 'series' && (!Array.isArray(item.seasons) || item.seasons.some(season => !season || !id(season.number) || typeof season.name !== 'string' || !Number.isSafeInteger(season.episodeCount) || season.episodeCount < 0))) throw new Error('Requests unavailable.');
  return item;
}
export function requestStatus(status: string) {
  return ({ pending: 'Pending approval', processing: 'Processing', approved: 'Approved', available: 'Available', rejected: 'Refused', 'needs-review': 'Needs review' } as Record<string, string>)[status] ?? 'Unknown';
}
export function requestColor(status: string) { return ({ available: 'success', rejected: 'error', 'needs-review': 'warning', approved: 'info', processing: 'primary' } as Record<string, string>)[status] ?? 'primary'; }
