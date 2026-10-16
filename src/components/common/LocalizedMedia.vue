<script setup lang="ts">
import { useLocalizedMedia } from "@/composables/useLocalizedMedia";
import { computed } from "vue";
const props = defineProps<{
  item: {
    title?: string;
    overview?: string;
    tmdbId?: unknown;
    tvdbId?: unknown;
  };
  type: "movies" | "series" | "collection";
}>();
const localized = useLocalizedMedia(
  () => props.item,
  () => props.type,
);
const media = computed(() => localized.value ?? props.item);
</script>
<template><slot :media="media" /></template>
