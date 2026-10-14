export interface MediaBadge { label: string; color?: 'success' | 'error' | 'info' }
export function availabilityBadge(hasFile: unknown): MediaBadge {
  if (hasFile === true) return { label: 'Existing', color: 'success' };
  if (hasFile === false) return { label: 'Missing', color: 'error' };
  return { label: 'Unknown' };
}
export function statusBadge(status: unknown): MediaBadge {
  if (typeof status !== 'string' || !status.trim() || status.trim().toLowerCase() === 'unknown') return { label: 'Unknown' };
  const value = status.trim();
  return { label: value.charAt(0).toUpperCase() + value.slice(1), color: 'info' };
}
export function countedBadge(badge: MediaBadge, count: number): MediaBadge {
  return { ...badge, label: `${count} ${badge.label}` };
}
