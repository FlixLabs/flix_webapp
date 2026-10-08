<script setup lang="ts">
import type { MediaType } from '@/composables/useMediaService';

const selectedView = defineModel<MediaType>({ required: true });
defineProps<{ totalMovies?: number; totalSeries?: number }>();
</script>

<template>
  <v-btn-toggle v-model="selectedView" color="primary" variant="outlined" mandatory aria-label="Media type">
    <v-btn value="movies" prepend-icon="mdi-movie-open-outline">
      Movies<span v-if="totalMovies !== undefined" class="ml-1">({{ totalMovies }})</span>
    </v-btn>
    <v-btn value="series" prepend-icon="mdi-television-classic">
      Series<span v-if="totalSeries !== undefined" class="ml-1">({{ totalSeries }})</span>
    </v-btn>
  </v-btn-toggle>
</template>
