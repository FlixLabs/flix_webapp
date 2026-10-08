<script setup lang="ts">
import type { MediaType } from "@/composables/useMediaService";
import MediaTypeToggle from './MediaTypeToggle.vue';
import PageNavigation from './PageNavigation.vue';
import { nextTick, ref, watch } from 'vue';

const search = defineModel<string | null>("search", { required: true });
const selectedView = defineModel<MediaType>("selectedView", { required: true });
const page = defineModel<number>('page', { required: true });
const props = defineProps<{ totalMovies: number; totalSeries: number; totalPages: number }>();
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
watch([selectedView, page], async () => {
  await nextTick();
  navigation.value?.scrollToStart();
});
watch(() => props.totalPages, value => { page.value = Math.min(page.value, Math.max(1, value)); });
</script>

<template>
  <PageNavigation ref="navigation">
    <v-text-field
      v-model="search"
      label="Search"
      variant="outlined"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
    />
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-3">
      <MediaTypeToggle v-model="selectedView" :total-movies="totalMovies" :total-series="totalSeries" />
      <slot name="actions" />
      <v-pagination v-if="totalPages > 1" v-model="page" :length="totalPages" :total-visible="$vuetify.display.xs ? 3 : 5" density="compact" rounded class="flex-shrink-0" aria-label="Media results pages" />
    </div>
  </PageNavigation>
</template>
