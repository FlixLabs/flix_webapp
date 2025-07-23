<script setup lang="ts">

const props = defineProps<{
  grouped_episodes: Record<number, any[]>;
  isLoading: boolean;
}>();
</script>

<template>
  <slot
    name="loading"
    />
  <div
    v-if="Object.keys(grouped_episodes).length && !isLoading"
    class="mt-4"
    >
    <v-expansion-panels>
      <v-expansion-panel
        v-for="(episodes, season) in grouped_episodes"
        :key="season"
        >
        <v-expansion-panel-title>
          Season {{ season }}
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
