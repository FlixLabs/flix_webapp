<script setup lang="ts">
import { t } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useQualityProfiles } from '@/composables/useQualityProfiles';
import { useCollectionDownloads, downloadableCollectionMovies, type CollectionDownloadMovie } from '@/composables/useCollectionDownloads';
import LocalizedMedia from './LocalizedMedia.vue';
import DialogSheet from './DialogSheet.vue';
import ReadFeedback from './ReadFeedback.vue';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ movies: CollectionDownloadMovie[]; context: string; disabled: boolean; activator?: HTMLElement | null }>();
const emit = defineEmits<{ refresh: [] }>();
const store = useFlixStore();
const useAPI = ref(import.meta.env.VITE_FLIX_API_USE === 'true');
const selectedInstanceData = computed(() => store.selectedInstanceData);
const options = { useAPI, selectedInstanceData };
const { pending, results, run } = useCollectionDownloads(options);
const { qualityMovieItems, qualityMovie, qualityReads, getQualityProfileList } = useQualityProfiles({ ...options, showErrorAlert: () => {} });
const selectedIds = ref<number[]>([]);
const candidates = computed(() => downloadableCollectionMovies(props.movies));
const selected = computed(() => candidates.value.filter(movie => selectedIds.value.includes(movie.tmdbId)));
const needsQuality = computed(() => selected.value.some(movie => !movie.localId));
const submitted = ref(false);
const blocked = computed(() => pending.value || submitted.value || props.disabled || !selected.value.length
  || (needsQuality.value && (!qualityReads.movies.state.hasData || qualityReads.movies.state.loading
    || !!qualityReads.movies.state.error || !qualityMovieItems.value.some(profile => profile.value === qualityMovie.value))));
watch(visible, value => {
  if (!value) return;
  submitted.value = false;
  results.value = [];
  selectedIds.value = candidates.value.map(movie => movie.tmdbId);
  if (candidates.value.some(movie => !movie.localId)) void getQualityProfileList('movies');
}, { immediate: true });
watch(() => props.context, () => { visible.value = false; selectedIds.value = []; });
async function confirm() {
  if (blocked.value) return;
  submitted.value = true;
  const context = props.context;
  await run(selected.value, qualityMovie.value);
  if (context === props.context) emit('refresh');
}
function close(value: boolean) { if (!pending.value) visible.value = value; }
</script>

<template>
  <DialogSheet :model-value="visible" :activator="activator" :title="t('Missing movies')" :label="t('Download missing movies')" :context="context" :close-disabled="pending" @update:model-value="close">
    <p class="mb-3">{{ t("Released films will be searched for. Upcoming films will be monitored for future releases, without an immediate search. Films not in your library will be added first.") }}</p>
    <v-list density="compact" :aria-label="t('Missing movies')" class="collection-request-list">
      <LocalizedMedia v-for="movie in candidates" :key="movie.tmdbId" :item="movie" type="movies" v-slot="{ media: displayedMovie }">
      <v-list-item :subtitle="movie.status !== 'released' ? movie.localId ? t('Monitor with existing settings') : t('Add and monitor for release') : movie.localId ? t('Search with existing quality profile') : t('Add and search')">
        <template #title><span class="text-wrap">{{ displayedMovie.title }}</span></template>
        <template #prepend><v-checkbox-btn v-model="selectedIds" :value="movie.tmdbId" :aria-label="t('Request {p0}', { p0: displayedMovie.title })" :disabled="pending || submitted || disabled" /></template>
      </v-list-item>
      </LocalizedMedia>
    </v-list>
    <template v-if="needsQuality">
      <ReadFeedback :state="qualityReads.movies.state" :label="t('Quality profiles')" :disabled="pending" @retry="getQualityProfileList('movies')" />
      <v-select v-model="qualityMovie" :items="qualityMovieItems" :label="t('Quality for new movies')" variant="outlined" class="mt-3" :loading="qualityReads.movies.state.loading" :disabled="pending || submitted" hide-details />
    </template>
    <template v-if="results.length">
    <v-divider class="my-4" />
    <h3 class="text-subtitle-2 mb-2">{{ t("Request results") }}</h3>
    <v-list density="compact" :aria-label="t('Download request results')" aria-live="polite" class="collection-request-list">
      <v-list-item v-for="result in results" :key="result.tmdbId" :subtitle="t(result.message)">
        <template #title><span class="text-wrap"><LocalizedMedia :item="result" type="movies" v-slot="{ media }">{{ media.title }}</LocalizedMedia></span></template>
        <template #prepend><v-icon :icon="result.state === 'requested' ? 'mdi-check-circle-outline' : result.state === 'failed' ? 'mdi-alert-circle-outline' : 'mdi-minus-circle-outline'" :color="result.state === 'requested' ? 'success' : result.state === 'failed' ? 'error' : undefined" /></template>
      </v-list-item>
    </v-list>
    </template>
    <template #actions><v-btn color="primary" :loading="pending" :disabled="blocked" @click="confirm">{{ t("Request downloads") }}</v-btn></template>
  </DialogSheet>
</template>

<style scoped>
.collection-request-list { background: transparent; }
.collection-request-list :deep(.v-list-item) { grid-template-columns: 36px minmax(0, 1fr) auto; padding: 12px 0; column-gap: 12px; }
.collection-request-list :deep(.v-list-item__prepend) { align-self: start; justify-content: center; width: 36px; }
.collection-request-list :deep(.v-list-item__prepend > .v-list-item__spacer) { display: none; }
.collection-request-list :deep(.v-list-item-title) { font-size: 1rem; line-height: 1.5; overflow-wrap: anywhere; }
.collection-request-list :deep(.v-list-item-subtitle) { margin-top: 4px; white-space: normal; overflow: visible; display: block; line-height: 1.5; }
</style>
