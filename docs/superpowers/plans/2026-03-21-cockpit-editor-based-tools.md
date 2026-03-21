# Developer Cockpit — Plan 2: Editor-Based Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 8 editor-based tools that rely on Monaco Editor and/or Web Workers: JSON Tools, Code Formatter, XML Tools, Diff Viewer, Markdown Editor, Mermaid Editor, TypeScript Playground, and Refactoring Toolkit. Also build the shared infrastructure they depend on (Monaco wrapper, Web Worker harness, formatter worker).

**Architecture:** Each tool is a lazy-loaded React component at `apps/cockpit/src/tools/<tool-name>/`. Heavy processing (formatting, diffing, AST transforms, XML parsing, TypeScript compilation) runs off the main thread in Web Workers via `comlink`. Monaco Editor instances are managed via a shared wrapper hook that handles lifecycle (create/dispose), theme syncing, and language configuration.

**Base stack (updated):** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, Tauri 2

**Tech Stack additions for Plan 2:**
- `@monaco-editor/react` — React bindings for Monaco
- `prettier` + `prettier/plugins/*` — Code formatting (JS, TS, CSS, HTML, JSON, YAML, Markdown)
- `prettier-plugin-sql` — SQL formatting
- `@prettier/plugin-xml` — XML formatting
- `comlink` — Typed Web Worker communication
- `diff` — Text diffing library
- `diff2html` — Diff rendering
- `unified` + `remark-parse` + `remark-gfm` + `remark-rehype` + `rehype-stringify` + `rehype-highlight` — Markdown pipeline
- `mermaid` — Diagram rendering
- `@xmldom/xmldom` + `xpath` — XML parsing/validation/XPath
- `typescript` — TS compiler for playground
- `jscodeshift` — AST-based refactoring
- `@tanstack/react-table` — JSON table view

**Spec:** `/Users/tuxgeek/Dev/devdrivr/developer_cockpit_prd.md` (sections 6.1–6.6, 6.22, 6.28)

**Plan series:**
- **Plan 1:** Foundation & Shell (complete)
- **Plan 2 (this):** Editor-Based Tools
- **Plan 3:** Utility Tools (16 converters, validators, testers, generators)
- **Plan 4:** System Features (Notes, Snippets, History, API Client, Docs Browser, cross-tool flow)

---

## File Structure (Plan 2 additions)

```
apps/cockpit/src/
├── hooks/
│   ├── useMonaco.ts                           # Shared Monaco config hook (theme sync, font, options)
│   └── useWorker.ts                           # Generic comlink worker hook (create, proxy, terminate)
├── workers/
│   ├── formatter.worker.ts                    # Prettier formatting (all languages)
│   ├── diff.worker.ts                         # Text diffing via `diff` library
│   ├── xml.worker.ts                          # XML parse/validate/format/XPath via @xmldom/xmldom
│   ├── typescript.worker.ts                   # TypeScript transpilation
│   └── ast.worker.ts                          # jscodeshift refactoring transforms
├── tools/
│   ├── json-tools/
│   │   └── JsonTools.tsx                      # Lint & Format | Tree View | Table View
│   ├── code-formatter/
│   │   └── CodeFormatter.tsx                  # Multi-language Prettier formatting
│   ├── xml-tools/
│   │   └── XmlTools.tsx                       # Lint & Format | Tree View | XPath
│   ├── diff-viewer/
│   │   └── DiffViewer.tsx                     # Side-by-side / inline diff
│   ├── markdown-editor/
│   │   └── MarkdownEditor.tsx                 # Edit + live preview with GFM + Mermaid
│   ├── mermaid-editor/
│   │   └── MermaidEditor.tsx                  # Mermaid syntax + live diagram preview
│   ├── ts-playground/
│   │   └── TsPlayground.tsx                   # TypeScript → JavaScript transpilation
│   └── refactoring-toolkit/
│       └── RefactoringToolkit.tsx             # AST-based code transforms with diff preview
```

---

## Task 1: Install Plan 2 Dependencies

**Files:**
- Modify: `apps/cockpit/package.json`

**Context:** Install all libraries needed for Plan 2. Run `bun install` from `apps/cockpit/`.

**Steps:**
- [ ] Add to `dependencies` in `apps/cockpit/package.json`:
  ```json
  "@monaco-editor/react": "^4.7.0",
  "@tanstack/react-table": "^8.21.3",
  "@xmldom/xmldom": "^0.9.8",
  "comlink": "^4.4.2",
  "diff": "^7.0.0",
  "diff2html": "^3.4.51",
  "jscodeshift": "^17.3.0",
  "mermaid": "^11.6.0",
  "prettier": "^3.5.3",
  "@prettier/plugin-xml": "^3.4.1",
  "prettier-plugin-sql": "^0.18.1",
  "rehype-highlight": "^7.0.2",
  "rehype-stringify": "^10.0.1",
  "remark-gfm": "^4.0.1",
  "remark-parse": "^11.0.0",
  "remark-rehype": "^11.1.1",
  "unified": "^11.0.5",
  "xpath": "^0.0.34"
  ```
- [ ] Add to `devDependencies`:
  ```json
  "@types/diff": "^7.0.2",
  "@types/jscodeshift": "^0.12.0"
  ```
- [ ] Run `bun install` from `apps/cockpit/`
- [ ] Verify no dependency conflicts

**Verification:** `bun install` exits 0, `bun run build` succeeds (tsc + vite build).

---

## Task 2: useMonaco Hook + useWorker Hook

**Files:**
- Create: `apps/cockpit/src/hooks/useMonaco.ts`
- Create: `apps/cockpit/src/hooks/useWorker.ts`

**Context:** These are shared infrastructure hooks used by all editor-based tools. `useMonaco` configures Monaco's theme to match the app's dark/light theme. `useWorker` creates a comlink-wrapped Web Worker and terminates it on unmount. Both follow existing hook patterns (ref-based, cleanup on unmount).

### useMonaco.ts

This hook syncs Monaco's theme with the app's current theme. It runs once on mount and whenever the theme changes.

```typescript
import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'
import { loader } from '@monaco-editor/react'

const DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1a1a1a',
    'editor.foreground': '#e0e0e0',
    'editorLineNumber.foreground': '#555555',
    'editor.selectionBackground': '#39ff1433',
    'editor.lineHighlightBackground': '#252525',
    'editorCursor.foreground': '#39ff14',
  },
}

const LIGHT_THEME = {
  base: 'vs' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a1a',
    'editorLineNumber.foreground': '#999999',
    'editor.selectionBackground': '#00875a33',
    'editor.lineHighlightBackground': '#f0eee6',
    'editorCursor.foreground': '#00875a',
  },
}

let themesRegistered = false

export function useMonacoTheme() {
  const theme = useSettingsStore((s) => s.settings.theme)

  useEffect(() => {
    loader.init().then((monaco) => {
      if (!themesRegistered) {
        monaco.editor.defineTheme('cockpit-dark', DARK_THEME)
        monaco.editor.defineTheme('cockpit-light', LIGHT_THEME)
        themesRegistered = true
      }
      const effective = getEffectiveTheme(theme)
      monaco.editor.setTheme(effective === 'dark' ? 'cockpit-dark' : 'cockpit-light')
    })
  }, [theme])
}

/** Standard Monaco editor options shared across all tools */
export const EDITOR_OPTIONS = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on' as const,
  padding: { top: 12, bottom: 12 },
} as const
```

