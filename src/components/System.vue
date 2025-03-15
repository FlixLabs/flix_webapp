<script setup lang="ts">

import { ref, onMounted, computed } from 'vue';

const initial_is_loading_movie = false;
const is_loading_movie = ref(initial_is_loading_movie);
const reset_is_loading_movie = () => {
  is_loading_movie.value = structuredClone(initial_is_loading_movie);
};

const initial_is_loading_serie = false;
const is_loading_serie = ref(initial_is_loading_serie);
const reset_is_loading_serie = () => {
  is_loading_serie.value = structuredClone(initial_is_loading_serie);
};

const disk_list_movie = ref<
  {
    path: string;
    free_space: number;
    total_space: number;
    ratio: number;
  }[]
>([]);

const disk_list_serie = ref<
  {
    path: string;
    free_space: number;
    total_space: number;
    ratio: number;
  }[]
>([]);

const health_list_movie = ref<
  {
    source: string;
    type: string;
    message: string;
    wikiUrl: string;
  }[]
>([]);

const health_list_serie = ref<
  {
    source: string;
    type: string;
    message: string;
    wikiUrl: string;
  }[]
>([]);

function progress_color(ratio: number): string {
  const threshold = import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD;
  return ratio >= threshold ? 'red' : 'blue';
}

function getData(type, endpoint) {
  let base_url = null;
  let api_key = null;

  if (type == 'movie') {
    is_loading_movie.value = true;
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'series') {
    is_loading_serie.value = true;
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(base_url + '/api/v3/' + endpoint + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      if (endpoint == 'diskspace') {
        const data = json_data.map((disk: any) => {
          const free_space = Number((disk.freeSpace / 1024 / 1024 / 1024).toFixed(2));  // en Go
          const total_space = Number((disk.totalSpace / 1024 / 1024 / 1024).toFixed(2)); // en Go
          const ratio = total_space > 0
            ? Number(((1 - free_space / total_space) * 100).toFixed(2))
            : 0;

          return {
            path: disk.path,
            free_space,
            total_space,
            ratio,
          };
        });

        if (type == 'movie') {
          disk_list_movie.value = data;
        }
        if (type == 'series') {
          disk_list_serie.value = data;
        }
      }

      if (endpoint == 'health') {
        const data = json_data.map((health: any) => {
          return {
            source: health.source,
            type: health.type,
            message: health.message,
            wikiUrl: health.wikiUrl
          };
        });

        if (type == 'movie') {
          health_list_movie.value = data;
        }
        if (type == 'series') {
          health_list_serie.value = data;
        }
      }
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      if (type == 'movie') {
        reset_is_loading_movie();
      }
      if (type == 'series') {
        reset_is_loading_serie();
      }
    });
}

onMounted(() => {
  getData('movie', 'diskspace');
  getData('series', 'diskspace');
  getData('movie', 'health');
  getData('series', 'health');
});
</script>

<template>
  <v-container>
    <v-row>
      <v-col>
        <h3>Radarr</h3>
        <v-row>
          <v-col>
            <v-alert
              v-if="!is_loading_movie && !disk_list_movie && !health_list_movie"
              type="info"
              >
              No system information found
            </v-alert>
            <p
              v-if="is_loading_movie"
              justify="center"
              align="center"
              class="mt-4"
              >
              <v-progress-circular
                indeterminate
                color="primary"
                size="50"
                />
              <span
                class="ml-2"
                >
                Loading data...
              </span>
            </p>
            <v-card
              v-if="disk_list_movie.length > 0"
              class="mt-4"
              >
              <v-table>
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Free Space (Go)</th>
                    <th>Total Space (Go)</th>
                    <th>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="disk in disk_list_movie"
                    :key="disk.path"
                    >
                    <td>{{ disk.path }}</td>
                    <td>{{ disk.free_space }}</td>
                    <td>{{ disk.total_space }}</td>
                    <td>
                      <v-progress-linear
                        :model-value="disk.ratio"
                        :color="progress_color(disk.ratio)"
                        height="20"
                        rounded
                        >
                        {{ disk.ratio }} %
                      </v-progress-linear>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card v-if="health_list_movie.length > 0">
              <v-list>
                <v-list-item v-for="(issue, index) in health_list_movie" :key="index">
                  <v-list-item-title>{{ issue.message }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <a :href="issue.wikiUrl" target="_blank">More Info</a>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
      <v-col>
        <h3>Sonarr</h3>
        <v-row>
          <v-alert
            v-if="!is_loading_serie && !disk_list_serie && !health_list_serie"
            type="info"
            >
            No system information found
          </v-alert>
          <p
            v-if="is_loading_serie"
            justify="center"
            align="center"
            class="mt-4"
            >
            <v-progress-circular
              indeterminate
              color="primary"
              size="50"
              />
            <span
              class="ml-2"
              >
              Loading data...
            </span>
          </p>
          <v-col>
            <v-card
              v-if="disk_list_serie.length > 0"
              class="mt-4"
              >
              <v-table>
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Free Space (Go)</th>
                    <th>Total Space (Go)</th>
                    <th>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="disk in disk_list_serie"
                    :key="disk.path"
                    >
                    <td>{{ disk.path }}</td>
                    <td>{{ disk.free_space }}</td>
                    <td>{{ disk.total_space }}</td>
                    <td>
                      <v-progress-linear
                        :model-value="disk.ratio"
                        :color="progress_color(disk.ratio)"
                        height="20"
                        rounded
                      >
                        {{ disk.ratio }} %
                      </v-progress-linear>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card v-if="health_list_serie.length > 0">
              <v-list>
                <v-list-item v-for="(issue, index) in health_list_serie" :key="index">
                  <v-list-item-title>{{ issue.message }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <a :href="issue.wikiUrl" target="_blank">More Info</a>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>

</style>
