<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { t } from '@/i18n';
import { saveApiSession } from '@/composables/apiSession';

const router = useRouter();
const token = ref('');
const name = ref('');
const password = ref('');
const busy = ref(false);
const error = ref('');
onMounted(() => {
  token.value = window.location.hash.slice(1);
  // Invitation secrets stay out of server logs, browser history, and referrers.
  window.history.replaceState(window.history.state, '', window.location.pathname);
});
async function accept() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await fetch(`${import.meta.env.VITE_FLIX_API_URL}/accounts/accept`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.value, name: name.value, password: password.value }), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to create account.');
    saveApiSession(data);
    await router.replace('/account');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to create account.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <v-container class="invitation-page">
    <v-card class="pa-6">
      <h1 class="text-h5 mb-3">{{ t('Welcome to Flix') }}</h1>
      <p class="text-medium-emphasis mb-6">{{ t('Create your account using your invitation.') }}</p>
      <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ t(error) }}</v-alert>
      <form @submit.prevent="accept">
        <v-text-field v-model="name" :label="t('Name')" autocomplete="name" maxlength="128" required variant="outlined" :disabled="busy" />
        <v-text-field v-model="password" :label="t('Password')" :hint="t('At least 12 characters')" persistent-hint autocomplete="new-password" type="password" minlength="12" maxlength="1024" required variant="outlined" :disabled="busy" />
        <div class="d-flex justify-end mt-5"><v-btn type="submit" color="primary" variant="outlined" :loading="busy" :disabled="!token || !name.trim() || password.length < 12">{{ t('Create account') }}</v-btn></div>
      </form>
    </v-card>
  </v-container>
</template>

<style scoped>
.invitation-page { max-width: 560px; }
</style>
