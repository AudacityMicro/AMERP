import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'node_modules/pdfjs-dist/wasm',
  server: {
    host: '127.0.0.1'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
