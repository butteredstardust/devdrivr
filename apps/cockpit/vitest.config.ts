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
    // Order matters: Vite picks the first matching alias, and the bare '@' entry matches
    // every '@/...' specifier. The worker mocks must therefore be listed before it.
    alias: [
      {
        // Runs the real evaluation instead of no-oping, so regex tester tests are meaningful.
        find: '@/workers/regex.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/regex-worker.ts'),
      },
      {
        find: /^@\/workers\/(typescript|formatter|refactoring|diff|xml)\.worker\?worker$/,
        replacement: resolve(__dirname, './src/__mocks__/worker.ts'),
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: '@monaco-editor/react',
        replacement: resolve(__dirname, './src/__mocks__/monaco-editor-react.tsx'),
      },
      {
        find: '@tauri-apps/api/webviewWindow',
        replacement: resolve(__dirname, './src/__mocks__/tauri-webview-window.ts'),
      },
      {
        find: '@tauri-apps/plugin-sql',
        replacement: resolve(__dirname, './src/__mocks__/tauri-plugin-sql.ts'),
      },
    ],
  },
})
