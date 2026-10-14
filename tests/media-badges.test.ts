import { describe, expect, it } from 'vitest';
import { availabilityBadge, countedBadge, statusBadge } from '@/composables/mediaBadges';

describe('shared media badges', () => {
  it('uses exactly the same labels and colors for movie and collection availability', () => {
    expect(availabilityBadge(true)).toEqual({ label: 'Existing', color: 'success' });
    expect(availabilityBadge(false)).toEqual({ label: 'Missing', color: 'error' });
  });
  it('keeps unknown availability neutral instead of claiming a missing file', () => {
    for (const value of [null, undefined, 0, 'false']) expect(availabilityBadge(value)).toEqual({ label: 'Unknown' });
  });
  it('normalizes status labels and reserves blue for known statuses', () => {
    expect(statusBadge(' released ')).toEqual({ label: 'Released', color: 'info' });
    expect(statusBadge('unknown')).toEqual({ label: 'Unknown' });
    expect(statusBadge(undefined)).toEqual({ label: 'Unknown' });
  });
  it('preserves semantic colors in aggregate counts', () => {
    expect(countedBadge(availabilityBadge(true), 0)).toEqual({ label: '0 Existing', color: 'success' });
    expect(countedBadge(availabilityBadge(false), 2)).toEqual({ label: '2 Missing', color: 'error' });
  });
});
