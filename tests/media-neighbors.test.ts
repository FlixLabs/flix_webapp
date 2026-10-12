import { describe, expect, it } from 'vitest';
import { mediaNeighbors } from '@/composables/mediaNeighbors';

describe('media sheet navigation', () => {
  const items = [{ id: 0 }, { id: 0 }, { id: 3 }];
  it('uses the displayed order without relying on service IDs', () => {
    expect(mediaNeighbors(items, items[1]!)).toEqual({ index: 1, total: 3, previous: items[0], next: items[2] });
  });
  it('does not wrap at the boundaries', () => {
    expect(mediaNeighbors(items, items[0]!).previous).toBeUndefined();
    expect(mediaNeighbors(items, items[2]!).next).toBeUndefined();
  });
  it('does not navigate a selection outside the current filtered page', () => {
    expect(mediaNeighbors(items.slice(1), items[0]!)).toMatchObject({ index: -1, previous: undefined, next: undefined });
    expect(mediaNeighbors(items, { id: 0 }).index).toBe(-1);
  });
  it('handles an empty page and no selection', () => {
    expect(mediaNeighbors([], null)).toEqual({ index: -1, total: 0, previous: undefined, next: undefined });
  });
});
