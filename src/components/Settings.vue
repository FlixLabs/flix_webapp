<script setup lang="ts">

import { ref, onMounted, watch } from 'vue';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: isLoading, reset: resetIsLoading } = useResettable(false);

const { state: auth, reset: resetAuth } = useResettable(false);

const initialAuthData = {
  username: null,
  password: null
};
const { state: authData, reset: resetAuthData } = useResettable(initialAuthData);

function getData(key) {
  const base_url = import.meta.env.VITE_WEBDIS_URL;

  isLoading.value = true;

  fetch(base_url + '/JSON.GET/' + key)
    .then(async (response) => {
      const json_data = await response.json();

      if (json_data && json_data['JSON.GET']) {
        authData.value = JSON.parse(json_data['JSON.GET']);
        auth.value = true;
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      resetIsLoading();
    });
}

function setData(key) {
  const base_url = import.meta.env.VITE_WEBDIS_URL;

  isLoading.value = true;

  if (authData.value.username && authData.value.password) {
    authData.value.password = CryptoJS.AES.encrypt(authData.value.password, import.meta.env.VITE_CRYPT_KEY).toString();
    const json_encoded = encodeURIComponent(JSON.stringify(authData.value));

    fetch(base_url + '/JSON.SET/' + key + '/$/' + json_encoded)
      .then(async (response) => {
        const json_data = await response.json();

        if (json_data && json_data['JSON.SET'][0]) {
          showSuccessAlert();
        } else {
          showErrorAlert();
        }
      })
      .catch((error) => {
        showErrorAlert(error);
      })
      .finally(() => {
        resetIsLoading();
      });
  } else {
    showErrorAlert('Username and password cannot be empty');
  }
}

function deleteData(key) {
  const base_url = import.meta.env.VITE_WEBDIS_URL;

  isLoading.value = true;

  fetch(base_url + '/DEL/' + key)
    .then(async (response) => {
      const json_data = await response.json();
      if (json_data && json_data.DEL == 1) {
        showSuccessAlert();
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
  getData('auth');
});

watch(auth, (newValue) => {
  if (!newValue) {
    deleteData('auth');

    // resetAuthData(); Not working
    authData.value.username = null;
    authData.value.password = null;
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
    <v-row>
      <v-col>
        <h3>Authentification</h3>
        <v-row>
          <v-col>
            <v-card
              class="mt-4"
              >
              <v-card-title>
                <v-switch
                  label="Basic Authentification"
                  inset
                  v-model="auth"
                  :color="auth ? 'green-lighten-1' : 'gray'"
                  />
              </v-card-title>
              <v-card-text
                v-if="auth"
                >
                <v-text-field
                  label="Username"
                  variant="outlined"
                  v-model="authData.username"
                  prepend-icon="mdi-form-textbox"
                  clearable
                  />
                <v-text-field
                  label="Password"
                  type="password"
                  variant="outlined"
                  v-model="authData.password"
                  prepend-icon="mdi-form-textbox-password"
                  clearable
                  />
                <div class="d-flex justify-end">
                  <v-btn
                    color="primary"
                    variant="outlined"
                    @click="setData('auth')"
                    >
                    Save
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
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
