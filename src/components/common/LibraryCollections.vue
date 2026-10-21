<script setup lang="ts">
import { t } from '@/i18n';
import { computed, ref, watch, defineAsyncComponent } from 'vue';
import { downloadableCollectionMovies } from '@/composables/useCollectionDownloads';
import { removableCollectionMovies } from '@/composables/useCollectionRemoval';
import { libraryCollections, type LibraryMovie, type MovieCollection } from '@/composables/collections';
import type { ReadState } from '@/composables/useReadRequest';
import { useDialogActivator } from '@/composables/useDialogActivator';
import { useCollectionSheetRefresh, type CollectionSheetUpdate } from '@/composables/useCollectionSheetRefresh';
import { useFlixStore } from '@/stores/flixStore';
import { useLocalizedMedia } from '@/composables/useLocalizedMedia';
import { useDisplay } from 'vuetify';
import DialogSheet from './DialogSheet.vue';
import MediaSummary from './MediaSummary.vue';
import MediaCard from './MediaCard.vue';
import MediaTag from './MediaTag.vue';
import MediaBadges from './MediaBadges.vue';
import { availabilityBadge, countedBadge } from '@/composables/mediaBadges';
import MediaDialog from './MediaDialog.vue';
import ReadFeedback from './ReadFeedback.vue';
import Loading from './Loading.vue';

