<script setup lang="ts">
import type { MediaType } from "@/composables/useMediaService";

const search = defineModel<string | null>("search", { required: true });
const selectedView = defineModel<MediaType>("selectedView", { required: true });
defineProps<{ totalMovies: number; totalSeries: number }>();
</script>

<template>
  <v-row>
    <v-col>
      <v-text-field
        v-model="search"
        label="Search"
        variant="outlined"
        prepend-icon="mdi-magnify"
        clearable
      />
    </v-col>
    <v-col v-if="$vuetify.display.smAndUp" cols="2">
      <v-text-field
        label="Number"
        variant="outlined"
        :model-value="selectedView === 'movies' ? totalMovies : totalSeries"
        disabled
        prepend-icon="mdi-information-outline"
      />
    </v-col>
  </v-row>
  <v-row>
    <v-col>
      <v-btn-toggle
        v-model="selectedView"
        color="primary"
        variant="outlined"
        mandatory
      >
        <v-btn value="movies" prepend-icon="mdi-movie-open-outline"
          >Movies</v-btn
        >
        <v-btn value="series" prepend-icon="mdi-television-classic"
          >Series</v-btn
        >
      </v-btn-toggle>
    </v-col>
    <slot name="actions" />
  </v-row>
</template>
