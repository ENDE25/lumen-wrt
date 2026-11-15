import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Dev against a real router:  LUMEN_TARGET=http://192.168.25.10 npm run dev
// Dev without a router:       npm run dev:mock
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.LUMEN_TARGET ?? env.LUMEN_TARGET;
  return {
    base: './',
    plugins: [svelte()],
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 300,
    },
    server: {
      proxy: target
        ? { '/ubus': { target, changeOrigin: true } }
        : undefined,
    },
  };
});
