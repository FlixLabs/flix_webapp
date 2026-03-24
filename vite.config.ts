import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {

  process.env = {...process.env, ...loadEnv(mode, process.cwd())};
  const enableVueDevTools = process.env.VITE_ENABLE_VUE_DEVTOOLS === 'true'

  return defineConfig({
    plugins: [
      vue(),
      ...(enableVueDevTools ? [vueDevTools()] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      port: 5173,
      proxy: {

      }
    },
    preview: {
      port: 5173,
      allowedHosts: true
    }
  })
}
