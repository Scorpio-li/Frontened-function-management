import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // 开发环境将 /api 转发到本地后端，避免跨域与额外 CORS 配置。
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // 工作区包直接以源码形式参与编译，保留 React Fast Refresh 能力。
  optimizeDeps: {
    exclude: [
      '@repo/core',
      '@repo/ui',
      '@repo/utils',
      '@repo/feature-activity',
      '@repo/feature-dashboard',
      '@repo/feature-demo',
      '@repo/feature-relationship',
      '@repo/feature-heatmap',
      '@repo/feature-annotation',
      '@repo/feature-pdf-export',
      '@repo/feature-infographic',
      '@repo/feature-guide',
      '@repo/feature-i18n-converter',
      '@repo/feature-mail',
    ],
  },
});
