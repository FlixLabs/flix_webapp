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
import colors from 'vuetify/util/colors'
import { VFileUpload } from 'vuetify/labs/VFileUpload'

import { DEFAULT_THEME_NAME, DEFAULT_PRIMARY, isCustomPrimary } from '@/theme/constants'

const vuetify = createVuetify({
  components: {
    ...components,
    VFileUpload,
  },
  directives,
  theme: {
    defaultTheme: DEFAULT_THEME_NAME,
    themes: {
      [DEFAULT_THEME_NAME]: {
        dark: true,
        colors: {
          primary: DEFAULT_PRIMARY,
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
            vuetify.theme.themes.value[DEFAULT_THEME_NAME].colors.primary = primary
          }
        });
    }
  } catch {}
})()

app.mount('#app')
