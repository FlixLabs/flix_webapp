<script setup lang="ts">
import { t } from '@/i18n';
import type { MediaType } from "@/composables/useMediaService";
import MediaTypeToggle from './MediaTypeToggle.vue';
import PageNavigation from './PageNavigation.vue';
import { nextTick, ref, watch, useSlots } from 'vue';

const search = defineModel<string | null>("search", { required: true });
const selectedView = defineModel<MediaType>("selectedView", { required: true });
const page = defineModel<number>('page', { required: true });
const props = defineProps<{ totalMovies: number | undefined; totalSeries: number | undefined; totalCollections?: number; totalPages: number; showCollections?: boolean; collectionsDisabled?: boolean }>();
const collections = defineModel<boolean>('collections', { default: false });
const emit = defineEmits<{ 'collections-open': []; 'media-select': [type: MediaType] }>();
const slots = useSlots();
function selectMedia(type: MediaType) { collections.value = false; emit('media-select', type); void scrollToStart(); }
function selectCollections() { emit('collections-open'); void scrollToStart(); }
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
async function scrollToStart() {
  await nextTick();
  navigation.value?.scrollToStart();
}
watch([selectedView, page, collections], scrollToStart);
watch(() => props.totalPages, value => { page.value = Math.min(page.value, Math.max(1, value)); });
</script>

<template>
  <PageNavigation ref="navigation">
    <div class="browser-toolbar">
    <v-text-field
      v-model="search"
      :label="t('Search')"
      variant="outlined"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
    />
    <div class="browser-controls mt-3">
      <MediaTypeToggle class="browser-types" v-model="selectedView" :total-movies="totalMovies" :total-series="totalSeries" :movies-pending="totalMovies === undefined" :series-pending="totalSeries === undefined" :total-collections="totalCollections" :show-collections="showCollections" :collections="collections" :collections-disabled="collectionsDisabled" @collections="selectCollections" @media="selectMedia" />
      <v-pagination v-if="totalPages > 1" class="browser-pages" v-model="page" :length="totalPages" :total-visible="$vuetify.display.xs ? 3 : 5" density="compact" rounded :aria-label="t('Media results pages')" />
      <div v-if="slots.actions" class="browser-actions"><slot name="actions" /></div>
    </div>
    </div>
  </PageNavigation>
</template>

<style scoped>
.browser-toolbar { container-type: inline-size; }
.browser-controls { display: grid; grid-template-columns: auto minmax(max-content, 1fr) auto; align-items: center; gap: 12px; }
.browser-types { grid-column: 1; grid-row: 1; }
.browser-pages { grid-column: 3; grid-row: 1; }
.browser-actions { grid-column: 2; grid-row: 1; display: flex; justify-content: flex-end; align-items: center; gap: 8px; min-width: 0; }
@container (max-width: 980px) {
  .browser-controls:has(.browser-pages) { grid-template-columns: minmax(0, 1fr) auto; }
  .browser-controls:has(.browser-pages) .browser-pages { grid-column: 2; }
  .browser-controls:has(.browser-pages) .browser-actions { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 959px) {
  .browser-controls, .browser-controls:has(.browser-pages) { grid-template-columns: minmax(0, 1fr); }
  .browser-types { grid-column: 1; grid-row: 1; justify-self: start; }
  .browser-pages, .browser-controls:has(.browser-pages) .browser-pages { grid-column: 1; grid-row: 2; justify-self: end; }
  .browser-actions, .browser-controls:has(.browser-pages) .browser-actions { grid-column: 1; grid-row: auto; }
}
@media (max-width: 599px) {
  .browser-actions :deep(.library-tools > .v-btn) { padding-inline: 8px; }
}
</style>
