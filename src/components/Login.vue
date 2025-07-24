<script setup lang="ts">

import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';
import Loading from '@/components/common/Loading.vue';

const router = useRouter();

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: isLoading, reset: resetIsLoading } = useResettable(false);

const initial_auth_data = {
  username: null,
  password: null
};
const auth_data = ref(initial_auth_data);
const reset_auth_data = () => {
  auth_data.value = structuredClone(initial_auth_data);
};

function getData() {
  let base_url = import.meta.env.VITE_FLIX_API_URL;

  isLoading.value = true;

  if (auth_data.value.username && auth_data.value.password) {
    fetch(base_url + '/auth')
      .then(async (response) => {
        const json_data = await response.json();

        if (json_data.username && json_data.password) {
          const decrypted_password = CryptoJS.AES.decrypt(json_data.password, import.meta.env.VITE_CRYPT_KEY);

          if (auth_data.value.username == json_data.username &&
              auth_data.value.password == decrypted_password.toString(CryptoJS.enc.Utf8)) {
            sessionStorage.setItem('flix_webapp_is_authenticated', 'true');
            router.push('/dashboard');
          } else {
            showErrorAlert('Wrong Username or Password');
          }
        }
      })
      .catch((error) => {
        showErrorAlert(error);
      })
      .finally(() => {
        //resetIsLoading(); Not working
        isLoading.value = false;
      });
  } else {
    isLoading.value = false;
    showErrorAlert('Username and password cannot be empty');
  }
}

function checkData() {
  let base_url = import.meta.env.VITE_FLIX_API_URL;

  fetch(base_url + '/auth')
    .then(async (response) => {
      const json_data = await response.json();

      if (json_data.username && json_data.password) {
        // resetIsLoading(); Not working
        isLoading.value = false;
      } else {
        sessionStorage.setItem('flix_webapp_is_authenticated', 'true');
        router.push('/dashboard');
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
    });
}

onMounted(() => {
  if (!useAPI.value) {
    router.push('/dashboard');
  } else {
    const is_authenticated = sessionStorage.getItem('flix_webapp_is_authenticated') === 'true';
    if (is_authenticated) {
      router.push('/dashboard');
    } else {
      checkData();
    }
  }
});
</script>

<template>
  <Alert
    :alert="alert"
    @update:alert="alert = $event"
    />
  <v-container>
    <div
      v-if="!isLoading"
      >
      <v-text-field
        label="Username"
        variant="outlined"
        v-model="auth_data.username"
        prepend-icon="mdi-form-textbox"
        clearable
        />
      <v-text-field
        label="Password"
        type="password"
        variant="outlined"
        v-model="auth_data.password"
        prepend-icon="mdi-form-textbox-password"
        clearable
        />
      <div class="d-flex justify-end">
        <v-btn
          color="primary"
          variant="outlined"
          @click="getData()"
          >
          Sign In
        </v-btn>
      </div>
    </div>
    <Loading
      :isLoading="isLoading"
      sentence="Loading data..."
      />
  </v-container>
</template>
