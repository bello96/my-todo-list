import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { functionsPlugin } from './dev/vite-plugin-functions.js';

const REMOTE_API = process.env.DEV_API_TARGET || 'https://todo.dengjiabei.cn';
// 测试场景设 USE_LOCAL_FUNCTIONS=1 启用本地 functions（避免污染生产数据）
// 默认 dev 走 REMOTE_API proxy
const useLocalFunctions = process.env.USE_LOCAL_FUNCTIONS === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(useLocalFunctions
      ? [
          functionsPlugin({
            schemaFile: 'migrations/0001_init.sql',
            dbPath:
              process.env.FUNCTIONS_DB_PATH ||
              '.wrangler/state-test/dev.sqlite',
          }),
        ]
      : []),
  ],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          router: ['react-router-dom'],
          heroicons: ['@heroicons/react'],
          animation: ['framer-motion'],
          utils: ['dayjs'],
          'day-picker': ['react-day-picker'],
          toast: ['react-hot-toast'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '127.0.0.1',
    ...(useLocalFunctions
      ? {}
      : {
          proxy: {
            '/api': {
              target: REMOTE_API,
              changeOrigin: true,
              secure: true,
              cookieDomainRewrite: { '*': '' },
              configure: (proxy) => {
                proxy.on('proxyRes', (proxyRes) => {
                  const setCookie = proxyRes.headers['set-cookie'];
                  if (setCookie) {
                    proxyRes.headers['set-cookie'] = setCookie.map((c) =>
                      c.replace(/;\s*Secure/gi, '')
                    );
                  }
                });
              },
            },
          },
        }),
  },
});
