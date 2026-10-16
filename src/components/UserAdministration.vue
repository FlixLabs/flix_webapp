<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { t, formatDate, translatedChoices, interfaceLanguage } from '@/i18n';
import { accountsApi, parseAccounts, type AccountUser, type AccountInvitation } from '@/composables/accounts';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from './common/ReadFeedback.vue';
const users = ref<AccountUser[]>([]);
const invitations = ref<AccountInvitation[]>([]);
const mailConfigured = ref(false);
const email = ref('');
const language = ref(interfaceLanguage.value);
const read = useReadRequest(() => 'accounts');
const busy = ref(false);
const error = ref('');
const success = ref(false);
const blocked = computed(() => busy.value || read.state.loading || !!read.state.error || !read.state.hasData);
async function load() {
  const request = read.begin();
  try {
    const data = parseAccounts(await accountsApi('', { signal: request.signal }));
    if (!request.isCurrent()) return;
    users.value = data.users;
    invitations.value = data.invitations;
    mailConfigured.value = data.mailConfigured;
    request.success();
  } catch (cause) { request.fail(cause); }
  finally { request.finish(); }
}
async function change(path: string, method: string, body?: unknown) {
  if (blocked.value) return;
  busy.value = true;
  success.value = false;
  error.value = '';
  try {
    await accountsApi(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (path === '/invitations') { email.value = ''; success.value = true; }
    await load();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to manage users.'; }
  finally { busy.value = false; }
}
function invitationStatus(invite: AccountInvitation) {
  if (invite.revoked) return { label: 'Revoked', color: 'error' };
  if (invite.expiresAt <= Date.now()) return { label: 'Expired', color: 'warning' };
  if (invite.delivery === 'sent') return { label: 'Sent', color: 'success' };
  if (invite.delivery === 'failed') return { label: 'Delivery failed', color: 'error' };
  return { label: 'Queued', color: 'primary' };
}
onMounted(load);
</script>

<template>
  <v-container>
    <ReadFeedback :state="read.state" :label="t('Users')" :disabled="busy" @retry="load" />
    <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ t(error) }}</v-alert>
    <v-alert v-if="success" type="success" variant="tonal" class="mt-4">{{ t('Invitation queued for delivery.') }}</v-alert>
    <v-card class="mt-4">
      <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3">
        <span>{{ t('Invite a user') }}</span>
        <v-btn prepend-icon="mdi-refresh" variant="text" color="primary" :loading="read.state.loading" :disabled="busy" @click="load">{{ t('Refresh') }}</v-btn>
      </v-card-title>
      <v-card-text>
        <v-progress-linear v-if="read.state.loading && !read.state.hasData" color="primary" indeterminate :aria-label="t('Loading data...')" class="mb-4" />
        <p v-if="read.state.hasData && !mailConfigured" class="text-medium-emphasis mb-4">{{ t('Configure Mailjet and the public Flix URL on the API first.') }}</p>
        <form @submit.prevent="change('/invitations', 'POST', { email, language })">
          <v-row align="center">
            <v-col cols="12" md="6"><v-text-field v-model="email" :label="t('Email')" type="email" autocomplete="email" required maxlength="254" variant="outlined" hide-details :disabled="blocked || !mailConfigured" /></v-col>
            <v-col cols="12" sm="7" md="3"><v-select v-model="language" :items="translatedChoices([{ title: 'English', value: 'en' }, { title: 'French', value: 'fr' }])" :label="t('Invitation language')" variant="outlined" hide-details :disabled="blocked || !mailConfigured" /></v-col>
            <v-col cols="12" sm="5" md="3"><v-btn type="submit" color="primary" variant="outlined" prepend-icon="mdi-email-plus-outline" :loading="busy" :disabled="blocked || !mailConfigured || !email.trim()">{{ t('Send invitation') }}</v-btn></v-col>
          </v-row>
        </form>
        <p class="text-caption text-medium-emphasis mt-3">{{ t('Invitations expire after 7 days and can only be used once.') }}</p>
      </v-card-text>
    </v-card>
    <v-card class="mt-4">
      <v-card-title>{{ t('Invitations') }}</v-card-title>
      <v-card-text>
        <v-table v-if="invitations.length">
          <thead><tr><th>{{ t('Email') }}</th><th>{{ t('Status') }}</th><th>{{ t('Expires') }}</th><th><span class="d-sr-only">{{ t('Actions') }}</span></th></tr></thead>
          <tbody><tr v-for="invite in invitations" :key="invite.id">
            <td class="account-email">{{ invite.email }}</td>
            <td><v-chip size="small" variant="tonal" :color="invitationStatus(invite).color">{{ t(invitationStatus(invite).label) }}</v-chip></td>
            <td class="text-no-wrap">{{ formatDate(invite.expiresAt) }}</td>
            <td class="text-end"><v-btn v-if="!invite.revoked && invite.expiresAt > Date.now()" size="small" variant="text" color="error" :disabled="blocked" @click="change(`/invitations/${invite.id}`, 'DELETE')">{{ t('Revoke') }}</v-btn></td>
          </tr></tbody>
        </v-table>
        <p v-else-if="read.state.hasData" class="text-medium-emphasis py-4 text-center">{{ t('No invitations yet.') }}</p>
      </v-card-text>
    </v-card>
    <v-card class="mt-4">
      <v-card-title>{{ t('Users') }}</v-card-title>
      <v-card-text>
        <v-table v-if="users.length">
          <thead><tr><th>{{ t('Name') }}</th><th>{{ t('Email') }}</th><th><span class="d-sr-only">{{ t('Actions') }}</span></th></tr></thead>
          <tbody><tr v-for="user in users" :key="user.id">
            <td>{{ user.name }}</td><td class="account-email">{{ user.email }}</td>
            <td class="text-end"><v-btn size="small" variant="text" :color="user.disabled ? 'primary' : 'error'" :disabled="blocked" @click="change(`/users/${user.id}`, 'PUT', { disabled: !user.disabled })">{{ user.disabled ? t('Enable access') : t('Revoke access') }}</v-btn></td>
          </tr></tbody>
        </v-table>
        <p v-else-if="read.state.hasData" class="text-medium-emphasis py-4 text-center">{{ t('No invited users yet.') }}</p>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.account-email { overflow-wrap: anywhere; min-width: 180px; }
</style>