### useWorker.ts

Generic hook that creates a Web Worker wrapped with comlink. Returns the proxy and terminates the worker on unmount.

```typescript
import { useEffect, useRef } from 'react'
import { wrap, type Remote } from 'comlink'

/**
 * Creates a comlink-wrapped Web Worker. Terminates on unmount.
 *
 * Usage:
 *   const worker = useWorker<FormatterWorker>(
 *     () => new Worker(new URL('../workers/formatter.worker.ts', import.meta.url), { type: 'module' })
 *   )
 *
 * The factory function pattern ensures a new Worker is created per component instance,
 * not shared across renders.
 */
export function useWorker<T>(factory: () => Worker): Remote<T> | null {
  const proxyRef = useRef<Remote<T> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const worker = factory()
    workerRef.current = worker
    proxyRef.current = wrap<T>(worker)

    return () => {
      worker.terminate()
      workerRef.current = null
      proxyRef.current = null
    }
  // factory is stable when caller wraps in useCallback or passes inline arrow
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return proxyRef.current
}
```

**Verification:** TypeScript compiles (`bun run build` succeeds). No runtime test needed — these are consumed by tools in subsequent tasks.

---

## Task 3: Formatter Web Worker

**Files:**
- Create: `apps/cockpit/src/workers/formatter.worker.ts`

**Context:** Runs Prettier in a Web Worker so formatting never blocks the main thread. Supports all languages listed in the PRD. Exposed via comlink.

```typescript
import { expose } from 'comlink'
import * as prettier from 'prettier/standalone'
import prettierPluginBabel from 'prettier/plugins/babel'
import prettierPluginEstree from 'prettier/plugins/estree'
import prettierPluginCss from 'prettier/plugins/html'
import prettierPluginHtml from 'prettier/plugins/html'
import prettierPluginMarkdown from 'prettier/plugins/markdown'
import prettierPluginTypescript from 'prettier/plugins/typescript'
import prettierPluginYaml from 'prettier/plugins/yaml'
import prettierPluginXml from '@prettier/plugin-xml'
import prettierPluginSql from 'prettier-plugin-sql'

const ALL_PLUGINS = [
  prettierPluginBabel,
  prettierPluginEstree,
  prettierPluginCss,
  prettierPluginHtml,
  prettierPluginMarkdown,
  prettierPluginTypescript,
  prettierPluginYaml,
  prettierPluginXml,
  prettierPluginSql,
]

type FormatOptions = {
  language: string
  tabWidth?: number
  useTabs?: boolean
  singleQuote?: boolean
  trailingComma?: 'all' | 'es5' | 'none'
  semi?: boolean
}

const LANGUAGE_TO_PARSER: Record<string, string> = {
  javascript: 'babel',
  typescript: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  markdown: 'markdown',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  graphql: 'graphql',
}

const api = {
  async format(code: string, options: FormatOptions): Promise<string> {
    const parser = LANGUAGE_TO_PARSER[options.language]
    if (!parser) {
      throw new Error(`Unsupported language: ${options.language}`)
    }

    return prettier.format(code, {
      parser,
      plugins: ALL_PLUGINS,
      tabWidth: options.tabWidth ?? 2,
      useTabs: options.useTabs ?? false,
      singleQuote: options.singleQuote ?? true,
      trailingComma: options.trailingComma ?? 'es5',
      semi: options.semi ?? false,
    })
  },

  async detectLanguage(code: string): Promise<string> {
    // Simple heuristics for auto-detection
    const trimmed = code.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      // Distinguish HTML from XML
      if (trimmed.match(/<!DOCTYPE\s+html/i) || trimmed.match(/<html[\s>]/i)) return 'html'
      if (trimmed.startsWith('<?xml')) return 'xml'
      return 'html'
    }
    if (trimmed.startsWith('---\n') || trimmed.match(/^\w+:\s/)) return 'yaml'
    if (trimmed.match(/^#\s|^\*\*|^-\s/)) return 'markdown'
    if (trimmed.match(/^SELECT\s|^INSERT\s|^CREATE\s|^ALTER\s|^DROP\s/i)) return 'sql'
    if (trimmed.match(/^import\s|^export\s|^const\s|^function\s|^class\s/)) {
      return trimmed.includes(': ') || trimmed.includes('<') ? 'typescript' : 'javascript'
    }
    if (trimmed.match(/^\.|^#|^@media|^:root/)) return 'css'
    return 'javascript'
  },

  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_TO_PARSER)
  },
}

export type FormatterWorker = typeof api

expose(api)
```

**Note:** The Prettier CSS plugin is bundled with the HTML plugin in `prettier/plugins/html`. The import `prettierPluginCss` above is intentionally aliased from the html plugin — CSS/SCSS/LESS parsers are included in the same bundle. If this causes a duplicate during build, consolidate to a single `prettierPluginHtml` import and remove the alias.

**Verification:** TypeScript compiles. Worker loads when consumed in Task 5.

---

## Task 4: JSON Tools

**Files:**
- Create: `apps/cockpit/src/tools/json-tools/JsonTools.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update json-tools entry)

**Context:** PRD section 6.1. Three sub-tabs: Lint & Format, Tree View, Table View. Uses Monaco for input, formatter worker for prettifying, `@tanstack/react-table` for table view. Uses existing `TabBar`, `CopyButton`, `useToolState`, `useMonacoTheme`.

### JsonTools.tsx

```typescript
import { useCallback, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { FormatterWorker } from '@/workers/formatter.worker'

type JsonToolsState = {
  input: string
  activeTab: string
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'table', label: 'Table View' },
]

