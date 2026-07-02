import { defineConfig } from 'vite';

// Relative base so the built site works when served from any subpath
// (e.g. apps.charliekrug.com/big-o-playground/), not just the domain root.
// This app is servable, so the build output *is* the deployed page: it
// goes to site/, the directory the host publishes.
export default defineConfig({
  base: './',
  build: {
    outDir: 'site',
    emptyOutDir: true,
  },
});
