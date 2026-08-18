import { defineConfig } from 'vite';

// Vite is the "dev server + build tool": it serves the game while we work on it,
// and packages it into plain files for the internet when we deploy.
export default defineConfig({
  server: {
    // `npm run dev:phone` uses this so the game is reachable from your phone
    // on the same wifi. Note: GPS will NOT work over plain wifi (see PLAYBOOK.md),
    // which is why we deploy to Vercel for real phone testing.
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Warn loudly if a bundle gets fat -- this game must load fast on mobile data.
    chunkSizeWarningLimit: 900,
  },
});
