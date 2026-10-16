<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { t, interfaceLanguage, translatedChoices } from '@/i18n';
import { apiFetch } from '@/composables/apiSession';
const user = ref<{ name: string; email: string } | null>(null);
const error = ref('');
const loading = ref(true);
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await apiFetch(`${import.meta.env.VITE_FLIX_API_URL}/accounts/me`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Unable to load account.');
    user.value = await response.json();
  } catch { error.value = 'Unable to load account.'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <v-container>
    <v-progress-linear v-if="loading" indeterminate color="primary" :aria-label="t('Loading data...')" />
    <v-alert v-if="error" type="error" variant="tonal">{{ t(error) }} <v-btn variant="text" @click="load">{{ t('Retry') }}</v-btn></v-alert>
    <v-card v-if="user" class="mt-4">
      <v-card-title><h2 class="text-h6">{{ user.name }}</h2></v-card-title>
      <v-card-text>
      <p class="text-medium-emphasis mb-5">{{ user.email }}</p>
      <v-select v-model="interfaceLanguage" :label="t('Interface language')" :items="translatedChoices([{ title: 'English', value: 'en' }, { title: 'French', value: 'fr' }])" variant="outlined" hide-details />
      </v-card-text>
      <v-card-actions class="justify-end">
      <v-btn to="/requests" color="primary" variant="outlined" prepend-icon="mdi-movie-search-outline">{{ t('Requests') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>
