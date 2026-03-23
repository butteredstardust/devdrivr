import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock window.matchMedia for theme utilities (used by useMonacoTheme etc.)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Tauri APIs that tools may import indirectly
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 0, y: 0 }) }),
    outerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 1200, height: 800 }) }),
    scaleFactor: vi.fn().mockResolvedValue(1),
    onMoved: vi.fn().mockResolvedValue(() => {}),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}))

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class { constructor(public x: number, public y: number) {} },
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn().mockResolvedValue([]) }) },
}))

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

// Mock db module so store/hook tests don't hit real SQLite
vi.mock('@/lib/db', () => ({
  getDb: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn().mockResolvedValue([]) }),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  loadNotes: vi.fn().mockResolvedValue([]),
  saveNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
  loadSnippets: vi.fn().mockResolvedValue([]),
  saveSnippet: vi.fn().mockResolvedValue(undefined),
  deleteSnippet: vi.fn().mockResolvedValue(undefined),
  loadHistory: vi.fn().mockResolvedValue([]),
  addHistoryEntry: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}))

// Mock Monaco Editor — renders as textarea for testing
vi.mock('@monaco-editor/react', () => {
  const React = require('react')
  return {
    default: React.forwardRef(function MockEditor(
      props: { value?: string; onChange?: (v: string) => void; language?: string; options?: Record<string, unknown> },
      _ref: unknown
    ) {
      return React.createElement('textarea', {
        'data-testid': 'monaco-editor',
        'data-language': props.language,
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      })
    }),
    DiffEditor: function MockDiffEditor(props: { original?: string; modified?: string }) {
      const React = require('react')
      return React.createElement('div', { 'data-testid': 'monaco-diff' },
        React.createElement('textarea', { 'data-testid': 'monaco-diff-original', value: props.original ?? '', readOnly: true }),
        React.createElement('textarea', { 'data-testid': 'monaco-diff-modified', value: props.modified ?? '', readOnly: true })
      )
    },
    loader: {
      init: vi.fn().mockResolvedValue({
        editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
      }),
    },
  }
})

// Mock Vite ?worker imports — return no-op constructor
vi.mock('@/workers/diff.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/formatter.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/typescript.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/xml.worker?worker', () => ({ default: vi.fn() }))

// Mock useWorker hook — return proxy where any method resolves with empty string
vi.mock('@/hooks/useWorker', () => ({
  useWorker: () =>
    new Proxy({}, { get: () => vi.fn().mockResolvedValue('') }),
}))

// Mock mermaid for MermaidEditor and MarkdownEditor
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">mock</svg>' }),
    parse: vi.fn().mockResolvedValue(true),
  },
}))

// Mock diff2html for DiffViewer
vi.mock('diff2html', () => ({
  html: vi.fn().mockReturnValue('<div data-testid="diff-output">mock diff</div>'),
}))

// Mock htmlhint for HtmlValidator (dynamic import — vi.mock hoists and intercepts)
vi.mock('htmlhint', () => ({
  HTMLHint: { verify: vi.fn(() => []) },
}))

// Mock diff2html CSS import (bare CSS import from node_modules)
vi.mock('diff2html/bundles/css/diff2html.min.css', () => ({}))
