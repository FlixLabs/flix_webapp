<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  grouped_episodes: Record<number, any[]>;
  isLoading: boolean;
  hasTotalSize?: boolean;
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
  return (sizeInBytes / 1e9).toFixed(2);
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
            <span>Season {{ season }}</span>
            <v-spacer />
            <v-text-field
              v-if="(seasonSizes[String(season)] || 0) > 0"
              class="season-size-field"
              label="Size (GB)"
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
              <v-list-item-content>
                <v-list-item-title>
                  {{ episode.title }}
                </v-list-item-title>
                <v-list-item-subtitle>
                  Episode {{ episode.episode }} - {{ episode.airDate || "Date unknown" }}
                </v-list-item-subtitle>
                <v-list-item-action
                  class="pt-2"
                  >
                  <v-chip
                    v-if="episode.hasFile"
                    color="green"
                    small
                    >
                    Existing
                  </v-chip>
                  <v-chip
                    v-else
                    color="red"
                    small
                    >
                    Missing
                  </v-chip>
                </v-list-item-action>
                <v-row
                  v-if="episode.relativePath"
                  class="mt-4"
                  >
                  <v-col>
                    <v-row>
                      <v-col>
                        <v-tooltip
                          :text="episode.relativePath"
                          >
                          <template
                            #activator="{ props }"
                            >
                            <span
                              v-bind="props"
                              style="cursor:pointer;"
                              >
                              <v-text-field
                                label="File"
                                variant="outlined"
                                v-model="episode.relativePath"
                                :disabled="true"
                                />
                            </span>
                          </template>
                        </v-tooltip>
                      </v-col>
                    </v-row>
                    <v-row
                      class="mt-0"
                      >
                      <v-col>
                        <v-text-field
                          label="Size (GB)"
                          variant="outlined"
                          :model-value="(episode.sizeOnDisk / 1e9).toFixed(2)"
                          :disabled="true"
                          />
                      </v-col>
                      <v-col>
                        <v-text-field
                          label="Quality"
                          variant="outlined"
                          :model-value="episode.quality"
                          :disabled="true"
                          />
                      </v-col>
                    </v-row>
                  </v-col>
                </v-row>
              </v-list-item-content>
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
      >
      No episode found
    </v-alert>
  </div>
</template>

<style scoped>
.season-size-field {
  max-width: 170px;
  margin-inline-end: 8px;
}
</style>
