<script setup lang="ts">
import { useLocalizedEpisode } from "@/composables/useLocalizedMedia";
const props = defineProps<{
  item: {
    season: number;
    episode: number;
    title?: string;
    tmdbId?: unknown;
    tvdbId?: unknown;
  };
}>();
const title = useLocalizedEpisode(() => props.item);
</script>
<template><slot :title="title" /></template>
