import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
        login: fileURLToPath(new URL('./login.html', import.meta.url)),
        'staff-login': fileURLToPath(new URL('./staff-login.html', import.meta.url)),
        track: fileURLToPath(new URL('./track.html', import.meta.url)),
        register: fileURLToPath(new URL('./register.html', import.meta.url)),
        customer: fileURLToPath(new URL('./customer.html', import.meta.url)),
      },
    },
  },
});
