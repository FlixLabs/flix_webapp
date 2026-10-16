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
const authenticationRead = useReadRequest(() => useAPI.value);

const auth_data = ref<{ username: string | null; password: string | null }>({
  username: null,
  password: null
});

async function getData() {
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
  const read = authenticationRead.begin();
  try {
    const response = await apiFetch(import.meta.env.VITE_FLIX_API_URL + '/session', { signal: read.signal, cache: 'no-store' });
    const data = requireObject<{ authenticated?: boolean }>(await readApiJson(response), 'session');
    if (!read.isCurrent()) return;
    read.success();
    if (data.authenticated === true) {
      sessionStorage.setItem('flix_webapp_is_authenticated', 'true');
      await router.replace(loginDestination(route.query.redirect));
    }
  } catch (error) { read.fail(error); }
  finally { read.finish(); }
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
      v-if="!isLoading"
      >
      <v-text-field
        :label="t('Username')"
        variant="outlined"
        v-model="auth_data.username"
        prepend-icon="mdi-form-textbox"
        clearable
        />
      <v-text-field
        :label="t('Password')"
        type="password"
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
      :isLoading="isLoading"
      :sentence="t('Loading data...')"
      />
  </v-container>
</template>
