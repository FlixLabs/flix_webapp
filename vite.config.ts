import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type ConfigEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default ({ mode, command, isPreview }: ConfigEnv) => {

  process.env = {...process.env, ...loadEnv(mode, process.cwd())};
  // API-mode bundles are also served to guests: never embed standalone service credentials.
  const privateServiceVariables = process.env.VITE_FLIX_API_USE === 'true'
    ? ['VITE_RADARR_BASE_URL', 'VITE_RADARR_API_KEY', 'VITE_RADARR_ROOT_FOLDER_PATH',
       'VITE_SONARR_BASE_URL', 'VITE_SONARR_API_KEY', 'VITE_SONARR_ROOT_FOLDER_PATH']
    : [];
  for (const key of privateServiceVariables) process.env[key] = '';
  const proxyFlixAPI = command === 'serve' && !isPreview
    && process.env.VITE_FLIX_API_USE === 'true' && !!process.env.VITE_FLIX_API_URL;

  return defineConfig({
    define: {
      ...Object.fromEntries(privateServiceVariables.map(key => [`import.meta.env.${key}`, JSON.stringify('')])),
      ...(proxyFlixAPI ? { 'import.meta.env.VITE_FLIX_API_URL': JSON.stringify('/flix-api') } : {}),
    },
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      port: 5173,
      proxy: proxyFlixAPI ? {
        '^/flix-api(?:/|$)': {
          target: process.env.VITE_FLIX_API_URL,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/flix-api/, ''),
        },
      } : {},
    },
    preview: {
      port: 5173,
      allowedHosts: true
    }
  })
}
