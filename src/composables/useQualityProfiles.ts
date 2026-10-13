import { readApiJson, requireList } from '@/composables/apiResponse';
import { useReadRequest } from './useReadRequest';
import { useResettable } from "@/composables/useResettable";
import {
  useMediaService,
  type MediaServiceOptions,
  type MediaType,
} from "@/composables/useMediaService";

interface QualityProfile {
  title: string;
  value: number;
}

export function useQualityProfiles(
  options: MediaServiceOptions & {
    showErrorAlert: (message: string) => void;
    initialQuality?: number;
  },
) {
  const { getConfig } = useMediaService(options);
  const qualityReads = {
    movies: useReadRequest(() => [options.useAPI.value, options.selectedInstanceData.value?.name, getConfig('movies').base_url, getConfig('movies').api_key]),
    series: useReadRequest(() => [options.useAPI.value, options.selectedInstanceData.value?.name, getConfig('series').base_url, getConfig('series').api_key]),
  };
  const { state: qualityMovieItems } = useResettable<QualityProfile[]>([]);
  const { state: qualitySerieItems } = useResettable<QualityProfile[]>([]);
  const { state: qualityMovie } = useResettable<number | null>(
    options.initialQuality ?? null,
  );
  const { state: qualitySerie } = useResettable<number | null>(
    options.initialQuality ?? null,
  );

  async function getQualityProfileList(type: MediaType) {
    const read = qualityReads[type].begin();
    const { base_url, api_key } = getConfig(type);
    try {
      const response = await fetch(
        base_url + "/api/v3/qualityProfile?apikey=" + api_key,
        { signal: read.signal, cache: 'no-store' },
      );
      if (!response.ok) throw new Error("Unable to load quality profiles");
      const profiles = requireList<{ name: string; id: number }>(await readApiJson(response), 'quality profiles', ['name']);
      if (profiles.some(profile => !Number.isSafeInteger(profile.id) || profile.id <= 0)) throw new Error('Invalid quality profiles response. Please try again.');
      if (!read.isCurrent()) return;
      const items = profiles.map((profile) => ({
        title: profile.name,
        value: profile.id,
      }));
      const selected =
        items.find((item) => item.title.toLowerCase() === "any") ??
        items.at(-1);

      if (type === "movies") {
        qualityMovieItems.value = items;
        qualityMovie.value = selected?.value ?? null;
      } else {
        qualitySerieItems.value = items;
        qualitySerie.value = selected?.value ?? null;
      }

      if (!items.length) {
        options.showErrorAlert(
          "Profiles does not exist. Please create at least one in Radarr and Sonarr.",
        );
      }
      read.success();
    } catch (error) {
      read.fail(error);
      if (read.isCurrent()) options.showErrorAlert("Unable to load quality profiles");
    } finally { read.finish(); }
  }

  return {
    qualityMovieItems,
    qualitySerieItems,
    qualityMovie,
    qualitySerie,
    getQualityProfileList,
    qualityReads,
  };
}
