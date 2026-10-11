import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Preserve the browser's host so the API can enforce same-origin mutations,
  // including a phone opening the development server through its LAN address.
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false, ws: true } } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false, ws: true } } },
});
