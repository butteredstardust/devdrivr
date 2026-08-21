import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import nodeStdlibBrowser from 'vite-plugin-node-stdlib-browser'
import { resolve } from 'path'
import { tauriStubPlugin } from './scripts/vite-plugin-tauri-stub.js'
import { remoteUiPlugin } from './scripts/vite-plugin-remote-ui.js'

export default defineConfig({
  plugins: [tauriStubPlugin(), remoteUiPlugin(), nodeStdlibBrowser(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Never watch the Rust side. `tauri dev` compiles into src-tauri/target while this watcher
      // is crawling it; on Windows the watcher hits a half-written .dll and chokidar throws
      // EBUSY, killing the dev server mid-build. Windows holds exclusive locks on files open for
      // writing, so this is fatal there and merely wasteful on macOS/Linux.
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          monaco: ['@monaco-editor/react', 'monaco-editor'],
          zod: ['zod'],
          fuse: ['fuse.js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
