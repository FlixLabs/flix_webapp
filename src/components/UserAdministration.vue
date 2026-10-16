<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { t, formatDate, translatedChoices, interfaceLanguage } from '@/i18n';
import { apiFetch } from '@/composables/apiSession';
type User = { id: string; name: string; email: string; disabled: boolean };
type Invitation = { id: string; email: string; delivery: string; revoked: boolean; expiresAt: number };
const users = ref<User[]>([]);
const invitations = ref<Invitation[]>([]);
const mailConfigured = ref(false);
const email = ref('');
const language = ref(interfaceLanguage.value);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const success = ref(false);
async function request(path = '', options: RequestInit = {}) {
  const response = await apiFetch(`${import.meta.env.VITE_FLIX_API_URL}/admin/accounts${path}`, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Unable to manage users.'); }
  return response.status === 204 ? null : response.json();
}
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await request();
    users.value = data.users;
    invitations.value = data.invitations;
    mailConfigured.value = data.mailConfigured;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to manage users.'; }
  finally { loading.value = false; }
}
async function change(path: string, method: string, body?: unknown) {
  if (busy.value) return;
  busy.value = true;
  success.value = false;
  error.value = '';
  try {
    await request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (path === '/invitations') { email.value = ''; success.value = true; }
    await load();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to manage users.'; }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <v-container>
    <div class="d-flex justify-end mb-4"><v-btn prepend-icon="mdi-refresh" variant="text" color="primary" :loading="loading" :disabled="busy" @click="load">{{ t('Refresh') }}</v-btn></div>
    <v-progress-linear v-if="loading" color="primary" indeterminate :aria-label="t('Loading data...')" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ t(error) }} <v-btn variant="text" :disabled="busy || loading" @click="load">{{ t('Retry') }}</v-btn></v-alert>
    <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ t('Invitation queued for delivery.') }}</v-alert>
    <v-card variant="outlined" class="pa-5 mb-5">
      <h2 class="text-h6 mb-3">{{ t('Invite a user') }}</h2>
      <p v-if="!loading && !error && !mailConfigured" class="text-medium-emphasis mb-4">{{ t('Configure Mailjet and the public Flix URL on the API first.') }}</p>
      <form class="invite-form" @submit.prevent="change('/invitations', 'POST', { email, language })">
        <v-text-field v-model="email" :label="t('Email')" type="email" autocomplete="email" required maxlength="254" variant="outlined" hide-details :disabled="busy || loading || !mailConfigured" />
        <v-select v-model="language" :items="translatedChoices([{ title: 'English', value: 'en' }, { title: 'French', value: 'fr' }])" :label="t('Invitation language')" variant="outlined" hide-details :disabled="busy || loading || !mailConfigured" />
        <v-btn type="submit" color="primary" variant="flat" :loading="busy" :disabled="loading || !mailConfigured || !email.trim()">{{ t('Send invitation') }}</v-btn>
      </form>
      <p class="text-caption text-medium-emphasis mt-3">{{ t('Invitations expire after 7 days and can only be used once.') }}</p>
    </v-card>
    <v-card variant="outlined" class="mb-5">
      <v-card-title>{{ t('Invitations') }}</v-card-title>
      <v-list>
        <v-list-item v-for="invite in invitations" :key="invite.id" :title="invite.email" :subtitle="formatDate(invite.expiresAt)">
          <template #append>
            <div class="d-flex align-center ga-2 flex-wrap justify-end">
              <v-chip size="small">{{ invite.revoked ? t('Revoked') : invite.expiresAt <= Date.now() ? t('Expired') : invite.delivery === 'sent' ? t('Sent') : invite.delivery === 'failed' ? t('Delivery failed') : t('Queued') }}</v-chip>
              <v-btn v-if="!invite.revoked && invite.expiresAt > Date.now()" size="small" variant="text" color="error" :disabled="busy" @click="change(`/invitations/${invite.id}`, 'DELETE')">{{ t('Revoke') }}</v-btn>
            </div>
          </template>
        </v-list-item>
        <v-list-item v-if="!loading && !invitations.length" :title="t('No invitations yet.')" />
      </v-list>
    </v-card>
    <v-card variant="outlined">
      <v-card-title>{{ t('Users') }}</v-card-title>
      <v-list>
        <v-list-item v-for="user in users" :key="user.id" :title="user.name" :subtitle="user.email">
          <template #append><v-btn size="small" variant="text" :color="user.disabled ? 'primary' : 'error'" :disabled="busy" @click="change(`/users/${user.id}`, 'PUT', { disabled: !user.disabled })">{{ user.disabled ? t('Enable access') : t('Revoke access') }}</v-btn></template>
        </v-list-item>
        <v-list-item v-if="!loading && !users.length" :title="t('No invited users yet.')" />
      </v-list>
    </v-card>
  </v-container>
</template>

<style scoped>
.invite-form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; gap: 16px; align-items: center; }
@media (max-width: 700px) { .invite-form { grid-template-columns: minmax(0, 1fr); } }
</style>
