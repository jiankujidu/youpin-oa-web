import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 由 VITE_BASE 注入：项目页用 '/<repo>/'，自定义域名用 '/'
// 这是 GitHub Pages 子路径部署的关键配置（见 README「GitHub Pages 部署步骤」）
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
  },
});
