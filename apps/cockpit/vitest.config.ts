import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node', // Use node environment and set up DOM manually
    globals: true,
    setupFiles: ['./src/tools/__tests__/test-setup.ts', './src/test-setup.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@monaco-editor/react': resolve(__dirname, './src/__mocks__/monaco-editor-react.tsx'),
      '@tauri-apps/api/webviewWindow': resolve(
        __dirname,
        './src/__mocks__/tauri-webview-window.ts'
      ),
      '@tauri-apps/plugin-sql': resolve(__dirname, './src/__mocks__/tauri-plugin-sql.ts'),
      // Add worker mocks
      '@/workers/typescript.worker?worker': resolve(__dirname, './src/__mocks__/worker.ts'),
      '@/workers/formatter.worker?worker': resolve(__dirname, './src/__mocks__/worker.ts'),
      '@/workers/refactoring.worker?worker': resolve(__dirname, './src/__mocks__/worker.ts'),
      '@/workers/diff.worker?worker': resolve(__dirname, './src/__mocks__/worker.ts'),
      '@/workers/xml.worker?worker': resolve(__dirname, './src/__mocks__/worker.ts'),
    },
  },
})
