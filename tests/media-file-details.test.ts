import { expect, it } from 'vitest';
import { fileSizeGb, mediaFileFields } from '@/composables/mediaFileDetails';

it('uses movie and episode file metadata, not release language or media added date', () => {
  const result = mediaFileFields({
    relativePath: 'Movie.mkv', size: 4e9, dateAdded: '2026-10-12T10:00:00Z',
    quality: { quality: { name: 'Bluray-1080p' } },
    languages: [{ name: 'English' }],
    mediaInfo: { resolution: '1920x1080', videoCodec: 'x264', audioCodec: 'DTS', audioLanguages: 'French / English', subtitles: 'French' },
  });
  expect(result).toMatchObject({ relativePath: 'Movie.mkv', sizeOnDisk: 4e9, quality: 'Bluray-1080p',
    fileDetails: { resolution: '1920x1080', videoCodec: 'x264', audioCodec: 'DTS', audioLanguages: 'French / English', subtitles: 'French', dateAdded: '2026-10-12T10:00:00Z' } });
  expect(mediaFileFields({ languages: [{ name: 'English' }], added: '2026-10-12' }).fileDetails)
    .toMatchObject({ audioLanguages: null, dateAdded: null, subtitles: null });
});

it.each([null, undefined, [], 'invalid', { quality: {}, mediaInfo: [], size: -1 }, {
  size: Infinity, dateAdded: 'invalid', mediaInfo: { resolution: {}, audioLanguages: [], subtitles: ' ' },
}])('tolerates absent or invalid file metadata: %j', value => {
  const result = mediaFileFields(value);
  expect(result.sizeOnDisk).toBeNull();
  expect(result.fileDetails).toEqual({ resolution: null, videoCodec: null, audioCodec: null, audioLanguages: null, subtitles: null, dateAdded: null });
});

it('formats known sizes without interpreting missing values as zero', () => {
  expect(fileSizeGb(4e9)).toBe('4.00');
  expect(fileSizeGb(0)).toBe('0.00');
  for (const value of [null, undefined, NaN, Infinity, -1, '4000000000']) expect(fileSizeGb(value)).toBe('Not provided');
});
