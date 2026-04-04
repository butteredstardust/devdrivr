import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import nodeStdlibBrowser from 'vite-plugin-node-stdlib-browser'
import { resolve } from 'path'

export default defineConfig({
  plugins: [nodeStdlibBrowser(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          monaco: ['@monaco-editor/react', 'monaco-editor'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
