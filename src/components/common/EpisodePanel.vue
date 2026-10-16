<script setup lang="ts">
import { t, decimal } from '@/i18n';
import MediaFileDetails from './MediaFileDetails.vue';
import LocalizedEpisode from './LocalizedEpisode.vue';
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  grouped_episodes: Record<number, any[]>;
  isLoading: boolean;
  hasTotalSize?: boolean;
  mediaIdentity?: { tmdbId?: unknown; tvdbId?: unknown };
}>(), {
  hasTotalSize: true
});

const seasonSizes = computed(() => {
  return Object.entries(props.grouped_episodes).reduce((acc, [season, episodes]) => {
    acc[season] = episodes.reduce((sum: number, episode: any) => {
      const episodeSize = typeof episode?.sizeOnDisk === 'number' ? episode.sizeOnDisk : 0;
      return sum + episodeSize;
    }, 0);
    return acc;
  }, {} as Record<string, number>);
});

function formatSizeGb(sizeInBytes: number) {
  return decimal((sizeInBytes / 1e9));
}
</script>

<template>
  <slot
    name="loading"
    />
  <div
    v-if="Object.keys(grouped_episodes).length && !isLoading"
    :class="props.hasTotalSize ? 'mt-4' : 'mt-6'"
    >
    <v-expansion-panels>
      <v-expansion-panel
        v-for="(episodes, season) in grouped_episodes"
        :key="season"
        >
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100">
            <span>{{ t("Season {p0}", { p0: season }) }}</span>
            <v-spacer />
            <v-text-field
              v-if="(seasonSizes[String(season)] || 0) > 0"
              class="season-size-field"
              :label="t('Size (GB)')"
              variant="outlined"
              density="compact"
              hide-details
              :model-value="formatSizeGb(seasonSizes[String(season)] || 0)"
              :disabled="true"
              />
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-list>
            <v-list-item
              v-for="(episode, index) in episodes"
              :key="index"
              >
              <div>
                <v-list-item-title>
                  <LocalizedEpisode :item="{ ...mediaIdentity, season: episode.season, episode: episode.episode, title: episode.title }" v-slot="{ title }">{{ title }}</LocalizedEpisode>
                </v-list-item-title>
                <v-list-item-subtitle>{{ t("Episode {p0} - {p1}", { p0: episode.episode, p1: episode.airDate || t("Date unknown") }) }}
                </v-list-item-subtitle>
                <div
                  class="pt-2"
                  >
                  <v-chip
                    v-if="episode.hasFile"
                    color="green"
                    small
                    >{{ t("Existing") }}</v-chip>
                  <v-chip
                    v-else
                    color="red"
                    small
                    >{{ t("Missing") }}</v-chip>
                </div>
                <MediaFileDetails v-if="episode.relativePath" class="mt-4" :item="episode" />
              </div>
            </v-list-item>
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
  <div
    v-else-if="!Object.keys(grouped_episodes).length && !isLoading"
    >
    <v-alert
      type="info"
      class="mt-4"
      >{{ t("No episode found") }}</v-alert>
  </div>
</template>

<style scoped>
.season-size-field {
  max-width: 170px;
  margin-inline-end: 8px;
}
</style>
