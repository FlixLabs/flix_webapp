<script setup lang="ts">
import { readApiJson, requireObject } from '@/composables/apiResponse';


import { computed, onMounted, watch, ref } from 'vue';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { useTheme } from 'vuetify'
import { DEFAULT_PRIMARY, DEFAULT_THEME_NAME, LIGHT_THEME_NAME, applyPrimary, saveTheme } from '@/theme/constants'
import Alert from '@/components/common/Alert.vue';
import SectionNavigation from '@/components/common/SectionNavigation.vue';
import { useFlixStore } from '@/stores/flixStore';

const theme = useTheme();
const store = useFlixStore();
const useAPI = import.meta.env.VITE_FLIX_API_USE === 'true';
const section = ref('appearance');
const sections = [
  { title: 'Appearance', value: 'appearance', icon: 'mdi-palette-outline' },
  ...(useAPI ? [{ title: 'Security', value: 'security', icon: 'mdi-shield-lock-outline' }] : []),
];
const themeMode = computed({
  get: () => theme.name.value,
  set: (name: string) => {
    theme.change(name);
    saveTheme(name);
  },
});
const themeModes = [
  { title: 'Dark', value: DEFAULT_THEME_NAME },
  { title: 'Light', value: LIGHT_THEME_NAME },
];

function applyPrimaryNow(hex: string) {
  applyPrimary(theme.themes.value, hex);
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
  primary: DEFAULT_PRIMARY
};
const { state: colorData, reset: resetColorData } = useResettable(initialColorData);

function getData(key: 'auth' | 'color') {
  const base_url = import.meta.env.VITE_FLIX_API_URL;

  isLoading.value = true;

  fetch(base_url + '/' + key)
    .then(async (response) => {
      const json_data: any = requireObject(await readApiJson(response), key);

      if (key == 'auth') {
        store.authenticationEnabled = !!(json_data.username && json_data.password);
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

        if (key == 'auth') store.authenticationEnabled = true;

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
        if (key == 'auth') store.authenticationEnabled = false;
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
  if (useAPI) {
    getData('auth');
    getData('color');
  }
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

    colorData.value.primary = DEFAULT_PRIMARY;
    applyPrimaryNow(DEFAULT_PRIMARY);
  }
});
</script>

<template>
  <Alert :alert="alert" @update:alert="alert = $event" />
  <v-container>
    <SectionNavigation v-if="useAPI" v-model="section" :sections="sections" />
    <v-row :class="{ 'mt-4': useAPI }">
      <v-col v-show="section === 'appearance'" cols="12">
        <h3>Appearance</h3>
        <v-card class="mt-4">
          <v-card-text>
            <v-select
              v-model="themeMode"
              :items="themeModes"
              label="Theme"
              prepend-icon="mdi-theme-light-dark"
              variant="outlined"
              hide-details
            />
            <p class="text-caption text-medium-emphasis mt-3">Saved in this browser and applied immediately.</p>
            <template v-if="useAPI">
              <v-divider class="my-4" />
              <v-switch
                v-model="color"
                label="Custom primary color"
                inset
                color="primary"
                hide-details
              />
              <template v-if="color">
                <div class="d-flex justify-center mt-4">
                  <v-color-picker v-model="colorData.primary" show-swatches />
                </div>
                <div class="d-flex justify-end ga-2 mt-4">
                  <v-btn variant="text" :disabled="isLoading" @click="color = false">Reset</v-btn>
                  <v-btn color="primary" variant="outlined" :disabled="isLoading" @click="setData('color')">Save</v-btn>
                </div>
              </template>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col v-if="useAPI" v-show="section === 'security'" cols="12">
        <h3>Security</h3>
        <v-card class="mt-4">
          <v-card-text>
            <v-switch
              v-model="auth"
              label="Basic authentication"
              inset
              color="primary"
              hide-details
            />
            <template v-if="auth">
              <v-text-field
                v-model="authData.username"
                label="Username"
                variant="outlined"
                prepend-icon="mdi-form-textbox"
                clearable
                class="mt-4"
              />
              <v-text-field
                v-model="authData.password"
                label="Password"
                type="password"
                variant="outlined"
                prepend-icon="mdi-form-textbox-password"
                clearable
              />
              <div class="d-flex justify-end">
                <v-btn color="primary" variant="outlined" @click="setData('auth')">Save</v-btn>
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
