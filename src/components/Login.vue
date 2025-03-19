<script setup lang="ts">

import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';

const router = useRouter();

const { alert, resetAlert } = useAlert();

const { state: is_loading, reset: reset_is_loading } = useResettable(false);

const initial_auth_data = {
  username: null,
  password: null
};
const auth_data = ref(initial_auth_data);
const reset_auth_data = () => {
  auth_data.value = structuredClone(initial_auth_data);
};

function getData(key) {
  let base_url = import.meta.env.VITE_WEBDIS_URL;

  is_loading.value = true;

  if (auth_data.value.username && auth_data.value.password) {
    fetch(base_url + '/JSON.GET/' + key)
      .then(async (response) => {
        const json_data = await response.json();

        if (json_data && json_data['JSON.GET']) {
          const decrypted_password = CryptoJS.AES.decrypt(JSON.parse(json_data['JSON.GET']).password, import.meta.env.VITE_CRYPT_KEY);

          if (auth_data.value.username == JSON.parse(json_data['JSON.GET']).username &&
              auth_data.value.password == decrypted_password.toString(CryptoJS.enc.Utf8)) {
            localStorage.setItem('flix_webapp_is_authenticated', 'true');
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
        //reset_is_loading(); Not working
        is_loading.value = false;
      });
  } else {
    showErrorAlert('Username and password cannot be empty');
  }
}

function checkData(key) {
  let base_url = import.meta.env.VITE_WEBDIS_URL;

  fetch(base_url + '/JSON.GET/' + key)
    .then(async (response) => {
      const json_data = await response.json();

      if (json_data && json_data['JSON.GET']) {
        // reset_is_loading(); Not working
        is_loading.value = false;
      } else {
        localStorage.setItem('flix_webapp_is_authenticated', 'true');
        router.push('/dashboard');
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
    });
}

function showSuccessAlert(text = 'The operation was successful !') {
  alert.value = {
    visible: true,
    type: 'success',
    icon: 'mdi-check-circle',
    text: text
  };
  setTimeout(() => {
    resetAlert();
  }, 5000);
}

function showErrorAlert(text = 'An error has occurred !') {
  alert.value = {
    visible: true,
    type: 'error',
    icon: 'mdi-alert-circle',
    text: text
  };
  setTimeout(() => {
    resetAlert();
  }, 5000);
}

onMounted(() => {
  const is_authenticated = localStorage.getItem('flix_webapp_is_authenticated') === 'true';
  if (is_authenticated) {
    router.push('/dashboard');
  } else {
    checkData('auth');
  }
});
</script>

<template>
  <transition
    name="fade"
    @before-enter="beforeEnter"
    @enter="enter"
    @leave="leave"
    >
    <v-alert
      v-if="alert.visible"
      :type="alert.type"
      :icon="alert.icon"
      class="fixed-alert"
      :text="alert.text"
      @click="show_alert = false"
      />
  </transition>
  <v-container>
    <div
      v-if="!is_loading"
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
          @click="getData('auth')"
          >
          Sign In
        </v-btn>
      </div>
    </div>
    <p
      v-if="is_loading"
      justify="center"
      align="center"
      class="mt-4"
      >
      <v-progress-circular
        indeterminate
        color="primary"
        size="50"
        />
      <span
        class="ml-2"
        >
        Loading data...
      </span>
    </p>
  </v-container>
</template>

<style scoped>
.fixed-alert {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  max-width: 300px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