const props = defineProps<{ search: string | null; movies: LibraryMovie[]; source: MovieCollection[]; collectionState: ReadState; context: string; libraryState: ReadState; initialCollection?: { tmdbId: number } }>();
const emit = defineEmits<{ 'open-movie': [id: number]; 'retry-library': []; 'retry-collections': []; refreshed: [update: CollectionSheetUpdate] }>();
const search = computed(() => props.search ?? '');
const page = defineModel<number>('page', { required: true });
const selectedId = ref<number | null>(null);
const dialog = ref(false);
const renderCollection = ref(false);
watch(dialog, value => { if (value) renderCollection.value = true; }, { flush: 'sync' });
const downloadDialog = ref(false);
const downloadDialogReady = ref(false);
const downloadActivator = useDialogActivator(() => downloadDialog.value);
watch(downloadDialog, value => { if (value) downloadDialogReady.value = true; }, { flush: 'sync' });
const CollectionDownloadDialog = defineAsyncComponent(() => import('./CollectionDownloadDialog.vue'));
const removalDialog = ref(false);
const removalDialogReady = ref(false);
const removalActivator = useDialogActivator(() => removalDialog.value);
watch(removalDialog, value => { if (value) removalDialogReady.value = true; }, { flush: 'sync' });
const CollectionRemovalDialog = defineAsyncComponent(() => import('./CollectionRemovalDialog.vue'));
const missingDialog = ref(false);
const preview = ref<Record<string, unknown> | null>(null);
const memberPage = ref(1);
const activator = useDialogActivator(() => dialog.value);
const { xs, sm } = useDisplay();
const memberPageSize = computed(() => xs.value ? 4 : sm.value ? 6 : 8);
const initialPending = ref(props.initialCollection?.tmdbId);
const collections = computed(() => libraryCollections(props.source, props.movies));
const filtered = computed(() => collections.value.filter(collection => collection.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const pages = computed(() => Math.ceil(filtered.value.length / 12));
const items = computed(() => filtered.value.slice((page.value - 1) * 12, page.value * 12));
const selected = computed(() => collections.value.find(collection => collection.tmdbId === selectedId.value));
const localizedCollection = useLocalizedMedia(() => renderCollection.value ? selected.value : undefined, () => 'collection');
const members = computed(() => selected.value?.members ?? []);
const downloadable = computed(() => downloadableCollectionMovies(members.value));
const removable = computed(() => removableCollectionMovies(members.value));
const memberPages = computed(() => Math.ceil(members.value.length / memberPageSize.value));
const displayedMembers = computed(() => members.value.slice((memberPage.value - 1) * memberPageSize.value, memberPage.value * memberPageSize.value));
const sourceUnavailable = computed(() => props.collectionState.loading || !!props.collectionState.error || !props.collectionState.hasData || props.libraryState.loading || !!props.libraryState.error || !props.libraryState.hasData);
const store = useFlixStore();
const updates = useCollectionSheetRefresh({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData),
  open: () => dialog.value, collection: () => selected.value,
  blocked: () => sourceUnavailable.value || downloadDialog.value || removalDialog.value || missingDialog.value
    || document.querySelectorAll('.v-dialog.v-overlay--active').length > 1,
  refreshed: update => emit('refreshed', update),
});
const disabled = computed(() => sourceUnavailable.value || !!updates.state.error);
const collectionFacts = computed(() => selected.value ? [
  { label: 'Movies', value: members.value.length },
  { label: availabilityBadge(true).label, value: selected.value.available },
  { label: availabilityBadge(false).label, value: selected.value.missing },
] : []);

function openCollection(id: number) {
  if (disabled.value) return;
  selectedId.value = id; memberPage.value = 1; dialog.value = true;
}
function openMember(movie: (typeof members.value)[number]) {
  if (disabled.value) return;
  if (movie.localId) emit('open-movie', movie.localId);
  else {
    preview.value = { ...movie, prependAvatar: movie.poster, runTime: movie.runtime };
    missingDialog.value = true;
  }
}
watch(search, () => { page.value = 1; });
watch(pages, value => { page.value = Math.min(page.value, Math.max(1, value)); });
watch(memberPages, value => { memberPage.value = Math.min(memberPage.value, Math.max(1, value)); });
watch(() => props.context, (_value, previous) => {
  dialog.value = false; missingDialog.value = false; downloadDialog.value = false; removalDialog.value = false; selectedId.value = null;
  if (previous !== undefined) initialPending.value = undefined;
  page.value = 1;
}, { immediate: true, flush: 'sync' });
watch(() => props.initialCollection, value => { initialPending.value = value?.tmdbId; });
watch([collections, disabled, initialPending], () => {
  if (disabled.value || !initialPending.value) return;
  if (collections.value.some(collection => collection.tmdbId === initialPending.value)) {
    openCollection(initialPending.value); initialPending.value = undefined;
  }
}, { immediate: true });
watch(selected, value => { if (!value && props.collectionState.hasData) { dialog.value = false; missingDialog.value = false; } });
</script>

<template>
  <ReadFeedback :state="collectionState" :label="t('Collections')" @retry="emit('retry-collections')" />
  <ReadFeedback :state="libraryState" :label="t('Movie library')" @retry="emit('retry-library')" />
  <Loading :is-loading="collectionState.loading || libraryState.loading" :sentence="t('Loading collections...')" />
  <v-row class="mt-2" density="compact">
    <v-col v-for="collection in items" :key="collection.tmdbId" cols="6" sm="4" md="3" lg="2" class="mb-4">
      <MediaCard :metadata="collection" media-type="collection" :title="collection.title" :poster="collection.poster" :poster-height="250" :subtitle="t('{p0} films', { p0: collection.movies.length })" :label="t('Open collection {p0}', { p0: collection.title })" :disabled="disabled" @open="openCollection(collection.tmdbId)">
        <MediaTag :badge="countedBadge(availabilityBadge(true), collection.available)" />
        <MediaTag v-if="collection.missing" :badge="countedBadge(availabilityBadge(false), collection.missing)" />
      </MediaCard>
    </v-col>
  </v-row>
  <v-alert v-if="!filtered.length && !disabled" type="info" class="mt-4">{{ search.trim() ? t("No collections match your search") : t("No automatic movie collections in this library") }}</v-alert>
  <v-alert v-if="initialPending && !disabled && !collections.some(collection => collection.tmdbId === initialPending)" type="info" class="mt-4">{{ t("This collection is not available in the selected instance.") }}</v-alert>
  <DialogSheet v-if="selected" v-model="dialog" :title="t('Collection')" :label="t('Collection: {p0}', { p0: localizedCollection?.title ?? selected.title })" :context="`${selectedId}:${memberPage}:${memberPageSize}`" :activator="activator" :close-label="t('Close collection')" @closed="!dialog && (renderCollection = false)">
    <ReadFeedback :state="updates.state" :active="dialog" :label="t('Collection updates')" @retry="updates.refresh" />
    <ReadFeedback :state="collectionState" :active="dialog" :label="t('Collections')" @retry="emit('retry-collections')" />
    <ReadFeedback :state="libraryState" :active="dialog" :label="t('Movie library')" @retry="emit('retry-library')" />
    <MediaSummary :item="selected" media-type="collection" :facts="collectionFacts">
      <v-alert v-if="!members.length" type="info" class="mt-3">{{ t("No films reported for this collection") }}</v-alert>
    </MediaSummary>
    <section v-if="members.length" class="collection-members mt-6" :aria-label="t('Collection movies')">
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3"><h3 class="text-subtitle-1 font-weight-bold">{{ t("Movies") }}</h3><span class="text-caption text-medium-emphasis">{{ t("Release year order") }}</span></div>
      <v-row density="compact">
        <v-col v-for="movie in displayedMembers" :key="movie.tmdbId" cols="6" sm="4" md="3">
          <MediaCard :metadata="movie" :title="movie.title" :poster="movie.poster" :subtitle="movie.year || t('Unknown year')" :label="t('View {p0}', { p0: movie.title })" :disabled="disabled" @open="openMember(movie)">
            <MediaBadges :has-file="movie.hasFile" :status="movie.status" />
          </MediaCard>
        </v-col>
      </v-row>
    </section>
    <template #navigation><v-pagination v-if="memberPages > 1" v-model="memberPage" :length="memberPages" :total-visible="$vuetify.display.xs ? 3 : 5" density="compact" :aria-label="t('Collection film pages')" /></template>
    <template #actions>
      <v-btn v-if="downloadable.length" color="primary" prepend-icon="mdi-download-outline" :disabled="disabled" @click="downloadDialog = true">{{ t("Download missing ({p0})", { p0: downloadable.length }) }}</v-btn>
      <v-btn v-if="removable.length" color="error" prepend-icon="mdi-trash-can-outline" :disabled="disabled" @click="removalDialog = true">{{ t("Remove movies ({p0})", { p0: removable.length }) }}</v-btn>
    </template>
  </DialogSheet>
  <CollectionDownloadDialog v-if="downloadDialogReady" v-model="downloadDialog" :activator="downloadActivator" :movies="members" :context="context" :disabled="disabled" @refresh="emit('retry-library'); emit('retry-collections')" />
  <CollectionRemovalDialog v-if="removalDialogReady" v-model="removalDialog" :collection="selected ?? null" :activator="removalActivator" :movies="members" :context="context" :disabled="disabled" @refresh="emit('retry-library'); emit('retry-collections')" />
  <MediaDialog v-model="missingDialog" :item="preview" media-type="Movie" announcement-name="Release" :show-search="false" :show-add="false" :show-remove="false" :show-file-details="false" read-only />
</template>
