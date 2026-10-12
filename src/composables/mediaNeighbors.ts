export function mediaNeighbors<T>(items: readonly T[], selected: T | null) {
  const index = selected === null ? -1 : items.indexOf(selected);
  return {
    index,
    total: items.length,
    previous: index > 0 ? items[index - 1] : undefined,
    next: index >= 0 ? items[index + 1] : undefined,
  };
}
