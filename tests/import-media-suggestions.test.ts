import { expect, it } from 'vitest';
import { cleanImportFilename, suggestImportMedia } from '@/composables/importMediaSuggestions';
const movie = { id: 2, title: 'Mad Max 2', year: 1981 };
const filename = '[ OxTorrent.com ] Mad Max 2 -1080p.MULTI.x264 ac3 mHDgz.mkv';
it('removes recognized advertising prefixes without removing release groups', () => {
  expect(cleanImportFilename(filename)).toBe('Mad Max 2 -1080p.MULTI.x264 ac3 mHDgz.mkv');
  expect(cleanImportFilename('[WWW.OXTORRENT.COM] [ OxTorrent.com ] Movie.mkv')).toBe('Movie.mkv');
  for (const name of ['[SubsPlease] Series.S01E01.mkv', '[1080p] Movie.mkv', '[Unknown.site] Movie.mkv']) expect(cleanImportFilename(name)).toBe(name);
});
it('suggests existing library media without mutating names or metadata', () => {
  const file = { path: `/downloads/${filename}` };
  const library = [movie, { id: 1, title: 'Mad Max', year: 1979 }];
  expect(suggestImportMedia(file, library)).toEqual([movie]);
  expect(file.path).toBe(`/downloads/${filename}`);
  expect(library[0]).toBe(movie);
  expect(suggestImportMedia({ path: 'C:\\downloads\\[ OxTorrent.com ] Mad.Max.2.1981.1080p.mkv' }, library)).toEqual([movie]);
});
it('keeps remakes ambiguous without a year and respects explicit years', () => {
  const first = { id: 1, title: 'Dune', year: 1984 };
  const second = { id: 2, title: 'Dune', year: 2021 };
  expect(suggestImportMedia({ path: 'Dune.1080p.mkv' }, [first, second])).toEqual([first, second]);
  expect(suggestImportMedia({ path: 'Dune.2021.1080p.mkv' }, [first, second])).toEqual([second]);
  expect(suggestImportMedia({ path: 'Dune.2004.1080p.mkv' }, [first, second])).toEqual([]);
});
it('does not confuse short titles, sequels or unrelated text', () => {
  const alien = { id: 1, title: 'Alien' };
  expect(suggestImportMedia({ path: 'Aliens.1080p.mkv' }, [alien])).toEqual([]);
  expect(suggestImportMedia({ path: 'Alien.Covenant.1080p.mkv' }, [alien])).toEqual([]);
  expect(suggestImportMedia({ path: filename }, [{ id: 1, title: 'Mad Max' }])).toEqual([]);
  expect(suggestImportMedia({ path: '[Unknown.site] Alien.1080p.mkv' }, [alien])).toEqual([]);
});
it('handles series episode suffixes, accents and non-Latin titles', () => {
  const series = { id: 1, title: 'Example series' };
  expect(suggestImportMedia({ path: '[ OxTorrent.com ] Example.Series.S01E02.1080p.mkv' }, [series])).toEqual([series]);
  expect(suggestImportMedia({ path: 'Les.Miserables.2019.1080p.mkv' }, [{ id: 2, title: 'Les Misérables', year: 2019 }])).toHaveLength(1);
  expect(suggestImportMedia({ path: '東京.1080p.mkv' }, [{ id: 3, title: '東京' }])).toHaveLength(1);
  expect(suggestImportMedia({ path: 'Tokyo.1080p.mkv' }, [{ id: 3, title: '東京' }])).toEqual([]);
});
it('ignores invalid media and limits ambiguous suggestions without auto-selecting', () => {
  expect(suggestImportMedia({ path: '' }, [movie])).toEqual([]);
  expect(suggestImportMedia({ path: 'Mad.Max.2.mkv' }, [{ ...movie, id: -1 }])).toEqual([]);
  expect(suggestImportMedia({ path: 'Title.mkv' }, Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: 'Title', year: 2000 + i })))).toHaveLength(3);
});
