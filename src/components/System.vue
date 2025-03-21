<script setup lang="ts">

import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { useDiskAndLogAndHealthList } from '@/composables/useDiskAndLogAndHealthList';

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { createDiskList, createLogList, createHealthList } = useDiskAndLogAndHealthList();

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const configHostMovie = ref<Record<string, any> | null>({});
const systemStatusMovie = ref<Record<string, any> | null>({});
const { state: systemStatusMovieInterval, reset: resetSystemStatusMovieInterval } = useResettable(60);
const diskListMovie = createDiskList();
const { state: diskListMovieInterval, reset: resetDiskListMovieInterval } = useResettable(60);
const logListMovie = createLogList();
const { state: logListMovieInterval, reset: resetLogListMovieInterval } = useResettable(60);
const healthListMovie = createHealthList();
const { state: healthListMovieInterval, reset: resetHealthListMovieInterval } = useResettable(60);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const configHostSerie = ref<Record<string, any> | null>({});
const systemStatusSerie = ref<Record<string, any> | null>({});
const { state: systemStatusSerieInterval, reset: resetSystemStatusSerieInterval } = useResettable(60);
const diskListSerie = createDiskList();
const { state: diskListSerieInterval, reset: resetDiskListSerieInterval } = useResettable(60);
const logListSerie = createLogList();
const { state: logListSerieInterval, reset: resetLogListSerieInterval } = useResettable(60);
const healthListSerie = createHealthList();
const { state: healthListSerieInterval, reset: resetHealthListSerieInterval } = useResettable(60);

function progressColor(ratio: number): string {
  const threshold = import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD;
  return ratio >= threshold ? 'red' : 'blue';
}

