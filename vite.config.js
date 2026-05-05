import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // 使用相对路径，解决静态托管部署时的资源加载问题
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React 相关库单独打包
          'react-vendor': ['react', 'react-dom'],
          // React Router
          'router': ['react-router-dom'],
          // Antd UI 库单独打包
          'antd': ['antd'],
          // Antd 图标单独打包
          'antd-icons': ['@ant-design/icons'],
          // Heroicons 图标单独打包
          'heroicons': ['@heroicons/react'],
          // 动画库
          'animation': ['framer-motion'],
          // 工具库
          'utils': ['dayjs', 'crypto-js'],
          // CloudBase SDK
          'cloudbase': ['@cloudbase/js-sdk'],
        },
      },
    },
    // 调整 chunk 大小警告限制到 1MB
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: "127.0.0.1", // 使用IP地址代替localhost
    proxy: {
      "/__auth": {
        target: "https://envId-appid.tcloudbaseapp.com/",
        changeOrigin: true,
      },
    },
    allowedHosts: true,
  },
});