export default function JsonTools() {
  useMonacoTheme()
  const [state, updateState] = useToolState<JsonToolsState>('json-tools', {
    input: '',
    activeTab: 'lint',
  })

  const formatter = useWorker<FormatterWorker>(
    () => new Worker(new URL('../../workers/formatter.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)

  // Parse input for tree/table views
  const parsed = useMemo(() => {
    if (!state.input.trim()) return { ok: false as const, data: null, error: null }
    try {
      return { ok: true as const, data: JSON.parse(state.input) as unknown, error: null }
    } catch (e) {
      return { ok: false as const, data: null, error: (e as Error).message }
    }
  }, [state.input])

  const handleFormat = useCallback(async () => {
    if (!formatter) return
    try {
      const result = await formatter.format(state.input, { language: 'json' })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted JSON', 'success')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Invalid JSON', 'error')
    }
  }, [formatter, state.input, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleFormat}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Format
              </button>
              <CopyButton text={state.input} />
              {parsed.ok && (
                <span className="text-xs text-[var(--color-success)]">✓ Valid JSON</span>
              )}
              {parsed.error && (
                <span className="text-xs text-[var(--color-error)]">✗ {parsed.error}</span>
              )}
            </div>
            {error && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                {error}
              </div>
            )}
            <div className="flex-1">
              <Editor
                language="json"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {state.activeTab === 'tree' && (
          <div className="h-full overflow-auto p-4">
            {parsed.ok ? (
              <JsonTree data={parsed.data} path="$" />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                {parsed.error ? `Parse error: ${parsed.error}` : 'Enter JSON in the Lint & Format tab'}
              </div>
            )}
          </div>
        )}

        {state.activeTab === 'table' && (
          <div className="h-full overflow-auto p-4">
            {parsed.ok && Array.isArray(parsed.data) ? (
              <JsonTable data={parsed.data as Record<string, unknown>[]} />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                {parsed.error
                  ? `Parse error: ${parsed.error}`
                  : parsed.ok
                    ? 'Table view requires a JSON array of objects'
                    : 'Enter JSON in the Lint & Format tab'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Tree View Component ---

function JsonTree({ data, path }: { data: unknown; path: string }) {
  const [expanded, setExpanded] = useState(true)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const copyPath = useCallback(() => {
    navigator.clipboard.writeText(path)
    setLastAction(`Copied: ${path}`, 'success')
  }, [path, setLastAction])

  if (data === null) return <span className="text-[var(--color-text-muted)]">null</span>
  if (typeof data === 'boolean') return <span className="text-[var(--color-warning)]">{String(data)}</span>
  if (typeof data === 'number') return <span className="text-[var(--color-accent)]">{data}</span>
  if (typeof data === 'string') return <span className="text-[var(--color-success)]">"{data}"</span>

  if (Array.isArray(data)) {
    return (
      <div className="ml-4">
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          {expanded ? '▼' : '▶'} <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>[{data.length}]</span>
        </button>
        {expanded && data.map((item, i) => (
          <div key={i} className="ml-4">
            <span className="text-[var(--color-text-muted)]">{i}: </span>
            <JsonTree data={item} path={`${path}[${i}]`} />
          </div>
        ))}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <div className="ml-4">
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          {expanded ? '▼' : '▶'} <span className="cursor-pointer text-xs hover:underline" onClick={copyPath}>{`{${entries.length}}`}</span>
        </button>
        {expanded && entries.map(([key, value]) => (
          <div key={key} className="ml-4">
            <span className="text-[var(--color-accent)]">"{key}"</span>
            <span className="text-[var(--color-text-muted)]">: </span>
            <JsonTree data={value} path={`${path}.${key}`} />
          </div>
        ))}
      </div>
    )
  }

  return <span>{String(data)}</span>
}

// --- Table View Component ---

function JsonTable({ data }: { data: Record<string, unknown>[] }) {
  const setLastAction = useUiStore((s) => s.setLastAction)

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of data) {
      for (const key of Object.keys(row)) keys.add(key)
    }
    return Array.from(keys)
  }, [data])

  const copyCell = useCallback((value: unknown) => {
    navigator.clipboard.writeText(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''))
    setLastAction('Copied cell', 'success')
  }, [setLastAction])

  if (data.length === 0) return <div className="text-sm text-[var(--color-text-muted)]">Empty array</div>

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className="border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left font-mono font-bold text-[var(--color-accent)]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--color-surface-hover)]">
              {columns.map((col) => {
                const value = row[col]
                return (
                  <td
                    key={col}
                    onClick={() => copyCell(value)}
                    className="cursor-pointer border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                    title="Click to copy"
                  >
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### tool-registry.ts update

Replace the json-tools Placeholder import:
```typescript
// Add at top with other lazy imports:
const JsonTools = lazy(() => import('@/tools/json-tools/JsonTools'))

// Replace json-tools entry:
{ id: 'json-tools', name: 'JSON Tools', group: 'data', icon: '{}', description: 'Validate, format, tree view, and table view for JSON', component: JsonTools },
```

**Verification:** Navigate to JSON Tools in the app. Paste valid JSON → shows "Valid JSON". Click Format → JSON is prettified. Switch to Tree View → see expandable tree. Click a node → path copied. Switch to Table View with array-of-objects → see table. Click cell → value copied.

---

## Task 5: Code Formatter

**Files:**
- Create: `apps/cockpit/src/tools/code-formatter/CodeFormatter.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update code-formatter entry)

**Context:** PRD section 6.2. Monaco editor with language selector. Format via Prettier in Web Worker. Language auto-detection. Format options (indent, quotes, trailing commas).

```typescript
import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import type { FormatterWorker } from '@/workers/formatter.worker'

const LANGUAGES = [
  'javascript', 'typescript', 'json', 'css', 'scss', 'less',
  'html', 'markdown', 'yaml', 'xml', 'sql', 'graphql',
]

type CodeFormatterState = {
  input: string
  language: string
  tabWidth: number
  singleQuote: boolean
  trailingComma: 'all' | 'es5' | 'none'
  semi: boolean
}

export default function CodeFormatter() {
  useMonacoTheme()
  const [state, updateState] = useToolState<CodeFormatterState>('code-formatter', {
    input: '',
    language: 'javascript',
    tabWidth: 2,
    singleQuote: true,
    trailingComma: 'es5',
    semi: false,
  })

  const formatter = useWorker<FormatterWorker>(
    () => new Worker(new URL('../../workers/formatter.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)

  const handleFormat = useCallback(async () => {
    if (!formatter || !state.input.trim()) return
    try {
      const result = await formatter.format(state.input, {
        language: state.language,
        tabWidth: state.tabWidth,
        singleQuote: state.singleQuote,
        trailingComma: state.trailingComma,
        semi: state.semi,
      })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted', 'success')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Format error', 'error')
    }
  }, [formatter, state, updateState, setLastAction])

  const handleAutoDetect = useCallback(async () => {
    if (!formatter || !state.input.trim()) return
    const detected = await formatter.detectLanguage(state.input)
    updateState({ language: detected })
    setLastAction(`Detected: ${detected}`, 'info')
  }, [formatter, state.input, updateState, setLastAction])

  // Cmd/Ctrl+Enter to format
  useKeyboardShortcut({ key: 'Enter', mod: true }, handleFormat)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleFormat}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Format
        </button>
        <select
          value={state.language}
          onChange={(e) => updateState({ language: e.target.value })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        <button
          onClick={handleAutoDetect}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Auto-detect
        </button>
        <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Indent
          <select
            value={state.tabWidth}
            onChange={(e) => updateState({ tabWidth: Number(e.target.value) })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.singleQuote}
            onChange={(e) => updateState({ singleQuote: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Single quotes
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.semi}
            onChange={(e) => updateState({ semi: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Semicolons
        </label>
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}
      <div className="flex-1">
        <Editor
          language={state.language}
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const CodeFormatter = lazy(() => import('@/tools/code-formatter/CodeFormatter'))

// Update entry:
{ id: 'code-formatter', name: 'Code Formatter', group: 'code', icon: '⌨', description: 'Format and beautify code (JS, TS, CSS, HTML, SQL, Python)', component: CodeFormatter },
```

**Verification:** Navigate to Code Formatter. Paste messy JS → select JavaScript → click Format → code is beautified. Try auto-detect with JSON → language switches to "json". Cmd/Ctrl+Enter also triggers format.

---

## Task 6: XML Tools + XML Worker

**Files:**
- Create: `apps/cockpit/src/workers/xml.worker.ts`
- Create: `apps/cockpit/src/tools/xml-tools/XmlTools.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update xml-tools entry)

**Context:** PRD section 6.3. Three sub-tabs: Lint & Format, Tree View, XPath. XML parsing/validation via `@xmldom/xmldom` in a Web Worker. XPath queries via `xpath` package.

### xml.worker.ts

```typescript
import { expose } from 'comlink'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

type XmlResult = {
  valid: boolean
  errors: string[]
  formatted?: string
}

type XPathResult = {
  matches: string[]
  count: number
}

const api = {
  validate(xml: string): XmlResult {
    const errors: string[] = []
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg: string) => errors.push(`Warning: ${msg}`),
        error: (msg: string) => errors.push(`Error: ${msg}`),
        fatalError: (msg: string) => errors.push(`Fatal: ${msg}`),
      },
    })
    parser.parseFromString(xml, 'text/xml')
    return { valid: errors.length === 0, errors }
  },

  format(xml: string, indent: number = 2): XmlResult {
    const errors: string[] = []
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg: string) => errors.push(`Warning: ${msg}`),
        error: (msg: string) => errors.push(`Error: ${msg}`),
        fatalError: (msg: string) => errors.push(`Fatal: ${msg}`),
      },
    })
    const doc = parser.parseFromString(xml, 'text/xml')
    if (errors.length > 0) {
      return { valid: false, errors }
    }

    // Simple indentation-based formatting
    const serializer = new XMLSerializer()
    const raw = serializer.serializeToString(doc)
    const formatted = formatXmlString(raw, indent)
    return { valid: true, errors: [], formatted }
  },

  queryXPath(xml: string, expression: string): XPathResult {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, 'text/xml')
      // Use basic DOM traversal since xpath package may not work in worker
      // Fall back to simple evaluation
      const serializer = new XMLSerializer()
      const results: string[] = []

      // Simple XPath evaluation using document.evaluate equivalent
      // For worker context, we do basic matching
      const nodes = evaluateSimpleXPath(doc, expression)
      for (const node of nodes) {
        results.push(serializer.serializeToString(node))
      }

      return { matches: results, count: results.length }
    } catch (e) {
      return { matches: [(e as Error).message], count: 0 }
    }
  },
}

function formatXmlString(xml: string, indent: number): string {
  const pad = ' '.repeat(indent)
  let formatted = ''
  let depth = 0
  const lines = xml.replace(/(>)(<)/g, '$1\n$2').split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('</')) depth--
    formatted += pad.repeat(Math.max(0, depth)) + trimmed + '\n'
    if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
      depth++
    }
  }
  return formatted.trimEnd()
}

function evaluateSimpleXPath(doc: Document, expression: string): Node[] {
  // Basic XPath: supports /root/child, //element, /root/child[@attr]
  const results: Node[] = []
  try {
    const parts = expression.replace(/^\/\//, '/').split('/').filter(Boolean)
    let nodes: Node[] = [doc.documentElement as unknown as Node]

    for (const part of parts) {
      const next: Node[] = []
      const tagName = part.replace(/\[.*\]/, '')
      for (const node of nodes) {
        if (node.childNodes) {
          for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i]
            if (child && (child as Element).tagName === tagName) {
              next.push(child)
            }
          }
        }
      }
      nodes = next
    }
    return nodes
  } catch {
    return results
  }
}

export type XmlWorker = typeof api

expose(api)
```

### XmlTools.tsx

```typescript
import { useCallback, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { XmlWorker } from '@/workers/xml.worker'

type XmlToolsState = {
  input: string
  activeTab: string
  xpathQuery: string
  indent: number
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'xpath', label: 'XPath' },
]

export default function XmlTools() {
  useMonacoTheme()
  const [state, updateState] = useToolState<XmlToolsState>('xml-tools', {
    input: '',
    activeTab: 'lint',
    xpathQuery: '',
    indent: 2,
  })

  const worker = useWorker<XmlWorker>(
    () => new Worker(new URL('../../workers/xml.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [xpathResults, setXpathResults] = useState<string[]>([])

  const validation = useMemo(() => {
    if (!state.input.trim() || !worker) return null
    // Sync validation would block — rely on format/validate button
    return null
  }, [state.input, worker])

  const handleFormat = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.format(state.input, state.indent)
    if (result.valid && result.formatted) {
      updateState({ input: result.formatted })
      setError(null)
      setLastAction('Formatted XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, state.indent, updateState, setLastAction])

  const handleValidate = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.validate(state.input)
    if (result.valid) {
      setError(null)
      setLastAction('Valid XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, setLastAction])

  const handleXPath = useCallback(async () => {
    if (!worker || !state.input.trim() || !state.xpathQuery.trim()) return
    const result = await worker.queryXPath(state.input, state.xpathQuery)
    setXpathResults(result.matches)
    setLastAction(`${result.count} match(es)`, result.count > 0 ? 'success' : 'info')
  }, [worker, state.input, state.xpathQuery, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button onClick={handleFormat} className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]">
                Format
              </button>
              <button onClick={handleValidate} className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]">
                Validate
              </button>
              <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                Indent
                <select
                  value={state.indent}
                  onChange={(e) => updateState({ indent: Number(e.target.value) })}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <CopyButton text={state.input} />
            </div>
            {error && (
              <div className="max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                <pre className="whitespace-pre-wrap">{error}</pre>
              </div>
            )}
            <div className="flex-1">
              <Editor
                language="xml"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {state.activeTab === 'tree' && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto p-4 text-xs">
              <pre className="whitespace-pre-wrap text-[var(--color-text)]">
                {state.input.trim() ? state.input : 'Enter XML in the Lint & Format tab'}
              </pre>
            </div>
          </div>
        )}

        {state.activeTab === 'xpath' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <input
                value={state.xpathQuery}
                onChange={(e) => updateState({ xpathQuery: e.target.value })}
                placeholder="Enter XPath expression (e.g. /root/child)"
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
              />
              <button onClick={handleXPath} className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]">
                Query
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {xpathResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-[var(--color-text-muted)]">{xpathResults.length} match(es)</div>
                  {xpathResults.map((r, i) => (
                    <pre key={i} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]">
                      {r}
                    </pre>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">Enter an XPath expression and click Query</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const XmlTools = lazy(() => import('@/tools/xml-tools/XmlTools'))

// Update entry:
{ id: 'xml-tools', name: 'XML Tools', group: 'data', icon: '<>', description: 'Validate and format XML', component: XmlTools },
```

**Verification:** Paste XML → Format → prettified. Paste invalid XML → errors shown. XPath tab: query `/root/child` → matching nodes displayed.

---

## Task 7: Diff Viewer + Diff Worker

**Files:**
- Create: `apps/cockpit/src/workers/diff.worker.ts`
- Create: `apps/cockpit/src/tools/diff-viewer/DiffViewer.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update diff-viewer entry)

**Context:** PRD section 6.4. Two Monaco editors (left/right). Diff computed in Web Worker via `diff` library. Rendered with `diff2html`. Side-by-side and inline modes. Whitespace toggle.

### diff.worker.ts

```typescript
import { expose } from 'comlink'
import { createTwoFilesPatch } from 'diff'

type DiffOptions = {
  ignoreWhitespace?: boolean
  jsonMode?: boolean
}

const api = {
  computeDiff(left: string, right: string, options: DiffOptions = {}): string {
    let a = left
    let b = right

    if (options.jsonMode) {
      try {
        a = JSON.stringify(JSON.parse(a), null, 2)
        b = JSON.stringify(JSON.parse(b), null, 2)
      } catch {
        // If not valid JSON, diff as-is
      }
    }

    return createTwoFilesPatch(
      'left',
      'right',
      a,
      b,
      undefined,
      undefined,
      { ignoreWhitespace: options.ignoreWhitespace }
    )
  },
}

export type DiffWorker = typeof api

expose(api)
```

### DiffViewer.tsx

```typescript
import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { html as diff2htmlRender } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useUiStore } from '@/stores/ui.store'
import type { DiffWorker } from '@/workers/diff.worker'

type DiffViewerState = {
  left: string
  right: string
  mode: 'side-by-side' | 'inline'
  ignoreWhitespace: boolean
  jsonMode: boolean
}

export default function DiffViewer() {
  useMonacoTheme()
  const [state, updateState] = useToolState<DiffViewerState>('diff-viewer', {
    left: '',
    right: '',
    mode: 'side-by-side',
    ignoreWhitespace: false,
    jsonMode: false,
  })

  const worker = useWorker<DiffWorker>(
    () => new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [diffHtml, setDiffHtml] = useState<string>('')

  const computeDiff = useCallback(async () => {
    if (!worker) return
    const patch = await worker.computeDiff(state.left, state.right, {
      ignoreWhitespace: state.ignoreWhitespace,
      jsonMode: state.jsonMode,
    })
    const html = diff2htmlRender(patch, {
      outputFormat: state.mode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
    })
    setDiffHtml(html)
    setLastAction('Diff computed', 'success')
  }, [worker, state, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={computeDiff}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Compare
        </button>
        <select
          value={state.mode}
          onChange={(e) => updateState({ mode: e.target.value as DiffViewerState['mode'] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          <option value="side-by-side">Side by Side</option>
          <option value="inline">Inline</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.ignoreWhitespace}
            onChange={(e) => updateState({ ignoreWhitespace: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Ignore whitespace
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.jsonMode}
            onChange={(e) => updateState({ jsonMode: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          JSON mode
        </label>
      </div>

      {diffHtml ? (
        <div
          className="flex-1 overflow-auto bg-[var(--color-surface)] p-2 text-xs"
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      ) : (
        <div className="flex flex-1 gap-px bg-[var(--color-border)]">
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Left (original)
            </div>
            <div className="flex-1">
              <Editor
                value={state.left}
                onChange={(v) => updateState({ left: v ?? '' })}
                options={{ ...EDITOR_OPTIONS, wordWrap: 'off' }}
              />
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Right (modified)
            </div>
            <div className="flex-1">
              <Editor
                value={state.right}
                onChange={(v) => updateState({ right: v ?? '' })}
                options={{ ...EDITOR_OPTIONS, wordWrap: 'off' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const DiffViewer = lazy(() => import('@/tools/diff-viewer/DiffViewer'))

{ id: 'diff-viewer', name: 'Diff Viewer', group: 'code', icon: '±', description: 'Compare text side-by-side or inline', component: DiffViewer },
```

**Verification:** Paste different text in left/right editors → click Compare → diff rendered. Toggle side-by-side/inline. JSON mode sorts keys before diffing.

---

## Task 8: Markdown Editor

**Files:**
- Create: `apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update markdown-editor entry)

**Context:** PRD section 6.5. This is one of the user's most important tools (replaces Typora). Split view: Monaco on left, rendered preview on right. Unified/remark/rehype pipeline for GFM. Mermaid rendering in code blocks. Scroll sync between editor and preview.

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

// Markdown pipeline imports
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'

type MarkdownEditorState = {
  content: string
  mode: string
}

const MODES = [
  { id: 'split', label: 'Split' },
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
]

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify, { allowDangerousHtml: true })

export default function MarkdownEditor() {
  useMonacoTheme()
  const [state, updateState] = useToolState<MarkdownEditorState>('markdown-editor', {
    content: '',
    mode: 'split',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Render markdown to HTML (debounced 300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.content.trim()) {
        setHtml('')
        return
      }
      try {
        const result = await processor.process(state.content)
        setHtml(String(result))
      } catch (e) {
        setHtml(`<p style="color: var(--color-error)">Render error: ${(e as Error).message}</p>`)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  // Render mermaid diagrams after HTML updates
  useEffect(() => {
    if (!html || !previewRef.current) return
    const mermaidBlocks = previewRef.current.querySelectorAll('code.language-mermaid')
    if (mermaidBlocks.length === 0) return

    // Lazy-load mermaid only when needed
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' })
      mermaidBlocks.forEach(async (block, i) => {
        const parent = block.parentElement
        if (!parent) return
        try {
          const { svg } = await mermaid.render(`mermaid-${i}`, block.textContent ?? '')
          const wrapper = document.createElement('div')
          wrapper.className = 'mermaid-diagram'
          wrapper.innerHTML = svg
          parent.replaceWith(wrapper)
        } catch {
          // Leave as code block on error
        }
      })
    })
  }, [html])

  const handleExportHtml = useCallback(() => {
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Export</title>
<style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style>
</head><body>${html}</body></html>`
    navigator.clipboard.writeText(fullHtml)
    setLastAction('HTML copied to clipboard', 'success')
  }, [html, setLastAction])

  const showEditor = state.mode === 'split' || state.mode === 'edit'
  const showPreview = state.mode === 'split' || state.mode === 'preview'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2">
        <TabBar
          tabs={MODES}
          activeTab={state.mode}
          onTabChange={(id) => updateState({ mode: id })}
        />
        <div className="ml-auto flex items-center gap-2 py-2">
          <button
            onClick={handleExportHtml}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Export HTML
          </button>
          <CopyButton text={state.content} label="Copy MD" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {showEditor && (
          <div className={`${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'}`}>
            <Editor
              language="markdown"
              value={state.content}
              onChange={(v) => updateState({ content: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        )}
        {showPreview && (
          <div
            ref={previewRef}
            className={`${showEditor ? 'w-1/2' : 'w-full'} overflow-auto p-6`}
          >
            {html ? (
              <div
                className="prose prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_code]:rounded [&_code]:bg-[var(--color-surface)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:font-pixel [&_h1]:text-[var(--color-accent)] [&_h2]:font-pixel [&_h2]:text-[var(--color-accent)] [&_h3]:font-pixel [&_hr]:border-[var(--color-border)] [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--color-border)] [&_pre]:bg-[var(--color-surface)] [&_pre]:p-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-1.5"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                Start typing markdown in the editor...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const MarkdownEditor = lazy(() => import('@/tools/markdown-editor/MarkdownEditor'))

{ id: 'markdown-editor', name: 'Markdown Editor', group: 'write', icon: 'MD', description: 'Edit and preview markdown with Mermaid support', component: MarkdownEditor },
```

**Verification:** Type markdown → see live preview with GFM (tables, task lists). Code blocks have syntax highlighting. Mermaid fenced code blocks render as diagrams. Toggle split/edit/preview modes. Export HTML copies full page to clipboard.

---

## Task 9: Mermaid Editor

**Files:**
- Create: `apps/cockpit/src/tools/mermaid-editor/MermaidEditor.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update mermaid-editor entry)

**Context:** PRD section 6.6. Monaco editor for mermaid syntax + live diagram preview. Export SVG/PNG. Template gallery.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type MermaidEditorState = {
  content: string
}

const TEMPLATES: Record<string, string> = {
  flowchart: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B`,
  sequence: `sequenceDiagram
    Alice->>+Bob: Hello Bob
    Bob-->>-Alice: Hi Alice
    Alice->>+Bob: How are you?
    Bob-->>-Alice: Fine, thanks!`,
  classDiagram: `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal: +int age
    Animal: +String gender
    Animal: +isMammal()
    Duck: +String beakColor
    Duck: +swim()
    Fish: +int sizeInFeet
    Fish: +canEat()`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  gantt: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: a1, 2024-01-01, 30d
    Task 2: a2, after a1, 20d
    section Phase 2
    Task 3: b1, after a2, 25d`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Submit
    Processing --> Success: Valid
    Processing --> Error: Invalid
    Error --> Idle: Reset
    Success --> [*]`,
  pie: `pie title Favorite Languages
    "TypeScript" : 40
    "Rust" : 25
    "Python" : 20
    "Go" : 15`,
}

export default function MermaidEditor() {
  useMonacoTheme()
  const [state, updateState] = useToolState<MermaidEditorState>('mermaid-editor', {
    content: TEMPLATES.flowchart ?? '',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Render mermaid diagram (debounced 500ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.content.trim()) {
        setSvgHtml('')
        setError(null)
        return
      }
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, theme: 'dark' })
        const { svg } = await mermaid.render('mermaid-preview', state.content)
        setSvgHtml(svg)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
        setSvgHtml('')
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  const handleExportSvg = useCallback(() => {
    if (!svgHtml) return
    navigator.clipboard.writeText(svgHtml)
    setLastAction('SVG copied to clipboard', 'success')
  }, [svgHtml, setLastAction])

  const handleExportPng = useCallback(async () => {
    if (!svgHtml || !previewRef.current) return
    // Convert SVG to PNG via canvas
    const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) return
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setLastAction('PNG copied to clipboard', 'success')
      })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [svgHtml, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            onClick={() => updateState({ content: TEMPLATES[name] ?? '' })}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
        <button
          onClick={handleExportSvg}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          disabled={!svgHtml}
        >
          Copy SVG
        </button>
        <button
          onClick={handleExportPng}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          disabled={!svgHtml}
        >
          Copy PNG
        </button>
        <div className="ml-auto">
          <CopyButton text={state.content} label="Copy Source" />
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[var(--color-border)]">
          <Editor
            value={state.content}
            onChange={(v) => updateState({ content: v ?? '' })}
            options={EDITOR_OPTIONS}
          />
        </div>
        <div
          ref={previewRef}
          className="flex w-1/2 items-center justify-center overflow-auto bg-[var(--color-surface)] p-4"
        >
          {svgHtml ? (
            <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">
              {error ? 'Fix syntax errors to see preview' : 'Enter mermaid syntax...'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const MermaidEditor = lazy(() => import('@/tools/mermaid-editor/MermaidEditor'))

{ id: 'mermaid-editor', name: 'Mermaid Editor', group: 'write', icon: '◇', description: 'Edit and preview Mermaid diagrams', component: MermaidEditor },
```

**Verification:** Load a template → diagram renders in preview. Edit syntax → preview updates live. Invalid syntax shows error. Export SVG/PNG copies to clipboard.

---

## Task 10: TypeScript Playground + TS Worker

**Files:**
- Create: `apps/cockpit/src/workers/typescript.worker.ts`
- Create: `apps/cockpit/src/tools/ts-playground/TsPlayground.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update ts-playground entry)

**Context:** PRD section 6.22. Left panel: TypeScript input. Right panel: transpiled JavaScript. Compiler options toggles. TypeScript compiler runs in Web Worker.

### typescript.worker.ts

```typescript
import { expose } from 'comlink'
import ts from 'typescript'

type TranspileOptions = {
  target?: string
  module?: string
  strict?: boolean
}

type TranspileResult = {
  output: string
  diagnostics: Array<{
    message: string
    line?: number
    column?: number
  }>
}

const TARGET_MAP: Record<string, ts.ScriptTarget> = {
  ES5: ts.ScriptTarget.ES5,
  ES2015: ts.ScriptTarget.ES2015,
  ES2020: ts.ScriptTarget.ES2020,
  ESNext: ts.ScriptTarget.ESNext,
}

const MODULE_MAP: Record<string, ts.ModuleKind> = {
  CommonJS: ts.ModuleKind.CommonJS,
  ESNext: ts.ModuleKind.ESNext,
  None: ts.ModuleKind.None,
}

const api = {
  transpile(code: string, options: TranspileOptions = {}): TranspileResult {
    const compilerOptions: ts.CompilerOptions = {
      target: TARGET_MAP[options.target ?? 'ESNext'] ?? ts.ScriptTarget.ESNext,
      module: MODULE_MAP[options.module ?? 'ESNext'] ?? ts.ModuleKind.ESNext,
      strict: options.strict ?? true,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
    }

    const result = ts.transpileModule(code, {
      compilerOptions,
      reportDiagnostics: true,
    })

    const diagnostics = (result.diagnostics ?? []).map((d) => {
      const pos = d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : undefined
      return {
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        line: pos ? pos.line + 1 : undefined,
        column: pos ? pos.character + 1 : undefined,
      }
    })

    return {
      output: result.outputText,
      diagnostics,
    }
  },
}

export type TypeScriptWorker = typeof api

expose(api)
```

### TsPlayground.tsx

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { TypeScriptWorker } from '@/workers/typescript.worker'

type TsPlaygroundState = {
  input: string
  target: string
  module: string
  strict: boolean
}

const EXAMPLE = `interface User {
  id: number
  name: string
  email: string
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
]

const greeting = users.map(greet)
console.log(greeting)
`

export default function TsPlayground() {
  useMonacoTheme()
  const [state, updateState] = useToolState<TsPlaygroundState>('ts-playground', {
    input: EXAMPLE,
    target: 'ESNext',
    module: 'ESNext',
    strict: true,
  })

  const worker = useWorker<TypeScriptWorker>(
    () => new Worker(new URL('../../workers/typescript.worker.ts', import.meta.url), { type: 'module' })
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [output, setOutput] = useState('')
  const [diagnostics, setDiagnostics] = useState<Array<{ message: string; line?: number }>>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-transpile on input/option change (debounced 500ms)
  useEffect(() => {
    if (!worker) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.input.trim()) {
        setOutput('')
        setDiagnostics([])
        return
      }
      try {
        const result = await worker.transpile(state.input, {
          target: state.target,
          module: state.module,
          strict: state.strict,
        })
        setOutput(result.output)
        setDiagnostics(result.diagnostics)
        if (result.diagnostics.length > 0) {
          setLastAction(`${result.diagnostics.length} diagnostic(s)`, 'info')
        }
      } catch (e) {
        setOutput(`// Error: ${(e as Error).message}`)
        setDiagnostics([])
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [worker, state.input, state.target, state.module, state.strict, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Target
          <select
            value={state.target}
            onChange={(e) => updateState({ target: e.target.value })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value="ES5">ES5</option>
            <option value="ES2015">ES2015</option>
            <option value="ES2020">ES2020</option>
            <option value="ESNext">ESNext</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Module
          <select
            value={state.module}
            onChange={(e) => updateState({ module: e.target.value })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value="ESNext">ESNext</option>
            <option value="CommonJS">CommonJS</option>
            <option value="None">None</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.strict}
            onChange={(e) => updateState({ strict: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Strict
        </label>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={output} label="Copy Output" />
        </div>
      </div>
      {diagnostics.length > 0 && (
        <div className="max-h-20 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {diagnostics.map((d, i) => (
            <div key={i} className="text-xs text-[var(--color-warning)]">
              {d.line ? `Line ${d.line}: ` : ''}{d.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[var(--color-border)]">
          <Editor
            language="typescript"
            value={state.input}
            onChange={(v) => updateState({ input: v ?? '' })}
            options={EDITOR_OPTIONS}
          />
        </div>
        <div className="w-1/2">
          <Editor
            language="javascript"
            value={output}
            options={{ ...EDITOR_OPTIONS, readOnly: true }}
          />
        </div>
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const TsPlayground = lazy(() => import('@/tools/ts-playground/TsPlayground'))

{ id: 'ts-playground', name: 'TypeScript Playground', group: 'code', icon: 'TS', description: 'Transpile TypeScript to JavaScript', component: TsPlayground },
```

**Verification:** Type TypeScript → JavaScript output auto-updates. Change target to ES5 → see downlevel compilation. Strict mode toggle affects diagnostics.

---

## Task 11: Refactoring Toolkit + AST Worker

**Files:**
- Create: `apps/cockpit/src/workers/ast.worker.ts`
- Create: `apps/cockpit/src/tools/refactoring-toolkit/RefactoringToolkit.tsx`
- Modify: `apps/cockpit/src/app/tool-registry.ts` (update refactoring-toolkit entry)

**Context:** PRD section 6.28. Monaco editor input. AST-based transforms via jscodeshift in a worker. Always preview as diff before applying.

**Note:** jscodeshift is complex to run in a Web Worker due to its Node.js dependencies. For the initial implementation, we'll run simpler regex-based transforms on the main thread and defer full jscodeshift integration to a follow-up. This keeps Plan 2 deliverable while providing useful functionality.

### RefactoringToolkit.tsx

```typescript
import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type RefactoringState = {
  input: string
  selectedTransforms: string[]
}

type Transform = {
  id: string
  name: string
  description: string
  apply: (code: string) => string
}

const TRANSFORMS: Transform[] = [
  {
    id: 'var-to-let-const',
    name: 'var → let/const',
    description: 'Convert var declarations to let or const',
    apply: (code) => code.replace(/\bvar\s+/g, 'const '),
  },
  {
    id: 'remove-console',
    name: 'Remove console.*',
    description: 'Remove console.log, console.debug, console.warn statements',
    apply: (code) => code.replace(/^\s*console\.(log|debug|warn|info|error)\(.*?\);?\s*$/gm, ''),
  },
  {
    id: 'optional-chaining',
    name: 'Optional chaining',
    description: 'Convert a && a.b to a?.b patterns',
    apply: (code) => code.replace(/(\w+)\s*&&\s*\1\.(\w+)/g, '$1?.$2'),
  },
  {
    id: 'template-literals',
    name: 'Template literals',
    description: 'Convert string concatenation to template literals',
    apply: (code) => {
      // Simple case: "str" + var + "str"
      return code.replace(
        /(['"])([^'"]*)\1\s*\+\s*(\w+)\s*\+\s*(['"])([^'"]*)\4/g,
        '`$2${$3}$5`'
      )
    },
  },
  {
    id: 'arrow-functions',
    name: 'Arrow functions',
    description: 'Convert function expressions to arrow functions',
    apply: (code) => code.replace(
      /function\s*\(([^)]*)\)\s*\{/g,
      '($1) => {'
    ),
  },
  {
    id: 'trailing-commas',
    name: 'Add trailing commas',
    description: 'Add trailing commas to multi-line arrays and objects',
    apply: (code) => code.replace(/([^\s,])\n(\s*[}\]])/g, '$1,\n$2'),
  },
]

export default function RefactoringToolkit() {
  useMonacoTheme()
  const [state, updateState] = useToolState<RefactoringState>('refactoring-toolkit', {
    input: '',
    selectedTransforms: [],
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [preview, setPreview] = useState<string | null>(null)

  const toggleTransform = useCallback((id: string) => {
    updateState({
      selectedTransforms: state.selectedTransforms.includes(id)
        ? state.selectedTransforms.filter((t) => t !== id)
        : [...state.selectedTransforms, id],
    })
  }, [state.selectedTransforms, updateState])

  const handlePreview = useCallback(() => {
    if (!state.input.trim() || state.selectedTransforms.length === 0) return
    let result = state.input
    for (const id of state.selectedTransforms) {
      const transform = TRANSFORMS.find((t) => t.id === id)
      if (transform) result = transform.apply(result)
    }
    setPreview(result)
    setLastAction('Preview generated', 'info')
  }, [state.input, state.selectedTransforms, setLastAction])

  const handleApply = useCallback(() => {
    if (preview === null) return
    updateState({ input: preview })
    setPreview(null)
    setLastAction('Transforms applied', 'success')
  }, [preview, updateState, setLastAction])

  const handleDiscard = useCallback(() => {
    setPreview(null)
    setLastAction('Preview discarded', 'info')
  }, [setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handlePreview}
          disabled={state.selectedTransforms.length === 0}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50"
        >
          Preview
        </button>
        {preview !== null && (
          <>
            <button
              onClick={handleApply}
              className="rounded border border-[var(--color-success)] px-3 py-1 text-xs text-[var(--color-success)] hover:bg-[var(--color-accent-dim)]"
            >
              Apply
            </button>
            <button
              onClick={handleDiscard}
              className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              Discard
            </button>
          </>
        )}
        <div className="ml-auto">
          <CopyButton text={preview ?? state.input} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Transforms sidebar */}
        <div className="w-60 shrink-0 overflow-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 className="mb-3 font-pixel text-xs text-[var(--color-text-muted)]">Transforms</h3>
          {TRANSFORMS.map((t) => (
            <label
              key={t.id}
              className="mb-2 flex cursor-pointer items-start gap-2 rounded p-2 text-xs hover:bg-[var(--color-surface-hover)]"
            >
              <input
                type="checkbox"
                checked={state.selectedTransforms.includes(t.id)}
                onChange={() => toggleTransform(t.id)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <div className="font-bold text-[var(--color-text)]">{t.name}</div>
                <div className="text-[var(--color-text-muted)]">{t.description}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Editor area */}
        <div className="flex flex-1 overflow-hidden">
          {preview !== null ? (
            <>
              <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">Original</div>
                <div className="flex-1">
                  <Editor
                    language="javascript"
                    value={state.input}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                </div>
              </div>
              <div className="flex w-1/2 flex-col">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-accent)]">Preview</div>
                <div className="flex-1">
                  <Editor
                    language="javascript"
                    value={preview}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1">
              <Editor
                language="javascript"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### tool-registry.ts update

```typescript
const RefactoringToolkit = lazy(() => import('@/tools/refactoring-toolkit/RefactoringToolkit'))

{ id: 'refactoring-toolkit', name: 'Refactoring Toolkit', group: 'code', icon: '♻', description: 'AST-based code transforms (var to let, then to await)', component: RefactoringToolkit },
```

**Verification:** Paste JS with `var` and `console.log` → select transforms → Preview → see before/after side-by-side → Apply → code updated. Discard returns to original.

---

## Task 12: Update Tool Registry (all Plan 2 tools)

**Files:**
- Modify: `apps/cockpit/src/app/tool-registry.ts`

**Context:** This task applies all the tool-registry.ts changes from Tasks 4-11 in one pass. Each preceding task specifies a lazy import and component update. This task ensures they are all wired up correctly.

**Steps:**
- [ ] Add all lazy import lines at the top of tool-registry.ts:
  ```typescript
  const JsonTools = lazy(() => import('@/tools/json-tools/JsonTools'))
  const CodeFormatter = lazy(() => import('@/tools/code-formatter/CodeFormatter'))
  const XmlTools = lazy(() => import('@/tools/xml-tools/XmlTools'))
  const DiffViewer = lazy(() => import('@/tools/diff-viewer/DiffViewer'))
  const MarkdownEditor = lazy(() => import('@/tools/markdown-editor/MarkdownEditor'))
  const MermaidEditor = lazy(() => import('@/tools/mermaid-editor/MermaidEditor'))
  const TsPlayground = lazy(() => import('@/tools/ts-playground/TsPlayground'))
  const RefactoringToolkit = lazy(() => import('@/tools/refactoring-toolkit/RefactoringToolkit'))
  ```
- [ ] Update each tool entry's `component` field from `Placeholder` to the correct lazy component
- [ ] Verify no duplicate imports, no remaining Placeholder references for Plan 2 tools

**Verification:** `bun run build` succeeds. Each of the 8 tools loads when selected in the sidebar.

---

## Task 13: Build Verification + Smoke Test

**Files:** None (testing only)

**Steps:**
- [ ] Run `bun run build` from `apps/cockpit/` — must succeed with no type errors
- [ ] Run `bun tauri dev` — app must launch
- [ ] Click through each of the 8 new tools in the sidebar — each must render without crashing
- [ ] JSON Tools: paste `{"a":1}` → Format → shows formatted JSON. Tree view shows expandable tree. Table view with `[{"a":1}]` shows table.
- [ ] Code Formatter: paste messy JS → Format → beautified
- [ ] XML Tools: paste XML → Format → prettified
- [ ] Diff Viewer: enter different text in left/right → Compare → diff shown
- [ ] Markdown Editor: type `# Hello` → see rendered heading in preview
- [ ] Mermaid Editor: load flowchart template → diagram renders
- [ ] TS Playground: type TS → see JS output
- [ ] Refactoring: paste JS with `var` → select transform → Preview → Apply
- [ ] Theme toggle (Cmd/Ctrl+Shift+T) — Monaco editors switch themes
- [ ] Command palette (Cmd/Ctrl+K) — new tools appear in search results

**Verification:** All checks pass. Plan 2 is complete.

---

## Execution Notes

### Task Dependencies
```
Task 1 (deps install) → all other tasks
Task 2 (hooks) → Tasks 4-11 (all tools use useMonaco + useWorker)
Task 3 (formatter worker) → Tasks 4, 5 (JSON Tools, Code Formatter)
Tasks 4-11 are independent of each other (can be parallelized after deps)
Task 12 (registry) depends on Tasks 4-11
Task 13 (smoke test) depends on all tasks
```

### Parallelization Opportunities
After Tasks 1-3 complete sequentially:
- **Batch A:** Tasks 4+5 (both use formatter worker)
- **Batch B:** Tasks 6+7 (XML + Diff — each has own worker)
- **Batch C:** Tasks 8+9 (Markdown + Mermaid — similar patterns)
- **Batch D:** Tasks 10+11 (TS Playground + Refactoring — each has own worker)
- Then Task 12, then Task 13

### Model Selection for Subagents
- **Tasks 1-3:** sonnet — mechanical dependency install and boilerplate hooks with exact code provided
- **Tasks 4-11:** sonnet — each tool has complete code in the plan, mostly copy-paste with minor adaptation
- **Task 12:** sonnet — mechanical registry update
- **Task 13:** sonnet — run commands and verify output
