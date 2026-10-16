<script setup lang="ts">
import { t, translatedChoices, interfaceLanguage, contentLanguage, region, regionCodes } from '@/i18n';
import { apiFetch, saveApiSession, clearApiSession } from '@/composables/apiSession';

import { readApiJson, requireObject } from '@/composables/apiResponse';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from '@/components/common/ReadFeedback.vue';


import { computed, onMounted, watch, ref } from 'vue';
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
  { title: 'Language and region', value: 'language', icon: 'mdi-translate' },
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
const interfaceLanguages = [{ title: 'English', value: 'en' }, { title: 'French', value: 'fr' }];
const contentLanguages = [...interfaceLanguages, { title: 'Original language', value: 'original' }];
const regions = computed(() => {
  const names = new Intl.DisplayNames([interfaceLanguage.value], { type: 'region' });
  return regionCodes.map(value => ({ title: names.of(value) || value, value })).sort((a, b) => a.title.localeCompare(b.title, interfaceLanguage.value));
});
const themeModes = [
  { title: 'Dark', value: DEFAULT_THEME_NAME },
  { title: 'Light', value: LIGHT_THEME_NAME },
];

function applyPrimaryNow(hex: string) {
  applyPrimary(theme.themes.value, hex);
}

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: isSaving, reset: resetIsSaving } = useResettable(false);
const reads = { auth: useReadRequest(() => useAPI), color: useReadRequest(() => useAPI) };
const isLoading = computed(() => isSaving.value || reads.auth.state.loading || reads.color.state.loading);
let hydrating = false;
function readOnly(key: 'auth' | 'color') { return !reads[key].state.hasData || !!reads[key].state.error || reads[key].state.loading || isSaving.value; }

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
  const read = reads[key].begin();
  const base_url = import.meta.env.VITE_FLIX_API_URL;
  return apiFetch(base_url + '/' + key, { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      const json_data: any = requireObject(await readApiJson(response), key);
      if (!read.isCurrent()) return;
      hydrating = true;
      try {

      if (key == 'auth') {
        store.authenticationEnabled = json_data.enabled === true;
        authData.value = json_data.enabled === true ? { username: json_data.username ?? null, password: null } : { ...initialAuthData };
        auth.value = json_data.enabled === true;
      }

      if (key == 'color') {
        colorData.value = json_data.primary ? json_data : { ...initialColorData };
        color.value = !!json_data.primary;
        applyPrimaryNow(colorData.value.primary);
      }
      } finally { hydrating = false; }
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

function setData(key: 'auth' | 'color') {
  if (!useAPI || readOnly(key)) return;
  const base_url = import.meta.env.VITE_FLIX_API_URL;
  let data = null;

  isSaving.value = true;

  if (key == 'auth') {
    if (authData.value.username && authData.value.password) {
      data = authData.value;
    } else {
      showErrorAlert('Username and password cannot be empty');
      resetIsSaving();
      return;
    }
  }

  if (key == 'color') {
    if (colorData.value.primary) {
      data = colorData.value;
    } else {
      showErrorAlert('Primary cannot be empty');
      resetIsSaving();
      return;
    }
  }

  apiFetch(base_url + '/' + key, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000)
    })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to confirm the settings change.');
      if (response.ok) {
        showSuccessAlert();

        if (key == 'auth') {
          saveApiSession(await response.json());
          authData.value.password = null;
          store.authenticationEnabled = true;
        }

        if (key == 'color') {
          applyPrimaryNow(colorData.value.primary || DEFAULT_PRIMARY);
        }
      }
    })
    .catch((error) => {
      reads[key].state.error = 'The result of the change could not be confirmed. Reload settings before trying again.';
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsSaving();
    });
}

function deleteData(key: 'auth' | 'color') {
  if (!useAPI || readOnly(key)) return;
  const base_url = import.meta.env.VITE_FLIX_API_URL;

  isSaving.value = true;

  apiFetch(base_url + '/' + key, {
      method: 'DELETE',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json;charset=utf-8'
      }
    })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to confirm the settings change.');
      if (response.ok) {
        showSuccessAlert();
        if (key == 'auth') { clearApiSession(); store.authenticationEnabled = false; }
      }
    })
    .catch((error) => {
      reads[key].state.error = 'The result of the change could not be confirmed. Reload settings before trying again.';
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsSaving();
    });
}

