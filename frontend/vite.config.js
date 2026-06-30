import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset URLs — the app is hosted under /app/ on Catalyst.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // Dev: strip the Catalyst function prefix so a local Express backend on
    // :3001 (mounted at /api, /auth) still answers.
    proxy: {
      '/server/skuapi': {
        target: 'http://localhost:3001',
        rewrite: (p) => p.replace(/^\/server\/skuapi/, ''),
      },
    },
  },
});
