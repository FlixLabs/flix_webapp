<script setup lang="ts">
import { t, translatedChoices, decimal } from '@/i18n';
import { useLocalizedMedia, useLocalizedEpisode, localizedEpisodeTitle } from '@/composables/useLocalizedMedia';
import { computed, ref, shallowRef, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useReleaseSearch, releaseSourceUrl, type Release } from '@/composables/useReleaseSearch';
import type { MediaActionItem } from '@/composables/useMediaActions';
import type { MediaType } from '@/composables/useMediaService';
import { useDialogActivator, preserveNestedDialogFocus } from '@/composables/useDialogActivator';

const model = defineModel<boolean>({ required: true });
const props = defineProps<{ mediaType: MediaType; item: MediaActionItem | null }>();
const emit = defineEmits<{ grabbed: [] }>();
const store = useFlixStore();
const actions = useReleaseSearch({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'),
  selectedInstanceData: computed(() => store.selectedInstanceData),
});
const { releases, seasons, seasonEpisodes, season, episodeId, isSearching, isLoadingEpisodes, isGrabbing, hasSearched, error } = actions;
const localizedItem = useLocalizedMedia(() => model.value ? props.item : null, () => props.mediaType);
useLocalizedEpisode(() => model.value && props.mediaType === 'series' && props.item && season.value !== null
  ? { ...props.item, season: season.value, episode: 0 } : { season: -1, episode: -1 });
