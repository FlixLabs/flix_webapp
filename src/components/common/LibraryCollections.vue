<script setup lang="ts">
import { computed, ref, watch, defineAsyncComponent } from 'vue';
import { downloadableCollectionMovies } from '@/composables/useCollectionDownloads';
import { libraryCollections, type LibraryMovie, type MovieCollection } from '@/composables/collections';
import type { ReadState } from '@/composables/useReadRequest';
import { useDialogActivator } from '@/composables/useDialogActivator';
import { useDisplay } from 'vuetify';
import DialogSheet from './DialogSheet.vue';
import MediaSummary from './MediaSummary.vue';
import MediaCard from './MediaCard.vue';
import MediaDialog from './MediaDialog.vue';
import ReadFeedback from './ReadFeedback.vue';
import Loading from './Loading.vue';

const props = defineProps<{ search: string | null; movies: LibraryMovie[]; source: MovieCollection[]; collectionState: ReadState; context: string; libraryState: ReadState; initialCollection?: { tmdbId: number } }>();
const emit = defineEmits<{ 'open-movie': [id: number]; 'retry-library': []; 'retry-collections': [] }>();
const search = computed(() => props.search ?? '');
const page = defineModel<number>('page', { required: true });
const selectedId = ref<number | null>(null);
const dialog = ref(false);
const downloadDialog = ref(false);
const downloadDialogReady = ref(false);
const downloadActivator = useDialogActivator(() => downloadDialog.value);
watch(downloadDialog, value => { if (value) downloadDialogReady.value = true; }, { flush: 'sync' });
const CollectionDownloadDialog = defineAsyncComponent(() => import('./CollectionDownloadDialog.vue'));
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
const members = computed(() => selected.value?.members ?? []);
const downloadable = computed(() => downloadableCollectionMovies(members.value));
const memberPages = computed(() => Math.ceil(members.value.length / memberPageSize.value));
const displayedMembers = computed(() => members.value.slice((memberPage.value - 1) * memberPageSize.value, memberPage.value * memberPageSize.value));
const disabled = computed(() => props.collectionState.loading || !!props.collectionState.error || !props.collectionState.hasData || props.libraryState.loading || !!props.libraryState.error || !props.libraryState.hasData);
const collectionFacts = computed(() => selected.value ? [
  { label: 'Movies', value: members.value.length },
  { label: 'Available', value: selected.value.available },
  { label: 'Missing', value: selected.value.missing },
] : []);
const colors = { Available: 'success', Missing: 'error', Upcoming: 'info', Unknown: undefined };

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
  dialog.value = false; missingDialog.value = false; downloadDialog.value = false; selectedId.value = null;
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
  <ReadFeedback :state="collectionState" label="Collections" @retry="emit('retry-collections')" />
  <ReadFeedback :state="libraryState" label="Movie library" @retry="emit('retry-library')" />
  <Loading :is-loading="collectionState.loading || libraryState.loading" sentence="Loading collections..." />
  <v-row class="mt-2" density="compact">
    <v-col v-for="collection in items" :key="collection.tmdbId" cols="6" sm="4" md="3" lg="2" class="mb-4">
      <MediaCard :title="collection.title" :poster="collection.poster" :poster-height="250" :subtitle="`${collection.movies.length} films`" :label="`Open collection ${collection.title}`" :disabled="disabled" @open="openCollection(collection.tmdbId)">
        <v-chip size="small" color="success" :title="`${collection.available} available`"><span class="text-truncate">{{ collection.available }} available</span></v-chip>
        <v-chip v-if="collection.missing" size="small" color="error" :title="`${collection.missing} missing`"><span class="text-truncate">{{ collection.missing }} missing</span></v-chip>
      </MediaCard>
    </v-col>
  </v-row>
  <v-alert v-if="!filtered.length && !disabled" type="info" class="mt-4">{{ search.trim() ? 'No collections match your search' : 'No automatic movie collections in this library' }}</v-alert>
  <v-alert v-if="initialPending && !disabled && !collections.some(collection => collection.tmdbId === initialPending)" type="info" class="mt-4">This collection is not available in the selected instance.</v-alert>
  <DialogSheet v-if="selected" v-model="dialog" title="Collection" :label="`Collection: ${selected.title}`" :context="`${selectedId}:${memberPage}:${memberPageSize}`" :activator="activator" close-label="Close collection">
    <ReadFeedback :state="collectionState" label="Collections" @retry="emit('retry-collections')" />
    <ReadFeedback :state="libraryState" label="Movie library" @retry="emit('retry-library')" />
    <MediaSummary :item="selected" :facts="collectionFacts">
      <v-alert v-if="!members.length" type="info" class="mt-3">No films reported for this collection</v-alert>
    </MediaSummary>
    <section v-if="members.length" class="collection-members mt-6" aria-label="Collection movies">
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3"><h3 class="text-subtitle-1 font-weight-bold">Movies</h3><span class="text-caption text-medium-emphasis">Release year order</span></div>
      <v-row density="compact">
        <v-col v-for="movie in displayedMembers" :key="movie.tmdbId" cols="6" sm="4" md="3">
          <MediaCard :title="movie.title" :poster="movie.poster" :subtitle="movie.year || 'Unknown year'" :label="`View ${movie.title}`" :disabled="disabled" @open="openMember(movie)">
            <v-chip size="small" :color="colors[movie.state]" :title="movie.state"><span class="text-truncate">{{ movie.state }}</span></v-chip>
            <template #status-caption><span class="text-caption text-medium-emphasis w-100 text-center">{{ movie.inLibrary ? 'In library' : 'Not in library' }}</span></template>
          </MediaCard>
        </v-col>
      </v-row>
    </section>
    <template #navigation><v-pagination v-if="memberPages > 1" v-model="memberPage" :length="memberPages" :total-visible="$vuetify.display.xs ? 3 : 5" density="compact" aria-label="Collection film pages" /></template>
    <template #actions><v-btn v-if="downloadable.length" color="primary" prepend-icon="mdi-download-outline" :disabled="disabled" @click="downloadDialog = true">Download missing ({{ downloadable.length }})</v-btn></template>
  </DialogSheet>
  <CollectionDownloadDialog v-if="downloadDialogReady" v-model="downloadDialog" :activator="downloadActivator" :movies="members" :context="context" :disabled="disabled" @refresh="emit('retry-library'); emit('retry-collections')" />
  <MediaDialog v-model="missingDialog" :item="preview" media-type="Movie" announcement-name="Release" :show-search="false" :show-add="false" :show-remove="false" :show-file-details="false" read-only />
</template>
