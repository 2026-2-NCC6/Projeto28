import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isVercel = process.env.VERCEL === '1' || mode === 'vercel' || process.env.BUILD_TARGET === 'vercel';
  const isAndroid = mode === 'android' || process.env.BUILD_TARGET === 'android';
  const isCloudBundle = isVercel || isAndroid;

  if (isAndroid && !process.env.VITE_APP_MODE) {
    process.env.VITE_APP_MODE = 'android_cloud';
  }
  if (isVercel && !process.env.VITE_APP_MODE) {
    process.env.VITE_APP_MODE = 'web_demo';
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        },
        '/ws': {
          target: 'ws://127.0.0.1:3000',
          ws: true
        }
      }
    },
    build: {
      outDir: isCloudBundle ? 'dist' : '../server/public',
      emptyOutDir: true
    }
  };
});
