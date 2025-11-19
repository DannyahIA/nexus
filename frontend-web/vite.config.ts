import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Expõe na rede local
    port: 3000,
    cors: true, // Habilita CORS para todas as origens
    // Proxy só funciona para localhost. Para rede, desabilitar proxy
    ...(!process.env.VITE_NETWORK_MODE && {
      proxy: {
        '/api': {
          target: 'https://nexus-api.eclipsiasoftware.com',
          changeOrigin: true,
        },
        '/ws': {
          target: 'wss://nexus-ws.eclipsiasoftware.com',
          ws: true,
        },
      },
    }),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
