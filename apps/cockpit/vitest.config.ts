import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
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
    },
  },
})
