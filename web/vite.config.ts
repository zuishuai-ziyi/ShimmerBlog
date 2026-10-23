import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3010', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3010', changeOrigin: true },
    },
  },
});
