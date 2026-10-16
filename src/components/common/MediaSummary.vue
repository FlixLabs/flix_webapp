<script setup lang="ts">
import { t } from '@/i18n';
import { computed } from 'vue';
import MediaImage from './MediaImage.vue';
import { useLocalizedMedia } from '@/composables/useLocalizedMedia';

interface SummaryItem {
  tmdbId?: unknown;
  tvdbId?: unknown;
  title?: string;
  poster?: string;
  prependAvatar?: string;
  overview?: string;
  year?: number;
  release_date?: string;
  certification?: string;
  runTime?: string | number;
}
const props = defineProps<{ item: SummaryItem; mediaType?: 'movies' | 'series' | 'collection'; announcementName?: string; facts?: { label: string; value: string | number }[] }>();
const translated = useLocalizedMedia(() => props.item, () => props.mediaType ?? (props.item.tvdbId ? 'series' : 'movies'));
const localized = computed(() => translated.value ?? props.item);
const metadata = computed(() => props.facts ?? (props.item.year ? [
  { label: 'Certification', value: props.item.certification || 'Unavailable' },
  { label: 'Year', value: props.item.year },
  { label: 'Runtime', value: props.item.runTime || 'Unavailable' },
] : [{ label: props.announcementName || 'Release', value: props.item.release_date || 'Unavailable' }]));
</script>

<template>
  <v-row class="media-summary">
    <v-col cols="6">
      <v-card><MediaImage :src="item.prependAvatar ?? item.poster" :alt="localized.title" class="media-poster" :aspect-ratio="2 / 3" cover /></v-card>
    </v-col>
    <v-col cols="6">
      <v-row class="title-line text-center"><v-col>{{ localized.title }}</v-col></v-row>
      <v-row class="text-center">
        <v-col v-for="fact in metadata" :key="fact.label" cols="12" sm>
          <v-row no-gutters><v-col class="meta-label">{{ t(fact.label) }}</v-col></v-row>
          <v-row no-gutters><v-col class="meta-value">{{ typeof fact.value === 'string' ? t(fact.value) : fact.value }}</v-col></v-row>
        </v-col>
      </v-row>
      <v-row v-if="localized.overview"><v-col>{{ localized.overview }}</v-col></v-row>
      <slot />
    </v-col>
  </v-row>
</template>

<style scoped>
.title-line { font-size: 1rem; line-height: 1.2; font-weight: bold; overflow-wrap: anywhere; }
.media-poster { width: 100%; }
.meta-label { font-size: 0.8rem; opacity: 0.8; overflow-wrap: anywhere; }
.meta-value { margin-top: 2px; line-height: 1.2; }
</style>