onMounted(() => {
  if (useAPI) {
    getData('auth');
    getData('color');
  }
});

watch(auth, (newValue) => {
  if (hydrating) return;
  if (!newValue) {
    deleteData('auth');

    authData.value.username = null;
    authData.value.password = null;
  }
}, { flush: 'sync' });

watch(color, (newValue) => {
  if (hydrating) return;
  if (!newValue) {
    deleteData('color');

    colorData.value.primary = DEFAULT_PRIMARY;
    applyPrimaryNow(DEFAULT_PRIMARY);
  }
}, { flush: 'sync' });
</script>

<template>
  <Alert :alert="alert" @update:alert="alert = $event" />
  <v-container>
    <SectionNavigation v-model="section" :sections="sections" />
    <ReadFeedback v-if="useAPI && section !== 'language'" :state="section === 'security' ? reads.auth.state : reads.color.state" :label="section === 'security' ? t('Authentication settings') : t('Color settings')" :disabled="isSaving" @retry="getData(section === 'security' ? 'auth' : 'color')" />
    <v-row :class="{ 'mt-4': useAPI }">
      <v-col v-show="section === 'language'" cols="12">
        <h3>{{ t('Language and region') }}</h3>
        <v-card class="mt-4"><v-card-text>
          <v-row>
            <v-col cols="12" md="6"><v-select v-model="interfaceLanguage" :items="translatedChoices(interfaceLanguages)" :label="t('Interface language')" variant="outlined" hide-details /></v-col>
            <v-col cols="12" md="6"><v-select v-model="contentLanguage" :items="translatedChoices(contentLanguages)" :label="t('Content language')" variant="outlined" hide-details /></v-col>
            <v-col cols="12"><v-autocomplete v-model="region" :items="regions" :label="t('Release region')" variant="outlined" hide-details /></v-col>
          </v-row>
          <p class="text-caption text-medium-emphasis mt-3">{{ t('Languages and region are saved in this browser. Media profiles and download preferences are never changed.') }}</p>
        </v-card-text></v-card>
      </v-col>
      <v-col v-show="section === 'appearance'" cols="12">
        <h3>{{ t("Appearance") }}</h3>
        <v-card class="mt-4">
          <v-card-text>
            <v-select
              v-model="themeMode"
              :items="translatedChoices(themeModes)"
              :label="t('Theme')"
              prepend-icon="mdi-theme-light-dark"
              variant="outlined"
              hide-details
            />
            <p class="text-caption text-medium-emphasis mt-3">{{ t("Saved in this browser and applied immediately.") }}</p>
            <template v-if="useAPI">
              <v-divider class="my-4" />
              <v-switch
                v-model="color"
                :label="t('Custom primary color')"
                :disabled="readOnly('color')"
                inset
                color="primary"
                hide-details
              />
              <template v-if="color">
                <div class="d-flex justify-center mt-4">
                  <v-color-picker v-model="colorData.primary" show-swatches />
                </div>
                <div class="d-flex justify-end ga-2 mt-4">
                  <v-btn variant="text" :disabled="readOnly('color')" @click="color = false">{{ t("Reset") }}</v-btn>
                  <v-btn color="primary" variant="outlined" :disabled="readOnly('color')" @click="setData('color')">{{ t("Save") }}</v-btn>
                </div>
              </template>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col v-if="useAPI" v-show="section === 'security'" cols="12">
        <h3>{{ t("Security") }}</h3>
        <v-card class="mt-4">
          <v-card-text>
            <v-switch
              v-model="auth"
              :label="t('Basic authentication')"
              :disabled="readOnly('auth')"
              inset
              color="primary"
              hide-details
            />
            <template v-if="auth">
              <v-text-field
                v-model="authData.username"
                :label="t('Username')"
                variant="outlined"
                prepend-icon="mdi-form-textbox"
                clearable
                class="mt-4"
              />
              <v-text-field
                v-model="authData.password"
                :label="t('Password')"
                type="password"
                variant="outlined"
                prepend-icon="mdi-form-textbox-password"
                clearable
              />
              <div class="d-flex justify-end">
                <v-btn color="primary" variant="outlined" :disabled="readOnly('auth')" @click="setData('auth')">{{ t("Save") }}</v-btn>
              </div>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