const filter = ref('');
const selectedRelease = shallowRef<Release | null>(null);
const confirming = computed({ get: () => !!selectedRelease.value, set: value => { if (!value) selectedRelease.value = null; } });
const dialogActivator = useDialogActivator(() => model.value);
const confirmationActivator = useDialogActivator(() => confirming.value);
const cancelButton = ref<{ $el: HTMLElement } | null>(null);
const releaseCard = ref<{ $el: HTMLElement } | null>(null);
const seasonItems = computed(() => seasons.value.map(value => ({ title: t('Season {p0}', { p0: value }), value })));
const episodeItems = computed(() => [
  { title: t('All episodes / season packs'), value: null },
  ...seasonEpisodes.value.map(e => ({ title: t('Episode {p0} - {p1}', { p0: e.episodeNumber, p1: localizedEpisodeTitle(props.item ?? {}, e.seasonNumber, e.episodeNumber, e.title) }), value: e.id })),
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
  <v-dialog v-model="model" :activator="dialogActivator" :open-on-click="false" :aria-label="t('Choose Release - {p0}', { p0: localizedItem?.title ?? item?.title ?? '' })" max-width="1200" transition="fade-transition" scrollable :persistent="isGrabbing" @after-enter="preserveNestedDialogFocus(releaseCard?.$el)">
    <v-card ref="releaseCard">
      <v-card-title class="text-wrap">{{ t("Choose Release - {p0}", { p0: item?.title }) }}</v-card-title>
      <v-card-text>
        <v-alert v-if="error && !confirming" type="error" class="mb-4">{{ t(error) }}</v-alert>
        <v-row v-if="mediaType === 'series'">
          <v-col cols="12" sm="4">
            <v-select v-model="season" :items="seasonItems" :label="t('Season')" variant="outlined" :loading="isLoadingEpisodes" :disabled="isLoadingEpisodes || isGrabbing" />
          </v-col>
          <v-col cols="12" sm="8">
            <v-select v-model="episodeId" :items="episodeItems" :label="t('Episode')" variant="outlined" :disabled="isLoadingEpisodes || season === null || isGrabbing" :menu-props="{ maxWidth: 600 }" />
          </v-col>
        </v-row>
        <v-alert v-if="mediaType === 'series' && !isLoadingEpisodes && !seasons.length && !error" type="info" class="mb-4">{{ t("No episode available for this series.") }}</v-alert>
        <div class="d-flex flex-wrap align-center ga-3 mb-4">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-magnify" :loading="isSearching" :disabled="isLoadingEpisodes || isGrabbing || (mediaType === 'series' && season === null)" @click="actions.search">{{ t("Search releases") }}</v-btn>
          <span class="text-caption text-medium-emphasis">{{ t("Searching does not start a download.") }}</span>
        </div>
        <v-text-field v-if="releases.length" v-model="filter" :label="t('Filter releases')" prepend-inner-icon="mdi-filter-outline" variant="outlined" density="compact" clearable hide-details class="mb-4" />
        <v-data-table
          :headers="translatedChoices(headers)"
          :items="releases"
          :item-value="release => `${release.indexerId}:${release.guid}`"
          :search="filter ?? ''"
          :loading="isSearching ? 'primary' : false"
          :items-per-page="10"
          mobile-breakpoint="sm"
          :no-data-text="hasSearched ? t('No release found.') : t('Choose a season or episode, then search releases.')"
          :loading-text="t('Searching indexers...')"
        >
          <template #[slots.title]="{ item: release }">
            <div class="py-2 text-wrap release-title">{{ release.title }}</div>
            <a v-if="releaseSourceUrl(release)" :href="releaseSourceUrl(release)" target="_blank" rel="noopener noreferrer" class="release-source text-primary text-caption d-inline-flex align-center ga-1 mb-2" :aria-label="t('View source page for {p0}', { p0: release.title })">{{ t('Source page') }}<v-icon icon="mdi-open-in-new" size="14" aria-hidden="true" /></a>
            <div v-if="release.languages?.length" class="text-caption text-medium-emphasis pb-2">{{ release.languages.map((language: { name: string }) => language.name).join(', ') }}</div>
          </template>
          <template #[slots.size]="{ item: release }">{{ typeof release.size === 'number' ? decimal((release.size / 1e9)) : '-' }}</template>
          <template #[slots.seeders]="{ item: release }">{{ release.seeders ?? '-' }}</template>
          <template #[slots.score]="{ item: release }">{{ release.customFormatScore ?? '-' }}</template>
          <template #[slots.status]="{ item: release }">
            <details v-if="release.rejections?.length">
              <summary class="text-warning">{{ t("Rejected ({p0})", { p0: release.rejections.length }) }}</summary>
              <ul class="pl-4 py-2"><li v-for="reason in release.rejections" :key="reason">{{ reason }}</li></ul>
            </details>
            <span v-else :class="release.rejected || release.temporarilyRejected ? 'text-warning' : 'text-success'">{{ release.rejected || release.temporarilyRejected ? t('Rejected') : t('Accepted') }}</span>
          </template>
          <template #[slots.actions]="{ item: release }">
            <v-btn color="primary" variant="text" size="small" prepend-icon="mdi-download" :disabled="isSearching || isGrabbing || release.downloadAllowed === false" :aria-label="t('Choose {p0}', { p0: release.title })" @click="selectedRelease = release">{{ t("Choose") }}</v-btn>
            <div v-if="release.downloadAllowed === false" class="text-caption text-warning">{{ t("Cannot be downloaded") }}</div>
          </template>
        </v-data-table>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn color="on-surface" :disabled="isGrabbing" @click="model = false">{{ t("Close") }}</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="confirming" :activator="confirmationActivator" :open-on-click="false" :aria-label="t('Download this release?')" max-width="600" :persistent="isGrabbing" @after-enter="cancelButton?.$el.focus({ preventScroll: true })">
    <v-card>
      <v-card-title>{{ t("Download this release?") }}</v-card-title>
      <v-card-text>
        <p class="text-break mb-4">{{ selectedRelease?.title }}</p>
        <v-alert v-if="selectedRelease?.rejected || selectedRelease?.temporarilyRejected || selectedRelease?.rejections?.length" type="warning" class="mb-4"> {{ t("This release was rejected by") }} {{ mediaType === 'movies' ? t("Radarr") : t("Sonarr") }}{{ t(". Downloading it manually may bypass your quality preferences.") }} <ul class="pl-4 mt-2"><li v-for="reason in selectedRelease?.rejections" :key="reason">{{ reason }}</li></ul>
        </v-alert>
        <v-alert v-if="error" type="error">{{ t(error) }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="on-surface" ref="cancelButton" :disabled="isGrabbing" @click="selectedRelease = null">{{ t("Cancel") }}</v-btn>
        <v-btn color="primary" :loading="isGrabbing" @click="download">{{ t("Download") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.release-title {
  overflow-wrap: anywhere;
}
.release-source { text-decoration: none; }
.release-source:hover { text-decoration: underline; }
</style>
