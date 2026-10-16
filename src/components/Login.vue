<script setup lang="ts">
import { t } from '@/i18n';
import { readApiJson, requireObject } from '@/composables/apiResponse';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from '@/components/common/ReadFeedback.vue';


import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loginDestination } from '@/composables/mediaLinks';
import { apiFetch, saveApiSession } from '@/composables/apiSession';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';
import Loading from '@/components/common/Loading.vue';

const router = useRouter();
const route = useRoute();

const useAPI = ref(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showErrorAlert } = useAlert();

const isLoading = ref(false);
const checkingSession = ref(true);
const requiresLogin = ref(false);
const authenticationRead = useReadRequest(() => useAPI.value);

const auth_data = ref<{ username: string | null; password: string | null }>({
  username: null,
  password: null
});

async function getData() {
  if (!requiresLogin.value || checkingSession.value || isLoading.value || authenticationRead.state.error) return;
  if (!auth_data.value.username || !auth_data.value.password) {
    showErrorAlert('Username and password cannot be empty'); return;
  }
  isLoading.value = true;
  try {
    const response = await apiFetch(import.meta.env.VITE_FLIX_API_URL + '/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth_data.value), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || data.authenticated !== true) throw new Error(data.error || 'Unable to sign in.');
    saveApiSession(data);
    sessionStorage.setItem('flix_webapp_is_authenticated', 'true');
    await router.replace(loginDestination(route.query.redirect));
  } catch (error) { showErrorAlert(error); }
  finally { isLoading.value = false; }
}

async function checkData() {
  checkingSession.value = true;
  requiresLogin.value = false;
  const read = authenticationRead.begin();
  try {
    const response = await apiFetch(import.meta.env.VITE_FLIX_API_URL + '/session', { signal: read.signal, cache: 'no-store' });
    const data = requireObject<{ authenticated?: boolean }>(await readApiJson(response), 'session');
    if (!read.isCurrent()) return;
    if (typeof data.authenticated !== 'boolean') throw new Error('Invalid sign-in session.');
    read.success();
    if (data.authenticated === true) {
      sessionStorage.setItem('flix_webapp_is_authenticated', 'true');
      await router.replace(loginDestination(route.query.redirect));
    } else requiresLogin.value = true;
  } catch (error) { read.fail(error); }
  finally { if (read.isCurrent()) checkingSession.value = false; read.finish(); }
}

onMounted(() => {
  if (!useAPI.value) router.replace(loginDestination(route.query.redirect));
  else checkData();
});
</script>

<template>
  <Alert
    :alert="alert"
    @update:alert="alert = $event"
    />
  <v-container>
    <ReadFeedback :state="authenticationRead.state" :label="t('Login configuration')" @retry="checkData" />
    <div
      v-if="requiresLogin && !checkingSession && !authenticationRead.state.loading && !authenticationRead.state.error && !isLoading"
      >
      <v-text-field
        :label="t('Username')"
        :hint="t('Invited users sign in with their email.')"
        persistent-hint
        autocomplete="username"
        variant="outlined"
        v-model="auth_data.username"
        prepend-icon="mdi-form-textbox"
        clearable
        />
      <v-text-field
        :label="t('Password')"
        type="password"
        autocomplete="current-password"
        variant="outlined"
        v-model="auth_data.password"
        prepend-icon="mdi-form-textbox-password"
        clearable
        />
      <div
        class="d-flex justify-end"
        >
        <v-btn
          color="primary"
          variant="outlined"
          @click="getData()"
          >{{ t("Sign In") }}</v-btn>
      </div>
    </div>
    <Loading
      :isLoading="isLoading || authenticationRead.state.loading || (checkingSession && !authenticationRead.state.error)"
      :sentence="t('Loading data...')"
      />
  </v-container>
</template>
