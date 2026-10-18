import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served by the AgentTube Express app at /studio (see ../index.js).
// In dev, Vite serves the app and proxies the API to the running AgentTube server.
export default defineConfig({
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3457,
    proxy: {
      '/api': 'http://127.0.0.1:3456'
    }
  }
});
