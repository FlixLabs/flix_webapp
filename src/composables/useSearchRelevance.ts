interface SearchResult {
  title: string;
  originalTitle?: string;
  alternateTitles?: { title: string }[];
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function rankSearchResults<T extends SearchResult>(items: T[], query: string): T[] {
  const term = normalize(query);
  // Identifier lookups and ties retain the upstream search order.
  if (!term || /^(tmdb|tvdb|imdb):/i.test(query.trim())) return [...items];
  const words = term.split(' ');
  const score = (item: T) => Math.max(...[
    item.title, item.originalTitle ?? '', ...(item.alternateTitles ?? []).map(title => title.title),
  ].map(title => {
    const value = normalize(title);
    if (value === term) return 4;
    if (value.startsWith(term + ' ')) return 3;
    if (` ${value} `.includes(` ${term} `)) return 2;
    if (words.every(word => value.split(' ').includes(word))) return 1;
    return 0;
  }));
  return items.map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.item);
}
