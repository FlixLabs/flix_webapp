//import './assets/main.css'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './assets/flix.css'

import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { createPinia } from 'pinia';
import App from './App.vue'
import router from './router'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

import { DEFAULT_THEME_NAME, LIGHT_THEME_NAME, DEFAULT_PRIMARY, isCustomPrimary, getSavedTheme, applyPrimary } from '@/theme/constants'

const vuetify = createVuetify({
  defaults: {
    VCard: { rounded: 'lg', elevation: 0, border: true },
    VBtn: { rounded: 'lg' },
    VBtnGroup: { VBtn: { rounded: 0 } },
    VTextField: { color: 'primary' },
    VSelect: { color: 'primary' },
  },
  components: {
    ...components,
  },
  directives,
  theme: {
    defaultTheme: getSavedTheme(),
    themes: {
      [DEFAULT_THEME_NAME]: {
        dark: true,
        colors: {
          primary: DEFAULT_PRIMARY,
          background: '#111315',
          surface: '#1B1E22',
          'surface-variant': '#30353B',
          'on-surface-variant': '#EEF0F2',
        }
      },
      [LIGHT_THEME_NAME]: {
        dark: false,
        colors: {
          primary: DEFAULT_PRIMARY,
          background: '#F5F6F8',
          surface: '#FFFFFF',
          'surface-variant': '#E5E8ED',
          'on-surface-variant': '#30353B',
        }
      }
    }
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi
    }
  }
})

const app = createApp(App)
const pinia = createPinia()

app.use(router)

app.use(vuetify)

app.use(pinia)

;(async () => {
  try {
    if (import.meta.env.VITE_FLIX_API_USE === 'true') {
      const base_url = import.meta.env.VITE_FLIX_API_URL;

      fetch(base_url + '/color')
        .then(async (response) => {
          const { primary } = await response.json()
          if (isCustomPrimary(primary)) {
            applyPrimary(vuetify.theme.themes.value, primary)
          }
        });
    }
  } catch {}
})()

app.mount('#app')
