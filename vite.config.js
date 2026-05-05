import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { functionsPlugin } from './dev/vite-plugin-functions.js';

export default defineConfig({
  plugins: [
    react(),
    functionsPlugin({
      schemaFile: 'migrations/0001_init.sql',
      dbPath: '.wrangler/state-test/dev.sqlite',
    }),
  ],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'antd': ['antd'],
          'antd-icons': ['@ant-design/icons'],
          'heroicons': ['@heroicons/react'],
          'animation': ['framer-motion'],
          'utils': ['dayjs'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '127.0.0.1',
  },
});
