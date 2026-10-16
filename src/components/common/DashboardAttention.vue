<script setup lang="ts">
import { t } from '@/i18n';
import { computed, ref } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useDashboardAttention } from '@/composables/useDashboardAttention';
import { useAgentStorage } from '@/composables/useAgentStorage';
import { storageDiagnostic } from '@/composables/storageDiagnostics';
const store = useFlixStore();
const options = { useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData) };
const attention = useDashboardAttention(options);
const agent = useAgentStorage({ ...options, interval: ref(60) });
const { loading, errors, blocked, episodes, missingCount } = attention;
const threshold = Number(import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD) || 90;
const critical = computed(() => {
  const locations = agent.enabled.value ? (['movies', 'series', 'downloads'] as const).flatMap(kind => agent.locations(kind).map(location => ({ ...location, kind })))
    : [...attention.movieStorage.value.map(location => ({ ...location, kind: 'movies' })), ...attention.seriesStorage.value.map(location => ({ ...location, kind: 'series' }))];
  return locations.map(location => ({ ...location, diagnostic: storageDiagnostic(location, threshold) }))
    .filter(location => location.diagnostic.state !== 'available');
});
function refresh() { void attention.refresh(); void agent.refresh(); }
</script>
<template>
  <v-expansion-panels>
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div>
          <div>{{ t("Needs attention") }}</div>
          <div class="text-caption text-medium-emphasis mt-1">
            <template v-if="loading">{{ t("Loading...") }}</template>
            <template v-else>{{ t("{p0} downloads · {p1} {p2} · {p3} storage alerts", { p0: blocked.length, p1: missingCount ?? t("Unavailable"), p2: missingCount === 1 ? 'missing episode' : 'missing episodes', p3: critical.length }) }}</template>
          </div>
          <div v-if="errors.length || agent.error.value" class="text-caption text-warning">{{ t("Some information is unavailable") }}</div>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text eager>
  <v-card variant="flat">
    <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2"> {{ t("Needs attention") }} <v-btn variant="text" prepend-icon="mdi-refresh" :loading="loading" @click="refresh">{{ t("Refresh") }}</v-btn>
    </v-card-title>
    <v-card-text>
      <v-alert v-for="error in errors" :key="error" type="warning" class="mb-2">{{ t(error) }}</v-alert>
      <v-alert v-if="agent.error.value" type="warning" class="mb-2">{{ t(agent.error.value) }}</v-alert>
      <v-row>
        <v-col cols="12" md="4">
          <h3>{{ t("Downloads needing attention") }}</h3>
          <p class="text-caption mt-1">{{ t("{p0} among the loaded downloads (up to 1000 per service).", { p0: blocked.length }) }}</p>
          <v-list v-if="blocked.length" lines="two">
            <v-list-item v-for="record in blocked.slice(0, 5)" :key="`${record.type}-${record.item.id}`" :value="`${record.type}-${record.item.id}`" :title="record.item.title" :subtitle="record.item.errorMessage || record.item.trackedDownloadStatus || record.item.status" to="/downloads" append-icon="mdi-chevron-right" />
          </v-list>
          <v-btn class="mt-3" variant="tonal" to="/downloads">{{ t("View downloads") }}</v-btn>
        </v-col>
        <v-col cols="12" md="4">
          <h3>{{ t("Missing monitored episodes") }}</h3>
          <p class="text-caption mt-1">{{ missingCount === null ? t("Unavailable") : t("{p0} episodes", { p0: missingCount }) }}</p>
          <v-list v-if="episodes.length" lines="two">
            <v-list-item v-for="episode in episodes" :key="episode.id" :value="episode.id" :title="episode.series?.title || episode.title" :subtitle="t('S{p0} E{p1} - {p2}', { p0: episode.seasonNumber, p1: episode.episodeNumber, p2: episode.title })" :to="{ path: '/library', query: { media: 'series', id: episode.seriesId } }" append-icon="mdi-chevron-right" />
          </v-list>
          <v-btn class="mt-3" variant="tonal" :to="{ path: '/library', query: { media: 'series' } }">{{ t("View series") }}</v-btn>
        </v-col>
        <v-col cols="12" md="4">
          <h3>{{ t("Storage needing attention") }}</h3>
          <v-list v-if="critical.length" lines="two">
            <v-list-item v-for="location in critical" :key="`${location.kind}:${location.path}`" :value="`${location.kind}:${location.path}`" :title="`${location.kind}: ${location.path || t('Not reported')}`" :subtitle="t(location.diagnostic.message)" to="/system" append-icon="mdi-chevron-right" />
          </v-list>
          <p v-else class="text-caption mt-1">{{ t("No critical location among available measurements.") }}</p>
          <v-btn class="mt-3" variant="tonal" to="/system">{{ t("View storage") }}</v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
