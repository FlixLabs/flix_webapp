<script setup lang="ts">

import { ref, onMounted, watch } from 'vue';
import CryptoJS from 'crypto-js';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';

const { alert, resetAlert } = useAlert();

const { state: is_loading, reset: reset_is_loading } = useResettable(false);

const initial_auth = false;
const auth = ref(initial_auth);
const reset_auth = () => {
  auth.value = structuredClone(initial_auth);
};

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

  fetch(base_url + '/JSON.GET/' + key)
    .then(async (response) => {
      const json_data = await response.json();

      if (json_data && json_data['JSON.GET']) {
        auth_data.value = JSON.parse(json_data['JSON.GET']);
        auth.value = true;
      }
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      reset_is_loading();
    });
}

function setData(key) {
  let base_url = import.meta.env.VITE_WEBDIS_URL;

  is_loading.value = true;

  if (auth_data.value.username && auth_data.value.password) {
    auth_data.value.password = CryptoJS.AES.encrypt(auth_data.value.password, import.meta.env.VITE_CRYPT_KEY).toString();
    const json_encoded = encodeURIComponent(JSON.stringify(auth_data.value));

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
        reset_is_loading();
      });
  } else {
    showErrorAlert('Username and password cannot be empty');
  }
}

function deleteData(key) {
  let base_url = import.meta.env.VITE_WEBDIS_URL;

  is_loading.value = true;

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
      reset_is_loading();
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
  getData('auth');
});

watch(auth, (newValue) => {
  if (!newValue) {
    deleteData('auth');

    // reset_auth_data(); Not working
    auth_data.value.username = null;
    auth_data.value.password = null;
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
