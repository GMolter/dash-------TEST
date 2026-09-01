import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localFullApp = process.env.OLIO_LOCAL_FULL_APP === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: localFullApp ? {
    proxy: {
      '/api': {
        target: 'https://olio.one',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: '',
      },
    },
  } : undefined,
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
