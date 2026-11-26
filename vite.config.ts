import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    // Keep the two entry points independent for the standalone HTML build.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), slice: resolve(__dirname, 'slice.html') } },
  },
});
