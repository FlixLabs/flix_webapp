function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function mediaFileFields(value: unknown) {
  const file = object(value);
  const info = object(file.mediaInfo);
  const dateAdded = text(file.dateAdded);
  return {
    relativePath: text(file.relativePath),
    sizeOnDisk: typeof file.size === 'number' && Number.isFinite(file.size) && file.size >= 0 ? file.size : null,
    quality: text(object(object(file.quality).quality).name),
    fileDetails: {
      resolution: text(info.resolution),
      videoCodec: text(info.videoCodec),
      audioCodec: text(info.audioCodec),
      // Only scanned audio tracks describe the file's actual audio languages.
      audioLanguages: text(info.audioLanguages),
      subtitles: text(info.subtitles),
      dateAdded: dateAdded && Number.isFinite(Date.parse(dateAdded)) ? dateAdded : null,
    },
  };
}

export type MediaFileDetails = ReturnType<typeof mediaFileFields>['fileDetails'];

export function fileSizeGb(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? (value / 1e9).toFixed(2) : 'Not provided';
}
