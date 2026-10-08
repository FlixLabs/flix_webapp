import { describe, expect, it } from 'vitest';
import { rankSearchResults } from '@/composables/useSearchRelevance';

describe('dashboard search relevance', () => {
  it('puts an exact title ahead of newer sequels without mutating the response', () => {
    const items = [{ title: 'Matrix Reloaded', year: 2003 }, { title: 'Matrix', year: 1999 }];
    expect(rankSearchResults(items, 'Matrix')[0]?.year).toBe(1999);
    expect(items[0]?.title).toBe('Matrix Reloaded');
  });

  it('matches accents, case, punctuation and alternate titles', () => {
    const items = [{ title: 'Other' }, { title: 'Translated', alternateTitles: [{ title: 'Amélie' }] }];
    expect(rankSearchResults(items, ' AMELIE! ')[0]?.title).toBe('Translated');
    expect(rankSearchResults([{ title: 'Other' }, { title: 'Translated', originalTitle: 'L’Été' }], 'l ete')[0]?.title).toBe('Translated');
  });

  it('ranks title prefixes, complete phrases and words before weak matches', () => {
    const items = [{ title: 'Unrelated' }, { title: 'Dark and very Knight' }, { title: 'The Dark Knight' }, { title: 'Dark Knight Rises' }];
    expect(rankSearchResults(items, 'dark knight').map(item => item.title))
      .toEqual(['Dark Knight Rises', 'The Dark Knight', 'Dark and very Knight', 'Unrelated']);
  });

  it('keeps the upstream order for ties and unknown titles', () => {
    const items = [{ title: 'Alien', year: 1979 }, { title: 'Alien', year: 2026 }, { title: 'Unrelated' }];
    expect(rankSearchResults(items, 'alien')).toEqual(items);
    expect(rankSearchResults(items, 'typo')).toEqual(items);
  });

  it('preserves identifier lookup results and empty searches', () => {
    const items = [{ title: 'Other' }, { title: 'TMDB 123' }];
    expect(rankSearchResults(items, 'tmdb:123')).toEqual(items);
    expect(rankSearchResults(items, '')).toEqual(items);
  });
});
