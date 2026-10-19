interface ImportName { path: string; relativePath?: string; name?: string }
export interface ImportMediaChoice { id: number; title: string; year?: number }

// Strip only recognized advertising domains, never arbitrary release-group brackets.
const advertisingPrefix = /^\[\s*(?:www\.)?oxtorrent\.com\s*\]\s*/i;
export function cleanImportFilename(value: string) {
  let cleaned = value.trim();
  while (advertisingPrefix.test(cleaned)) cleaned = cleaned.replace(advertisingPrefix, '');
  return cleaned;
}
function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const releaseSuffix = /^(?:\d{3,4}[pi]\b|[48]k\b|s\d{1,2}(?:e\d{1,3})?\b|\d{1,2}x\d{1,3}\b|season\b|saison\b|bluray\b|blu ray\b|web\b|webrip\b|hdtv\b|dvd(?:rip)?\b|bdrip\b|brrip\b|remux\b|multi\b|vostfr\b|french\b|truefrench\b|(?:x|h)\s?26[45]\b)/;

export function suggestImportMedia(file: ImportName, library: readonly ImportMediaChoice[]): ImportMediaChoice[] {
  const basename = (file.relativePath || file.name || file.path).split(/[/\\]/).pop() ?? '';
  const name = normalize(cleanImportFilename(basename).replace(/\.(?:mkv|mp4|avi|m4v|mov|ts|m2ts|wmv)$/i, ''));
  if (!name) return [];
  const matches = library.flatMap(item => {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.title !== 'string') return [];
    const title = normalize(item.title);
    if (!title || (name !== title && !name.startsWith(`${title} `))) return [];
    const suffix = name.slice(title.length).trim();
    const year = /^(19\d{2}|20\d{2})(?:\s|$)/.exec(suffix);
    if (year && item.year && Number(year[1]) !== item.year) return [];
    const remaining = year ? suffix.slice(year[0].length).trim() : suffix;
    if (remaining && !releaseSuffix.test(remaining)) return [];
    return [{ item, length: title.length }];
  });
  const longest = Math.max(0, ...matches.map(match => match.length));
  return [...new Map(matches.filter(match => match.length === longest).map(({ item }) => [item.id, item])).values()].slice(0, 3);
}
