<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useReleaseSearch, type Release } from '@/composables/useReleaseSearch';
import type { MediaActionItem } from '@/composables/useMediaActions';
import type { MediaType } from '@/composables/useMediaService';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{ mediaType: MediaType; item: MediaActionItem | null }>();
const emit = defineEmits<{ grabbed: [] }>();
const store = useFlixStore();
const actions = useReleaseSearch({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'),
  selectedInstanceData: computed(() => store.selectedInstanceData),
});
const { releases, seasons, seasonEpisodes, season, episodeId, isSearching, isLoadingEpisodes, isGrabbing, hasSearched, error } = actions;
const filter = ref('');
const selectedRelease = shallowRef<Release | null>(null);
const confirming = computed({ get: () => !!selectedRelease.value, set: value => { if (!value) selectedRelease.value = null; } });
const seasonItems = computed(() => seasons.value.map(value => ({ title: `Season ${value}`, value })));
const episodeItems = computed(() => [
  { title: 'All episodes / season packs', value: null },
  ...seasonEpisodes.value.map(e => ({ title: `Episode ${e.episodeNumber} - ${e.title}`, value: e.id })),
]);
const slots = {
  title: 'item.title', size: 'item.size', seeders: 'item.seeders',
  score: 'item.customFormatScore', status: 'item.rejections', actions: 'item.actions',
};
const headers = [
  { title: 'Release', key: 'title', minWidth: '260px' },
  { title: 'Quality', key: 'quality.quality.name' },
  { title: 'Size (GB)', key: 'size' },
  { title: 'Indexer', key: 'indexer' },
  { title: 'Protocol', key: 'protocol' },
  { title: 'Seeders', key: 'seeders' },
  { title: 'Score', key: 'customFormatScore' },
  { title: 'Status', key: 'rejections', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, fixed: 'end' as const, width: '110px' },
];

watch(() => [model.value, props.mediaType, props.item?.id], () => {
  filter.value = '';
  selectedRelease.value = null;
  if (model.value && props.item) void actions.open(props.mediaType, props.item);
  else actions.close();
});
watch(actions.dialog, value => { if (!value) model.value = false; });
watch(releases, () => { selectedRelease.value = null; });

async function download() {
  if (selectedRelease.value && await actions.grab(selectedRelease.value)) {
    selectedRelease.value = null;
    model.value = false;
    emit('grabbed');
  }
}
</script>

<template>
  <!-- Keep select-menu measurements stable while the dialog opens. -->
  <v-dialog v-model="model" max-width="1200" transition="fade-transition" scrollable :persistent="isGrabbing">
    <v-card>
      <v-card-title class="text-wrap">Choose Release - {{ item?.title }}</v-card-title>
      <v-card-text>
        <v-alert v-if="error && !confirming" type="error" class="mb-4">{{ error }}</v-alert>
        <v-row v-if="mediaType === 'series'">
          <v-col cols="12" sm="4">
            <v-select v-model="season" :items="seasonItems" label="Season" variant="outlined" :loading="isLoadingEpisodes" :disabled="isLoadingEpisodes || isGrabbing" />
          </v-col>
          <v-col cols="12" sm="8">
            <v-select v-model="episodeId" :items="episodeItems" label="Episode" variant="outlined" :disabled="isLoadingEpisodes || season === null || isGrabbing" :menu-props="{ maxWidth: 600 }" />
          </v-col>
        </v-row>
        <v-alert v-if="mediaType === 'series' && !isLoadingEpisodes && !seasons.length && !error" type="info" class="mb-4">No episode available for this series.</v-alert>
        <div class="d-flex flex-wrap align-center ga-3 mb-4">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-magnify" :loading="isSearching" :disabled="isLoadingEpisodes || isGrabbing || (mediaType === 'series' && season === null)" @click="actions.search">Search releases</v-btn>
          <span class="text-caption text-medium-emphasis">Searching does not start a download.</span>
        </div>
        <v-text-field v-if="releases.length" v-model="filter" label="Filter releases" prepend-inner-icon="mdi-filter-outline" variant="outlined" density="compact" clearable hide-details class="mb-4" />
        <v-data-table
          :headers="headers"
          :items="releases"
          :item-value="release => `${release.indexerId}:${release.guid}`"
          :search="filter ?? ''"
          :loading="isSearching"
          :items-per-page="10"
          mobile-breakpoint="sm"
          :no-data-text="hasSearched ? 'No release found.' : 'Choose a season or episode, then search releases.'"
          loading-text="Searching indexers..."
        >
          <template #[slots.title]="{ item: release }">
            <div class="py-2 text-wrap release-title">{{ release.title }}</div>
            <div v-if="release.languages?.length" class="text-caption text-medium-emphasis pb-2">{{ release.languages.map((language: { name: string }) => language.name).join(', ') }}</div>
          </template>
          <template #[slots.size]="{ item: release }">{{ typeof release.size === 'number' ? (release.size / 1e9).toFixed(2) : '-' }}</template>
          <template #[slots.seeders]="{ item: release }">{{ release.seeders ?? '-' }}</template>
          <template #[slots.score]="{ item: release }">{{ release.customFormatScore ?? '-' }}</template>
          <template #[slots.status]="{ item: release }">
            <details v-if="release.rejections?.length">
              <summary class="text-warning">Rejected ({{ release.rejections.length }})</summary>
              <ul class="pl-4 py-2"><li v-for="reason in release.rejections" :key="reason">{{ reason }}</li></ul>
            </details>
            <span v-else :class="release.rejected || release.temporarilyRejected ? 'text-warning' : 'text-success'">{{ release.rejected || release.temporarilyRejected ? 'Rejected' : 'Accepted' }}</span>
          </template>
          <template #[slots.actions]="{ item: release }">
            <v-btn color="primary" variant="text" size="small" prepend-icon="mdi-download" :disabled="isSearching || isGrabbing || release.downloadAllowed === false" :aria-label="`Choose ${release.title}`" @click="selectedRelease = release">Choose</v-btn>
            <div v-if="release.downloadAllowed === false" class="text-caption text-warning">Cannot be downloaded</div>
          </template>
        </v-data-table>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn :disabled="isGrabbing" @click="model = false">Close</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="confirming" max-width="600" :persistent="isGrabbing">
    <v-card>
      <v-card-title>Download this release?</v-card-title>
      <v-card-text>
        <p class="text-break mb-4">{{ selectedRelease?.title }}</p>
        <v-alert v-if="selectedRelease?.rejected || selectedRelease?.temporarilyRejected || selectedRelease?.rejections?.length" type="warning" class="mb-4">
          This release was rejected by {{ mediaType === 'movies' ? 'Radarr' : 'Sonarr' }}. Downloading it manually may bypass your quality preferences.
          <ul class="pl-4 mt-2"><li v-for="reason in selectedRelease?.rejections" :key="reason">{{ reason }}</li></ul>
        </v-alert>
        <v-alert v-if="error" type="error">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="isGrabbing" @click="selectedRelease = null">Cancel</v-btn>
        <v-btn color="primary" :loading="isGrabbing" @click="download">Download</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.release-title {
  overflow-wrap: anywhere;
}
</style>
