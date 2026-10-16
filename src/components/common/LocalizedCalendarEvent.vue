<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/i18n";
import {
  useLocalizedMedia,
  useLocalizedEpisode,
} from "@/composables/useLocalizedMedia";
import type { CalendarEvent } from "@/composables/useCalendar";
const props = defineProps<{ event: CalendarEvent }>();
const media = useLocalizedMedia(
  () => props.event.metadata,
  () => props.event.type,
);
const episode = useLocalizedEpisode(() =>
  props.event.type === "series"
    ? {
        ...props.event.metadata,
        title: props.event.metadata?.episodeTitle,
        season: props.event.metadata?.season ?? -1,
        episode: props.event.metadata?.episode ?? -1,
      }
    : { season: -1, episode: -1 },
);
const title = computed(() => {
  if (!props.event.metadata) return props.event.title;
  if (props.event.type === "movies")
    return `${media.value?.title ?? props.event.metadata.title} (${t(props.event.release === "cinemas" ? "Cinemas" : props.event.release === "digital" ? "Digital" : "Physical")})`;
  const number =
    /\((S\d+E\d+)\)$/.exec(props.event.title)?.[1] || t("Air date");
  return `${media.value?.title ?? props.event.metadata.title} : ${episode.value ?? props.event.metadata.episodeTitle} (${number})`;
});
</script>
<template><slot :title="title" /></template>
