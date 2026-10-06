import { computed, type Ref } from "vue";

export interface MediaEpisode {
  season: number;
  sizeOnDisk?: number | null;
  [key: string]: unknown;
}

export function useEpisodeSummary(episodes: Ref<MediaEpisode[]>) {
  const grouped_episodes = computed(() => {
    return episodes.value.reduce(
      (groups, episode) => {
        (groups[episode.season] ??= []).push(episode);
        return groups;
      },
      {} as Record<number, MediaEpisode[]>,
    );
  });

  const totalSerieSizeOnDisk = computed(() => {
    return episodes.value.reduce((total, episode) => {
      return (
        total +
        (typeof episode.sizeOnDisk === "number" ? episode.sizeOnDisk : 0)
      );
    }, 0);
  });

  return { grouped_episodes, totalSerieSizeOnDisk };
}
