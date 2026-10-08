import { defineConfig, mergeConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export default defineConfig(async env => {
  const root = resolve(process.env.FLIX_E2E_ROOT || '.');
  const { default: configure } = await import(pathToFileURL(resolve(root, 'vite.config.ts')).href);
  return mergeConfig(await configure(env), {
    root,
    server: { fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] } },
  });
});
