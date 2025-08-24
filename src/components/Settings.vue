<script setup lang="ts">

import { ref, onMounted, watch } from 'vue';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { useTheme } from 'vuetify'
import { DEFAULT_PRIMARY } from '@/theme/constants'
import Alert from '@/components/common/Alert.vue';
import colors from 'vuetify/util/colors'

const theme = useTheme();

function applyPrimaryNow(hex: string) {
  const name = theme.global.name.value
  const curr = theme.themes.value[name]

  theme.themes.value[name] = {
    ...curr,
    colors: {
      ...curr.colors,
      primary: hex,
    },
  }
}

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: isLoading, reset: resetIsLoading } = useResettable(false);

const { state: auth, reset: resetAuth } = useResettable(false);
const { state: color, reset: resetColor } = useResettable(false);

const initialAuthData: { username: string | null; password: string | null } = {
  username: null,
  password: null
};
const { state: authData, reset: resetAuthData } = useResettable(initialAuthData);

const initialColorData = {
  primary: '#EA9034'
};
const { state: colorData, reset: resetColorData } = useResettable(initialColorData);

function getData(key: 'auth' | 'color') {
  const base_url = import.meta.env.VITE_FLIX_API_URL;

  isLoading.value = true;

  fetch(base_url + '/' + key)
    .then(async (response) => {
      const json_data = await response.json();

      if (key == 'auth') {
        if (json_data.username && json_data.password) {
          authData.value = json_data;
          auth.value = true;
        }
      }

      if (key == 'color') {
        if (json_data.primary) {
          colorData.value = json_data;
          color.value = true;
        }
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsLoading();
    });
}

function setData(key: 'auth' | 'color') {
  const base_url = import.meta.env.VITE_FLIX_API_URL;
  let data = null;

  isLoading.value = true;

  if (key == 'auth') {
    if (authData.value.username && authData.value.password) {
      authData.value.password = CryptoJS.AES.encrypt(authData.value.password, import.meta.env.VITE_CRYPT_KEY).toString();
      data = authData.value;
    } else {
      showErrorAlert('Username and password cannot be empty');
      return;
    }
  }

  if (key == 'color') {
    if (colorData.value.primary) {
      data = colorData.value;
    } else {
      showErrorAlert('Primary cannot be empty');
      return;
    }
  }

  fetch(base_url + '/' + key, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify(data)
    })
    .then(async (response) => {
      if (response.ok) {
        showSuccessAlert();

        if (key == 'color') {
          applyPrimaryNow(colorData.value.primary || DEFAULT_PRIMARY);
        }
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsLoading();
    });
}

function deleteData(key: 'auth' | 'color') {
  const base_url = import.meta.env.VITE_FLIX_API_URL;

  isLoading.value = true;

  fetch(base_url + '/' + key, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8'
      }
    })
    .then(async (response) => {
      if (response.ok) {
        showSuccessAlert();
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsLoading();
    });
}

onMounted(() => {
  getData('auth');
  getData('color');
});

watch(auth, (newValue) => {
  if (!newValue) {
    deleteData('auth');

    authData.value.username = null;
    authData.value.password = null;
  }
});

watch(color, (newValue) => {
  if (!newValue) {
    deleteData('color');

    colorData.value.primary = '#EA9034';
    applyPrimaryNow(DEFAULT_PRIMARY);
  }
});
</script>

<template>
  <Alert
    :alert="alert"
    @update:alert="alert = $event"
    />
  <v-container>
    <v-row>
      <v-col>
        <h3>Authentification</h3>
        <v-row>
          <v-col>
            <v-card
              class="mt-4"
              >
              <v-card-title>
                <v-switch
                  label="Basic Authentification"
                  inset
                  v-model="auth"
                  :color="auth ? 'green-lighten-1' : 'gray'"
                  />
              </v-card-title>
              <v-card-text
                v-if="auth"
                >
                <v-text-field
                  label="Username"
                  variant="outlined"
                  v-model="authData.username"
                  prepend-icon="mdi-form-textbox"
                  clearable
                  />
                <v-text-field
                  label="Password"
                  type="password"
                  variant="outlined"
                  v-model="authData.password"
                  prepend-icon="mdi-form-textbox-password"
                  clearable
                  />
                <div
                  class="d-flex justify-end"
                  >
                  <v-btn
                    color="primary"
                    variant="outlined"
                    @click="setData('auth')"
                    >
                    Save
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <h3>Color</h3>
        <v-row>
          <v-col>
            <v-card
              class="mt-4"
              >
              <v-card-title>
                <v-switch
                  label="Primary color"
                  inset
                  v-model="color"
                  :color="color ? 'green-lighten-1' : 'gray'"
                  />
              </v-card-title>
              <v-card-text
                v-if="color"
                >
                <div
                  class="d-flex justify-center"
                  >
                  <v-color-picker
                    v-model="colorData.primary"
                    show-swatches
                    />
                </div>
                <div
                  class="d-flex justify-end"
                  >
                  <v-btn
                    color="primary"
                    variant="outlined"
                    @click="setData('color')"
                    >
                    Save
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>
