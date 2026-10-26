import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: '../web-dist', emptyOutDir: true },
  server: { port: 5273, proxy: { '/api': 'http://127.0.0.1:3200' } },
});
