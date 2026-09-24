import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  
  return {
  root: '.',
  publicDir: 'client/public',
  plugins: [
    react({
      fastRefresh: true,
      babel: {
        plugins: [
          ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  build: {
    outDir: 'dist-client',
    rollupOptions: {
      input: './index.html'
    }
  },
  server: {
    port: parseInt(env.VITE_PORT || '3120'),
    https: false, // We'll use nginx for HTTPS
    allowedHosts: ['devlocal.capacinator.com', 'local.capacinator.com'],
    // The nginx HTTPS proxy HMR setup only exists in the developer's local
    // topology. Other environments (e2e webServer instances) must not try to
    // connect — the failed wss handshake surfaces as console errors in tests.
    hmr: process.env.VITE_E2E
      ? false
      : {
          overlay: true,
          clientPort: 443, // Tell HMR to use the nginx proxy
          protocol: 'wss',
          host: 'local.capacinator.com',
        },
    watch: {
      usePolling: true,
      interval: 100,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.env*'],
    },
    fs: {
      allow: ['.', '../'],
      deny: ['.git', '.env*', 'node_modules'],
    },
    cors: true,
    host: '0.0.0.0', // Allow external connections
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || '3110'}`,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
        onError: (err, req, res) => {
          console.warn('🔴 Vite proxy error:', err.message);
          console.log('🔄 Backend server might be restarting...');
        },
      },
    },
  },
  esbuild: {
    keepNames: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  }
})
