import { requireList, optionalList } from './apiResponse';
import { mediaFileFields } from './mediaFileDetails';
import { monitoringFields, type MonitoredMedia } from './useMediaMonitoring';
import type { MediaType } from './useMediaService';

interface LibraryResource extends MonitoredMedia {
  id: number;
  title: string;
  tmdbId?: number;
  tvdbId?: number;
  collection?: { tmdbId?: number; title?: string } | null;
  movieFile?: { relativePath?: string; size?: number; mediaInfo?: { runTime?: number }; quality?: { quality?: { name?: string } } };
  images?: unknown;
  certification?: string;
  year?: number;
  added?: string;
  sizeOnDisk?: number;
  runtime?: number;
  overview?: string;
  hasFile?: boolean;
  status?: string;
  qualityProfileId?: number;
  statistics?: { sizeOnDisk?: number };
}

export function parseLibraryMedia(value: unknown, type: MediaType) {
  const records = requireList<LibraryResource>(value, 'library', ['title']);
  const ids = new Set<number>();
  return records.map(item => {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) throw new Error('Invalid library response. Please try again.');
    ids.add(item.id);
    const movie = type === 'movies';
    const suffix = `(${item.year})`;
    return {
      id: item.id, tmdbId: movie ? item.tmdbId : null, tvdbId: movie ? null : item.tvdbId,
      collection: movie ? item.collection : undefined,
      prependAvatar: optionalList<{ coverType?: string; remoteUrl?: string }>(item.images, 'images').find(image => image.coverType === 'poster')?.remoteUrl || 'https://placehold.co/100x150?text=No+Image&font=roboto',
      title: item.title.includes(suffix) ? item.title.replace(suffix, '').trim() : item.title,
      certification: item.certification, year: item.year, added: item.added,
      sizeOnDisk: item.sizeOnDisk ?? item.movieFile?.size,
      runTime: movie ? item.movieFile?.mediaInfo?.runTime ?? null : item.runtime,
      overview: item.overview, hasFile: item.hasFile, status: item.status,
      qualityProfileId: item.qualityProfileId,
      quality: movie ? item.movieFile?.quality?.quality?.name ?? null : null,
      relativePath: movie ? item.movieFile?.relativePath ?? null : null,
      ...(movie && item.movieFile ? mediaFileFields(item.movieFile) : {}),
      statistics: item.statistics, ...monitoringFields(item),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
