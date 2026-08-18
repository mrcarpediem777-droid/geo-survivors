import { defineConfig } from 'vite';

// Vite is the "dev server + build tool": it serves the game while we work on it,
// and packages it into plain files for the internet when we deploy.
export default defineConfig({
  server: {
    // `npm run dev:phone` uses this so the game is reachable from your phone
    // on the same wifi. Note: GPS will NOT work over plain wifi (see PLAYBOOK.md),
    // which is why we deploy to Vercel for real phone testing.
    port: 5173,

    // The same map mirror that `vercel.json` sets up on the live site, repeated
    // here so the dev server behaves identically. Without this, mirror mode
    // could only ever be tested by deploying, which is a terrible way to work.
    // KEEP THESE TWO FILES IN STEP.
    proxy: {
      '/maptiles-backup': {
        target: 'https://tiles.versatiles.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/maptiles-backup/, ''),
      },
      '/maptiles': {
        target: 'https://tiles.openfreemap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/maptiles/, ''),
      },
    },
  },
  // Bundle background workers as modern modules. MapLibre asks for its worker as
  // a module, so it has to be built as one.
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    // Warn loudly if a bundle gets fat -- this game must load fast on mobile data.
    chunkSizeWarningLimit: 900,
  },
});