function getData(type, endpoint) {
  let base_url = null;
  let api_key = null;

  const ignoreLoading = [
    'diskspace',
    'log',
    'health'
  ]

  if (type == 'movies') {
    if (!ignoreLoading.includes(endpoint)) {
      isLoadingMovie.value = true;
    }
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'series') {
    if (!ignoreLoading.includes(endpoint)) {
      isLoadingSerie.value = true;
    }
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(base_url + '/api/v3/' + endpoint + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      if (endpoint == 'config/host') {
        if (type == 'movies') {
          configHostMovie.value = json_data;
        }
        if (type == 'series') {
          configHostSerie.value = json_data;
        }
      }

      if (endpoint == 'system/status') {
        if (type == 'movies') {
          systemStatusMovie.value = json_data;
          systemStatusMovie.value.uptime = null;
          if (systemStatusMovie.value.startTime) {
            systemStatusMovie.value.uptime = calculateUptime(systemStatusMovie.value.startTime);
          }
        }
        if (type == 'series') {
          systemStatusSerie.value = json_data;
          systemStatusSerie.value.uptime = null;
          if (systemStatusSerie.value.startTime) {
            systemStatusSerie.value.uptime = calculateUptime(systemStatusSerie.value.startTime);
          }
        }
      }

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

        if (type == 'movies') {
          diskListMovie.value = data;
        }
        if (type == 'series') {
          diskListSerie.value = data;
        }
      }

      if (endpoint == 'log') {
        const data = json_data.records.map((log: any) => {
          return {
            time: log.time,
            level: log.level,
            message: log.message
          };
        });

        if (type == 'movies') {
          logListMovie.value = data;
        }
        if (type == 'series') {
          logListSerie.value = data;
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

        if (type == 'movies') {
          healthListMovie.value = data;
        }
        if (type == 'series') {
          healthListSerie.value = data;
        }
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      if (type == 'movies') {
        resetIsLoadingMovie();
      }
      if (type == 'series') {
        resetIsLoadingSerie();
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

let systemStatusMovieIntervalId = null;
const startSystemStatusMovieInterval = () => {
  if (systemStatusMovieIntervalId) {
    clearInterval(systemStatusMovieIntervalId);
  }
  systemStatusMovieIntervalId = setInterval(() => {
    systemStatusMovie.value.uptime = calculateUptime(systemStatusMovie.value.startTime);
  }, systemStatusMovieInterval.value * 1000);
};
watch(systemStatusMovieInterval, () => {
  if (!isNaN(systemStatusMovieInterval.value) && systemStatusMovieInterval.value > 0) {
    startSystemStatusMovieInterval();
  }
});
let diskListMovieIntervalId = null;
const startDiskListMovieInterval = () => {
  if (diskListMovieIntervalId) {
    clearInterval(diskListMovieIntervalId);
  }
  diskListMovieIntervalId = setInterval(() => {
    getData('movies', 'diskspace');
  }, diskListMovieInterval.value * 1000);
};
watch(diskListMovieInterval, () => {
  if (!isNaN(diskListMovieInterval.value) && diskListMovieInterval.value > 0) {
    startDiskListMovieInterval();
  }
});
let logListMovieIntervalId = null;
const startLogListMovieInterval = () => {
  if (logListMovieIntervalId) {
    clearInterval(logListMovieIntervalId);
  }
  logListMovieIntervalId = setInterval(() => {
    getData('movies', 'log');
  }, logListMovieInterval.value * 1000);
};
watch(logListMovieInterval, () => {
  if (!isNaN(logListMovieInterval.value) && logListMovieInterval.value > 0) {
    startLogListMovieInterval();
  }
});
let healthListMovieIntervalId = null;
const startHealthListMovieInterval = () => {
  if (healthListMovieIntervalId) {
    clearInterval(healthListMovieIntervalId);
  }
  healthListMovieIntervalId = setInterval(() => {
    getData('movies', 'health');
  }, healthListMovieInterval.value * 1000);
};
watch(healthListMovieInterval, () => {
  if (!isNaN(healthListMovieInterval.value) && healthListMovieInterval.value > 0) {
    startHealthListMovieInterval();
  }
});

let systemStatusSerieIntervalId = null;
const startSystemStatusSerieInterval = () => {
  if (systemStatusSerieIntervalId) {
    clearInterval(systemStatusSerieIntervalId);
  }
  systemStatusSerieIntervalId = setInterval(() => {
    systemStatusSerie.value.uptime = calculateUptime(systemStatusSerie.value.startTime);
  }, systemStatusSerieInterval.value * 1000);
};
watch(systemStatusSerieInterval, () => {
  if (!isNaN(systemStatusSerieInterval.value) && systemStatusSerieInterval.value > 0) {
    startSystemStatusSerieInterval();
  }
});
let diskListSerieIntervalId = null;
const startDiskListSerieInterval = () => {
  if (diskListSerieIntervalId) {
    clearInterval(diskListSerieIntervalId);
  }
  diskListSerieIntervalId = setInterval(() => {
    getData('series', 'diskspace');
  }, diskListSerieInterval.value * 1000);
};
watch(diskListSerieInterval, () => {
  if (!isNaN(diskListSerieInterval.value) && diskListSerieInterval.value > 0) {
    startDiskListSerieInterval();
  }
});
let logListSerieIntervalId = null;
const startLogListSerieInterval = () => {
  if (logListSerieIntervalId) {
    clearInterval(logListSerieIntervalId);
  }
  logListSerieIntervalId = setInterval(() => {
    getData('series', 'log');
  }, logListSerieInterval.value * 1000);
};
watch(logListSerieInterval, () => {
  if (!isNaN(logListSerieInterval.value) && logListSerieInterval.value > 0) {
    startLogListSerieInterval();
  }
});
let healthListSerieIntervalId = null;
const startHealthListSerieInterval = () => {
  if (healthListSerieIntervalId) {
    clearInterval(healthListSerieIntervalId);
  }
  healthListSerieIntervalId = setInterval(() => {
    getData('series', 'health');
  }, healthListSerieInterval.value * 1000);
};
watch(healthListSerieInterval, () => {
  if (!isNaN(healthListSerieInterval.value) && healthListSerieInterval.value > 0) {
    startHealthListSerieInterval();
  }
});

onMounted(() => {
  getData('movies', 'config/host');
  getData('movies', 'system/status');
  getData('movies', 'diskspace');
  getData('movies', 'log');
  getData('movies', 'health');

  getData('series', 'config/host');
  getData('series', 'system/status');
  getData('series', 'diskspace');
  getData('series', 'log');
  getData('series', 'health');

  startSystemStatusMovieInterval();
  startDiskListMovieInterval();
  startLogListMovieInterval();
  startHealthListMovieInterval();

  startSystemStatusSerieInterval();
  startDiskListSerieInterval();
  startLogListSerieInterval();
  startHealthListSerieInterval();
});

onUnmounted(() => {
  if (systemStatusMovieIntervalId) {
    clearInterval(systemStatusMovieIntervalId);
  }
  if (diskListMovieIntervalId) {
    clearInterval(diskListMovieIntervalId);
  }
  if (logListMovieIntervalId) {
    clearInterval(logListMovieIntervalId);
  }
  if (healthListMovieIntervalId) {
    clearInterval(logListMovieIntervalId);
  }

  if (systemStatusSerieIntervalId) {
    clearInterval(systemStatusSerieIntervalId);
  }
  if (diskListSerieIntervalId) {
    clearInterval(diskListSerieIntervalId);
  }
  if (logListSerieIntervalId) {
    clearInterval(logListSerieIntervalId);
  }
  if (healthListSerieIntervalId) {
    clearInterval(healthListSerieIntervalId);
  }
});
</script>

<template>
  <v-container>
    <v-row>
      <v-col>
        <h3>Radarr</h3>
        <v-row>
          <v-col>
            <v-card
              v-if="configHostMovie && Object.keys(configHostMovie).length > 0"
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
                  {{ configHostMovie.bindAddress }}
                </p>
                <p>
                  <strong>
                    Port:
                  </strong>
                  {{ configHostMovie.port }}
                </p>
                <p>
                  <strong>
                    Enable SSL:
                  </strong>
                  {{ configHostMovie.enableSsl }}
                </p>
                <p>
                  <strong>
                    Instance Name:
                  </strong>
                  {{ configHostMovie.instanceName }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="systemStatusMovie && Object.keys(systemStatusMovie).length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    System Status
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="systemStatusMovieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Version:
                  </strong>
                  {{ systemStatusMovie.version }}
                </p>
                <p>
                  <strong>
                    Debug:
                  </strong>
                  {{ systemStatusMovie.isDebug }}
                </p>
                <p>
                  <strong>
                    Production:
                  </strong>
                  {{ systemStatusMovie.isProduction }}
                </p>
                <p>
                  <strong>
                    Net Core:
                  </strong>
                  {{ systemStatusMovie.isNetCore }}
                </p>
                <p>
                  <strong>
                    Linux:
                  </strong>
                  {{ systemStatusMovie.isLinux }}
                </p>
                <p>
                  <strong>
                    MacOS:
                  </strong>
                  {{ systemStatusMovie.isOsx }}
                </p>
                <p>
                  <strong>
                    Windows:
                  </strong>
                  {{ systemStatusMovie.isWindows }}
                </p>
                <p>
                  <strong>
                    Docker:
                  </strong>
                  {{ systemStatusMovie.isDocker }}
                </p>
                <p>
                  <strong>
                    Mode:
                  </strong>
                  {{ systemStatusMovie.mode }}
                </p>
                <p>
                  <strong>
                    Branch:
                  </strong>
                  {{ systemStatusMovie.branch }}
                </p>
                <p>
                  <strong>
                    Uptime:
                  </strong>
                  {{ systemStatusMovie.uptime }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="diskListMovie.length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    Space
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="diskListMovieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
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
                    v-for="disk in diskListMovie"
                    :key="disk.path"
                    >
                    <td>{{ disk.path }}</td>
                    <td>{{ disk.free_space }}</td>
                    <td>{{ disk.total_space }}</td>
                    <td>
                      <v-progress-linear
                        :model-value="disk.ratio"
                        :color="progressColor(disk.ratio)"
                        height="25"
                        rounded
                        striped
                        >
                        <strong>
                          {{ Math.ceil(disk.ratio) }} %
                        </strong>
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
              v-if="logListMovie.length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    Log
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="logListMovieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Level</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="log in logListMovie"
                    :key="log.time"
                    >
                    <td>{{ log.time }}</td>
                    <td>{{ log.level }}</td>
                    <td>{{ log.message }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="healthListMovie.length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    About
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="healthListMovieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-list>
                <v-list-item
                  v-for="(issue, index) in healthListMovie"
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
              v-if="!isLoadingMovie &&
                    !diskListMovie.length &&
                    !healthListMovie.length &&
                    !configHostMovie &&
                    !systemStatusMovie"
              type="info"
              >
              No system information found
            </v-alert>
            <p
              v-if="isLoadingMovie"
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
              v-if="configHostSerie && Object.keys(configHostSerie).length > 0"
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
                  {{ configHostSerie.bindAddress }}
                </p>
                <p>
                  <strong>
                    Port:
                  </strong>
                  {{ configHostSerie.port }}
                </p>
                <p>
                  <strong>
                    Enable SSL:
                  </strong>
                  {{ configHostSerie.enableSsl }}
                </p>
                <p>
                  <strong>
                    Instance Name:
                  </strong>
                  {{ configHostSerie.instanceName }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="systemStatusSerie && Object.keys(systemStatusSerie).length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    System Status
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="systemStatusSerieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-card-text>
                <p>
                  <strong>
                    Version:
                  </strong>
                  {{ systemStatusSerie.version }}
                </p>
                <p>
                  <strong>
                    Debug:
                  </strong>
                  {{ systemStatusSerie.isDebug }}
                </p>
                <p>
                  <strong>
                    Production:
                  </strong>
                  {{ systemStatusSerie.isProduction }}
                </p>
                <p>
                  <strong>
                    Net Core:
                  </strong>
                  {{ systemStatusSerie.isNetCore }}
                </p>
                <p>
                  <strong>
                    Linux:
                  </strong>
                  {{ systemStatusSerie.isLinux }}
                </p>
                <p>
                  <strong>
                    MacOS:
                  </strong>
                  {{ systemStatusSerie.isOsx }}
                </p>
                <p>
                  <strong>
                    Windows:
                  </strong>
                  {{ systemStatusSerie.isWindows }}
                </p>
                <p>
                  <strong>
                    Docker:
                  </strong>
                  {{ systemStatusSerie.isDocker }}
                </p>
                <p>
                  <strong>
                    Mode:
                  </strong>
                  {{ systemStatusSerie.mode }}
                </p>
                <p>
                  <strong>
                    Branch:
                  </strong>
                  {{ systemStatusSerie.branch }}
                </p>
                <p>
                  <strong>
                    Uptime:
                  </strong>
                  {{ systemStatusSerie.uptime }}
                </p>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card
              v-if="diskListSerie.length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    Space
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="diskListSerieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
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
                    v-for="disk in diskListSerie"
                    :key="disk.path"
                    >
                    <td>{{ disk.path }}</td>
                    <td>{{ disk.free_space }}</td>
                    <td>{{ disk.total_space }}</td>
                    <td>
                      <v-progress-linear
                        :model-value="disk.ratio"
                        :color="progressColor(disk.ratio)"
                        height="25"
                        rounded
                        striped
                      >
                      <strong>
                        {{ Math.ceil(disk.ratio) }} %
                      </strong>
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
              v-if="logListSerie.length > 0"
              >
              <v-card-title>
                <v-row>
                  <v-col>
                    Log
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="logListSerieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Level</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="log in logListSerie"
                    :key="log.time"
                    >
                    <td>{{ log.time }}</td>
                    <td>{{ log.level }}</td>
                    <td>{{ log.message }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card v-if="healthListSerie.length > 0">
              <v-card-title>
                <v-row>
                  <v-col>
                    About
                  </v-col>
                  <v-col>
                    <v-text-field
                      label="Interval (Seconds)"
                      variant="outlined"
                      v-model="healthListSerieInterval"
                      type="number"
                      />
                  </v-col>
                </v-row>
              </v-card-title>
              <v-list>
                <v-list-item v-for="(issue, index) in healthListSerie" :key="index">
                  <v-list-item-title>{{ issue.message }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <a :href="issue.wikiUrl" target="_blank">More Info</a>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
            <v-alert
              v-if="!isLoadingSerie &&
                    !diskListSerie.length &&
                    !healthListSerie.length &&
                    !configHostSerie &&
                    !systemStatusSerie"
              type="info"
              >
              No system information found
            </v-alert>
            <p
              v-if="isLoadingSerie"
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
