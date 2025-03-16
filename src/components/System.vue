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

const config_host_movie = ref<Record<string, any> | null>(null);

const config_host_serie = ref<Record<string, any> | null>(null);

const system_status_movie = ref<Record<string, any> | null>(null);

const system_status_serie = ref<Record<string, any> | null>(null);

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

      if (endpoint == 'config/host') {
        if (type == 'movie') {
          config_host_movie.value = json_data;
        }
        if (type == 'series') {
          config_host_serie.value = json_data;
        }
      }

      if (endpoint == 'system/status') {
        if (type == 'movie') {
          system_status_movie.value = json_data;
          system_status_movie.value.uptime = null;
          if (system_status_movie.value.startTime) {
            system_status_movie.value.uptime = calculateUptime(system_status_movie.value.startTime);
          }
        }
        if (type == 'series') {
          system_status_serie.value = json_data;
          system_status_serie.value.uptime = null;
          if (system_status_serie.value.startTime) {
            system_status_serie.value.uptime = calculateUptime(system_status_serie.value.startTime);
          }
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

function calculateUptime(startTimeStr) {
  const startTime = new Date(startTimeStr);
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();

  const totalSeconds = Math.floor(diff / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  return days + ' days, ' + hours + ' hours, ' + minutes + ' minutes, ' + seconds + ' seconds';
}

onMounted(() => {
  getData('movie', 'diskspace');
  getData('series', 'diskspace');
  getData('movie', 'health');
  getData('series', 'health');
  getData('movie', 'config/host');
  getData('series', 'config/host');
  getData('movie', 'system/status');
  getData('series', 'system/status');
});

setInterval(() => {
  if (system_status_movie.value.startTime) {
    system_status_movie.value.uptime = calculateUptime(system_status_movie.value.startTime);
  }
  if (system_status_serie.value.startTime) {
    system_status_serie.value.uptime = calculateUptime(system_status_serie.value.startTime);
  }
}, 1000);
</script>

<template>
  <v-container>
    <v-row>
      <v-col>
        <h3>Radarr</h3>
        <v-row>
          <v-col>
            <v-card
              v-if="config_host_movie && Object.keys(config_host_movie).length > 0"
              class="mt-4"
              >
              <v-card-title>
                Host Configuration
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Bind Address:
                  </strong>
                  {{ config_host_movie.bindAddress }}
                </p>
                <p>
                  <strong>
                    Port:
                  </strong>
                  {{ config_host_movie.port }}
                </p>
                <p>
                  <strong>
                    Enable SSL:
                  </strong>
                  {{ config_host_movie.enableSsl }}
                </p>
                <p>
                  <strong>
                    Instance Name:
                  </strong>
                  {{ config_host_movie.instanceName }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="system_status_movie && Object.keys(system_status_movie).length > 0"
              >
              <v-card-title>
                System Status
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Version:
                  </strong>
                  {{ system_status_movie.version }}
                </p>
                <p>
                  <strong>
                    Debug:
                  </strong>
                  {{ system_status_movie.isDebug }}
                </p>
                <p>
                  <strong>
                    Production:
                  </strong>
                  {{ system_status_movie.isProduction }}
                </p>
                <p>
                  <strong>
                    Net Core:
                  </strong>
                  {{ system_status_movie.isNetCore }}
                </p>
                <p>
                  <strong>
                    Linux:
                  </strong>
                  {{ system_status_movie.isLinux }}
                </p>
                <p>
                  <strong>
                    MacOS:
                  </strong>
                  {{ system_status_movie.isOsx }}
                </p>
                <p>
                  <strong>
                    Windows:
                  </strong>
                  {{ system_status_movie.isWindows }}
                </p>
                <p>
                  <strong>
                    Docker:
                  </strong>
                  {{ system_status_movie.isDocker }}
                </p>
                <p>
                  <strong>
                    Mode:
                  </strong>
                  {{ system_status_movie.mode }}
                </p>
                <p>
                  <strong>
                    Branch:
                  </strong>
                  {{ system_status_movie.branch }}
                </p>
                <p>
                  <strong>
                    Uptime:
                  </strong>
                  {{ system_status_movie.uptime }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="disk_list_movie.length > 0"
              >
              <v-card-title>
                Space
              </v-card-title>
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
            <v-card
              v-if="health_list_movie.length > 0"
              >
              <v-card-title>
                About
              </v-card-title>
              <v-list>
                <v-list-item
                  v-for="(issue, index) in health_list_movie"
                  :key="index"
                  >
                  <v-list-item-title>
                    {{ issue.message }}
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    <a
                      :href="issue.wikiUrl"
                      target="_blank"
                      >
                      More Info
                    </a>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
            <v-alert
              v-if="!is_loading_movie &&
                    !disk_list_movie.length &&
                    !health_list_movie.length &&
                    !config_host_movie &&
                    !system_status_movie"
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
          </v-col>
        </v-row>
      </v-col>
      <v-col>
        <h3>Sonarr</h3>
        <v-row>
          <v-col>
            <v-card
              v-if="config_host_serie && Object.keys(config_host_serie).length > 0"
              class="mt-4"
              >
              <v-card-title>
                Host Configuration
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Bind Address:
                  </strong>
                  {{ config_host_serie.bindAddress }}
                </p>
                <p>
                  <strong>
                    Port:
                  </strong>
                  {{ config_host_serie.port }}
                </p>
                <p>
                  <strong>
                    Enable SSL:
                  </strong>
                  {{ config_host_serie.enableSsl }}
                </p>
                <p>
                  <strong>
                    Instance Name:
                  </strong>
                  {{ config_host_serie.instanceName }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="system_status_serie && Object.keys(system_status_serie).length > 0"
              >
              <v-card-title>
                System Status
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Version:
                  </strong>
                  {{ system_status_serie.version }}
                </p>
                <p>
                  <strong>
                    Debug:
                  </strong>
                  {{ system_status_serie.isDebug }}
                </p>
                <p>
                  <strong>
                    Production:
                  </strong>
                  {{ system_status_serie.isProduction }}
                </p>
                <p>
                  <strong>
                    Net Core:
                  </strong>
                  {{ system_status_serie.isNetCore }}
                </p>
                <p>
                  <strong>
                    Linux:
                  </strong>
                  {{ system_status_serie.isLinux }}
                </p>
                <p>
                  <strong>
                    MacOS:
                  </strong>
                  {{ system_status_serie.isOsx }}
                </p>
                <p>
                  <strong>
                    Windows:
                  </strong>
                  {{ system_status_serie.isWindows }}
                </p>
                <p>
                  <strong>
                    Docker:
                  </strong>
                  {{ system_status_serie.isDocker }}
                </p>
                <p>
                  <strong>
                    Mode:
                  </strong>
                  {{ system_status_serie.mode }}
                </p>
                <p>
                  <strong>
                    Branch:
                  </strong>
                  {{ system_status_serie.branch }}
                </p>
                <p>
                  <strong>
                    Uptime:
                  </strong>
                  {{ system_status_serie.uptime }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="disk_list_serie.length > 0"
              >
              <v-card-title>
                Space
              </v-card-title>
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
              <v-card-title>
                About
              </v-card-title>
              <v-list>
                <v-list-item v-for="(issue, index) in health_list_serie" :key="index">
                  <v-list-item-title>{{ issue.message }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <a :href="issue.wikiUrl" target="_blank">More Info</a>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
            <v-alert
              v-if="!is_loading_serie &&
                    !disk_list_serie.length &&
                    !health_list_serie.length &&
                    !config_host_serie &&
                    !system_status_serie"
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
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>

</style>
