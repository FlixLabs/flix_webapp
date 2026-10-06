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
  const { state: qualityMovieItems } = useResettable<QualityProfile[]>([]);
  const { state: qualitySerieItems } = useResettable<QualityProfile[]>([]);
  const { state: qualityMovie } = useResettable<number | null>(
    options.initialQuality ?? null,
  );
  const { state: qualitySerie } = useResettable<number | null>(
    options.initialQuality ?? null,
  );

  async function getQualityProfileList(type: MediaType) {
    const { base_url, api_key } = getConfig(type);
    try {
      const response = await fetch(
        base_url + "/api/v3/qualityProfile?apikey=" + api_key,
      );
      if (!response.ok) throw new Error("Unable to load quality profiles");
      const profiles: { name: string; id: number }[] = await response.json();
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
    } catch {
      options.showErrorAlert("Unable to load quality profiles");
    }
  }

  return {
    qualityMovieItems,
    qualitySerieItems,
    qualityMovie,
    qualitySerie,
    getQualityProfileList,
  };
}
