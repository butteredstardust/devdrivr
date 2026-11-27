import { configDefaults, defineConfig } from 'vitest/config'
import { resolve } from 'path'

const nodeTests = [
  'scripts/__tests__/*.test.ts',
  'src/lib/__tests__/{db.*,schemas.*,cn,domain-contract,format,log-*,lossless-json,migrations,resource-folders,settings-transfer,shortcut-label,tab-state-key,text-encoding,tokens,tool-state-merge,wiki-link-contract}.test.ts',
  'src/styles/__tests__/*.test.ts',
  'src/tools/__tests__/{api-import,api-request-contract,diff-api,hash-*,jwt-verify,notes-task-model,refactoring-toolkit,text-editor-transforms,timestamp-formats,wiki-links}.test.ts',
  'src/workers/__tests__/*.test.ts',
]

// Local nested worktrees are separate checkouts; running their tests here mixes results.
const exclude = [...configDefaults.exclude, '**/.kilo/**']

export default defineConfig({
  test: {
    exclude,
    environment: 'node',
    pool: 'threads',
    globals: true,
    css: false,
    projects: [
      { extends: true, test: { name: 'node', include: nodeTests } },
      {
        extends: true,
        test: {
          name: 'dom',
          exclude: [...exclude, ...nodeTests],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
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
        // Each of these runs the real worker logic (imported from the sibling *.api.ts
        // module) over the real RPC message shape, so formatter/diff/xml/typescript/
        // refactoring tool tests exercise real worker round-trips instead of no-oping.
        find: '@/workers/typescript.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/typescript-worker.ts'),
      },
      {
        find: '@/workers/formatter.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/formatter-worker.ts'),
      },
      {
        find: '@/workers/refactoring.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/refactoring-worker.ts'),
      },
      {
        find: '@/workers/diff.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/diff-worker.ts'),
      },
      {
        find: '@/workers/base64.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/base64-worker.ts'),
      },
      {
        find: '@/workers/css.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/css-worker.ts'),
      },
      {
        find: '@/workers/html.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/html-worker.ts'),
      },
      {
        find: '@/workers/xml.worker?worker',
        replacement: resolve(__dirname, './src/__mocks__/xml-worker.ts'),
      },
      {
        // Also before the bare '@': the real module imports `monaco-editor`, which reaches for
        // browser globals as it evaluates and takes 21 suites down with it under `node`.
        find: '@/lib/monaco-runtime',
        replacement: resolve(__dirname, './src/__mocks__/monaco-runtime.ts'),
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
