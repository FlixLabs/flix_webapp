<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useDashboardAttention } from '@/composables/useDashboardAttention';
import { useAgentStorage } from '@/composables/useAgentStorage';
const store = useFlixStore();
const options = { useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData) };
const attention = useDashboardAttention(options);
const agent = useAgentStorage({ ...options, interval: ref(60) });
const { loading, errors, blocked, episodes, missingCount } = attention;
const threshold = Number(import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD) || 90;
const critical = computed(() => {
  const locations = agent.enabled.value ? (['movies', 'series', 'downloads'] as const).flatMap(kind => agent.locations(kind).map(location => ({ ...location, kind })))
    : [...attention.movieStorage.value.map(location => ({ ...location, kind: 'movies' })), ...attention.seriesStorage.value.map(location => ({ ...location, kind: 'series' }))];
  return locations.filter(location => !location.accessible || (location.ratio !== null && location.ratio >= threshold));
});
function refresh() { void attention.refresh(); void agent.refresh(); }
</script>
<template>
  <v-expansion-panels>
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div>
          <div>Needs attention</div>
          <div class="text-caption text-medium-emphasis mt-1">
            <template v-if="loading">Loading...</template>
            <template v-else>{{ blocked.length }} downloads &middot; {{ missingCount ?? 'Unavailable' }} {{ missingCount === 1 ? 'missing episode' : 'missing episodes' }} &middot; {{ critical.length }} storage alerts</template>
          </div>
          <div v-if="errors.length || agent.error.value" class="text-caption text-warning">Some information is unavailable</div>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text eager>
  <v-card variant="flat">
    <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2">
      Needs attention
      <v-btn variant="text" prepend-icon="mdi-refresh" :loading="loading" @click="refresh">Refresh</v-btn>
    </v-card-title>
    <v-card-text>
      <v-alert v-for="error in errors" :key="error" type="warning" class="mb-2">{{ error }}</v-alert>
      <v-alert v-if="agent.error.value" type="warning" class="mb-2">{{ agent.error.value }}</v-alert>
      <v-row>
        <v-col cols="12" md="4">
          <h3>Downloads needing attention</h3>
          <p class="text-caption mt-1">{{ blocked.length }} among the loaded downloads (up to 1000 per service).</p>
          <v-list v-if="blocked.length" lines="two">
            <v-list-item v-for="record in blocked.slice(0, 5)" :key="`${record.type}-${record.item.id}`" :value="`${record.type}-${record.item.id}`" :title="record.item.title" :subtitle="record.item.errorMessage || record.item.trackedDownloadStatus || record.item.status" to="/downloads" append-icon="mdi-chevron-right" />
          </v-list>
          <v-btn class="mt-3" variant="tonal" color="primary" to="/downloads">View downloads</v-btn>
        </v-col>
        <v-col cols="12" md="4">
          <h3>Missing monitored episodes</h3>
          <p class="text-caption mt-1">{{ missingCount === null ? 'Unavailable' : `${missingCount} episodes` }}</p>
          <v-list v-if="episodes.length" lines="two">
            <v-list-item v-for="episode in episodes" :key="episode.id" :value="episode.id" :title="episode.series?.title || episode.title" :subtitle="`S${episode.seasonNumber} E${episode.episodeNumber} - ${episode.title}`" :to="{ path: '/library', query: { media: 'series', id: episode.seriesId } }" append-icon="mdi-chevron-right" />
          </v-list>
          <v-btn class="mt-3" variant="tonal" color="primary" :to="{ path: '/library', query: { media: 'series' } }">View series</v-btn>
        </v-col>
        <v-col cols="12" md="4">
          <h3>Critical storage</h3>
          <v-list v-if="critical.length" lines="two">
            <v-list-item v-for="location in critical" :key="`${location.kind}:${location.path}`" :value="`${location.kind}:${location.path}`" :title="`${location.kind}: ${location.path}`" :subtitle="!location.accessible ? 'Unavailable' : `${location.ratio?.toFixed(1)}% used`" to="/system" append-icon="mdi-chevron-right" />
          </v-list>
          <p v-else class="text-caption mt-1">No critical location among available measurements.</p>
          <v-btn class="mt-3" variant="tonal" color="primary" to="/system">View storage</v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
