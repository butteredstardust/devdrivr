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
        // Monaco is deliberately *not* named here. A manual chunk claims the shared modules of
        // everything it contains, so listing it pulled modules the shell also uses (React's JSX
        // runtime among them) into the editor's chunk — which made the entry import that chunk
        // statically, and every cold start fetch and parse 4MB of editor whether or not the user
        // opened one. Left to Rollup, Monaco lands in a chunk shared by the lazy tool chunks that
        // import it and costs nothing until one of them is opened.
        manualChunks: {
          vendor: ['react', 'react-dom'],
          zod: ['zod'],
          fuse: ['fuse.js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
