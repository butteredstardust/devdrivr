# Developer Cockpit — Plan 3: Utility Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 14 utility tools that remain on Placeholder: 7 converters, 4 web validators/calculators, 2 testers, and 1 schema validator. These tools are generally simpler than Plan 2's editor-based tools — most transform strings, decode tokens, or validate syntax without needing Web Workers (computation is fast enough for the main thread). A few exceptions use Monaco for code input.

**Quality standards (enforced in every tool):**
- Typed state via `useToolState<T>` — no `any`, no `as` casts without justification
- All user actions report to status bar via `setLastAction()`
- Errors caught and displayed inline — never swallowed, never console-only
- Keyboard shortcut Cmd/Ctrl+Enter triggers primary action where applicable
- Copy buttons on all outputs via `CopyButton`
- Design tokens only — no hardcoded colors, all via `var(--color-*)`
- `font-pixel` for headings/labels, `font-mono` (inherited) for content
- Consistent toolbar layout: action buttons left, copy buttons right

**Base stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, Tauri 2

**New dependencies for Plan 3:**
- `ajv` + `ajv-formats` — JSON Schema validation (Draft 2020-12, fast, well-maintained)
- `css-tree` — CSS parsing/validation/specificity
- `htmlhint` — HTML validation with accessibility rules
- `js-md5` — MD5 hashing (Web Crypto API lacks MD5; this is a 4KB pure-JS implementation)

**No new deps needed for:** Case Converter (pure string transforms), Base64 (native `btoa`/`atob`), URL Encode/Decode (native `encodeURIComponent`/`decodeURIComponent`), Timestamp Converter (native `Date` + `Intl`), Color Converter (pure math), JWT Decoder (base64 decode), Regex Tester (native `RegExp`), cURL→Fetch (string parsing), Hash Generator (Web Crypto API for SHA-* + js-md5 for MD5), CSS Specificity (css-tree can compute this)

**Spec:** `/Users/tuxgeek/Dev/devdrivr/developer_cockpit_prd.md` (sections 6.7, 6.13–6.18, 6.20–6.21, 6.23–6.27)

**Plan series:**
- **Plan 1:** Foundation & Shell (complete)
- **Plan 2:** Editor-Based Tools (complete)
- **Plan 3 (this):** Utility Tools
- **Plan 4:** System Features (Notes, Snippets, History, API Client, Docs Browser, cross-tool flow)

---

## Established Patterns (all tools MUST follow)

Every tool created in this plan must follow these patterns established in Plans 1-2. Subagents: read the referenced files before writing code.

### Imports & hooks
```typescript
// State persistence — ALWAYS use for tool state
import { useToolState } from '@/hooks/useToolState'
// Status bar feedback — ALWAYS report actions
import { useUiStore } from '@/stores/ui.store'
// Copy button — use on all outputs
import { CopyButton } from '@/components/shared/CopyButton'
// Tab bar — use when tool has sub-modes
import { TabBar } from '@/components/shared/TabBar'
// Monaco — only for tools that need code editing
import Editor from '@monaco-editor/react'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
// Keyboard shortcuts
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
```

### Settings store shape
The settings store spreads `AppSettings` flat — access via `useSettingsStore((s) => s.theme)`, NOT `s.settings.theme`.

### Component structure
```typescript
type MyToolState = {
  input: string
  // ... tool-specific fields, all typed
}

export default function MyTool() {
  // 1. Hooks at top
  const [state, updateState] = useToolState<MyToolState>('my-tool', { input: '', ... })
  const setLastAction = useUiStore((s) => s.setLastAction)

  // 2. Derived state via useMemo (not useEffect)
  // 3. Callbacks via useCallback
  // 4. Keyboard shortcuts

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {/* Action buttons left, copy buttons right (ml-auto) */}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Tool UI */}
      </div>
    </div>
  )
}
```

### CSS class conventions
- Buttons (primary): `rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]`
- Buttons (secondary): `rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]`
- Inputs: `rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]`
- Section headings: `font-pixel text-sm text-[var(--color-text)]`
- Muted text: `text-xs text-[var(--color-text-muted)]`
- Success: `text-[var(--color-success)]`
- Error: `text-[var(--color-error)]`
- Surface cards: `rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3`

---

## File Structure (Plan 3 additions)

```
apps/cockpit/src/tools/
├── case-converter/
│   └── CaseConverter.tsx
├── color-converter/
│   └── ColorConverter.tsx
├── timestamp-converter/
│   └── TimestampConverter.tsx
├── base64/
│   └── Base64Tool.tsx
├── url-codec/
│   └── UrlCodec.tsx
├── curl-to-fetch/
│   └── CurlToFetch.tsx
├── hash-generator/
│   └── HashGenerator.tsx
├── regex-tester/
│   └── RegexTester.tsx
├── jwt-decoder/
│   └── JwtDecoder.tsx
├── json-schema-validator/
│   └── JsonSchemaValidator.tsx
├── css-validator/
│   └── CssValidator.tsx
├── html-validator/
│   └── HtmlValidator.tsx
├── css-specificity/
│   └── CssSpecificity.tsx
└── css-to-tailwind/
    └── CssToTailwind.tsx
```

---

## Task 1: Install Plan 3 Dependencies

**Files:**
- Modify: `apps/cockpit/package.json`

**Steps:**
- [ ] Add to `dependencies`:
  ```json
  "ajv": "^8.17.1",
  "ajv-formats": "^3.0.1",
  "css-tree": "^3.1.0",
  "htmlhint": "^1.5.0",
  "js-md5": "^0.8.3"
  ```
- [ ] Add to `devDependencies`:
  ```json
  "@types/css-tree": "^2.3.10",
  "@types/js-md5": "^0.7.2"
  ```
- [ ] Run `bun install` from the monorepo root `/Users/tuxgeek/Dev/devdrivr/`
- [ ] Verify `bun install` exits 0

**Verification:** `bun install` completes, no conflicts.

---

## Task 2: Case Converter

**Files:**
- Create: `apps/cockpit/src/tools/case-converter/CaseConverter.tsx`

**Context:** PRD 6.7. Pure string transforms, no external deps. All conversions shown simultaneously. Click any output to copy.

```typescript
import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CaseConverterState = {
  input: string
}

type CaseResult = {
  label: string
  value: string
}

function toWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function computeCases(input: string): CaseResult[] {
  if (!input.trim()) return []
  const words = toWords(input)
  const lower = words.map((w) => w.toLowerCase())

  return [
    { label: 'UPPERCASE', value: input.toUpperCase() },
    { label: 'lowercase', value: input.toLowerCase() },
    { label: 'Title Case', value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') },
    { label: 'Sentence case', value: lower.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ') },
    { label: 'camelCase', value: lower.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('') },
    { label: 'PascalCase', value: lower.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') },
    { label: 'snake_case', value: lower.join('_') },
    { label: 'SCREAMING_SNAKE_CASE', value: lower.join('_').toUpperCase() },
    { label: 'kebab-case', value: lower.join('-') },
    { label: 'dot.case', value: lower.join('.') },
    { label: 'path/case', value: lower.join('/') },
    { label: 'CONSTANT_CASE', value: lower.join('_').toUpperCase() },
  ]
}

export default function CaseConverter() {
  const [state, updateState] = useToolState<CaseConverterState>('case-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const cases = useMemo(() => computeCases(state.input), [state.input])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Input</h2>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Type or paste text to convert..."
          rows={3}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {cases.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cases.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--color-text-muted)]">{c.label}</div>
                  <div className="truncate font-mono text-sm text-[var(--color-text)]">{c.value}</div>
                </div>
                <CopyButton text={c.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Enter text above to see conversions</div>
        )}
      </div>
    </div>
  )
}
```

**Verification:** Type "hello world" → all 12 cases shown. Type "myVariableName" → correctly splits on camelCase boundaries. Click copy → clipboard populated.

---

## Task 3: Base64 Encode/Decode

**Files:**
- Create: `apps/cockpit/src/tools/base64/Base64Tool.tsx`

**Context:** PRD 6.15. Two panels (input/output). Toggle direction. Auto-detect valid Base64.

```typescript
import { useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

type Base64State = {
  input: string
  mode: 'encode' | 'decode'
}

function isValidBase64(str: string): boolean {
  if (!str.trim()) return false
  try {
    return btoa(atob(str)) === str.replace(/\s/g, '')
  } catch {
    return false
  }
}

export default function Base64Tool() {
  const [state, updateState] = useToolState<Base64State>('base64', {
    input: '',
    mode: 'encode',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        return { text: btoa(unescape(encodeURIComponent(state.input))), error: null }
      } else {
        return { text: decodeURIComponent(escape(atob(state.input.replace(/\s/g, '')))), error: null }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode])

  const autoDetect = useMemo(() => {
    if (!state.input.trim()) return null
    return isValidBase64(state.input.replace(/\s/g, ''))
  }, [state.input])

  const handleSwap = useCallback(() => {
    if (output.text) {
      updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' })
      setLastAction('Swapped', 'info')
    }
  }, [output.text, state.mode, updateState, setLastAction])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleToggle}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </button>
        <button
          onClick={handleSwap}
          disabled={!output.text}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
        >
          Swap ⇄
        </button>
        {autoDetect !== null && (
          <span className={`text-xs ${autoDetect ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>
            {autoDetect ? '✓ Input looks like Base64' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Input ({state.mode === 'encode' ? 'Text' : 'Base64'})
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={state.mode === 'encode' ? 'Enter text to encode...' : 'Enter Base64 to decode...'}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              Output ({state.mode === 'encode' ? 'Base64' : 'Text'})
            </span>
            <CopyButton text={output.text} />
          </div>
          {output.error ? (
            <div className="p-4 text-sm text-[var(--color-error)]">{output.error}</div>
          ) : (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]">
              {output.text}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Type "hello" in encode mode → output shows `aGVsbG8=`. Switch to decode → paste Base64 → see decoded text. Auto-detect badge shows on Base64 input.

---

## Task 4: URL Encode/Decode

**Files:**
- Create: `apps/cockpit/src/tools/url-codec/UrlCodec.tsx`

**Context:** PRD 6.16. Two panels. Toggle direction. Component vs full URL mode. Parse URL into structured parts.

```typescript
import { useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type UrlCodecState = {
  input: string
  mode: 'encode' | 'decode'
  encodeMode: 'component' | 'full'
}

type UrlParts = {
  protocol: string
  host: string
  pathname: string
  search: string
  hash: string
  params: Array<{ key: string; value: string }>
}

function parseUrl(input: string): UrlParts | null {
  try {
    const url = new URL(input)
    const params: Array<{ key: string; value: string }> = []
    url.searchParams.forEach((value, key) => {
      params.push({ key, value })
    })
    return {
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      params,
    }
  } catch {
    return null
  }
}

export default function UrlCodec() {
  const [state, updateState] = useToolState<UrlCodecState>('url-codec', {
    input: '',
    mode: 'encode',
    encodeMode: 'component',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        return {
          text: state.encodeMode === 'component'
            ? encodeURIComponent(state.input)
            : encodeURI(state.input),
          error: null,
        }
      } else {
        return {
          text: state.encodeMode === 'component'
            ? decodeURIComponent(state.input)
            : decodeURI(state.input),
          error: null,
        }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode, state.encodeMode])

  const urlParts = useMemo(() => {
    const decoded = state.mode === 'decode' && output.text ? output.text : state.input
    return parseUrl(decoded)
  }, [state.input, state.mode, output.text])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleToggle}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </button>
        <select
          value={state.encodeMode}
          onChange={(e) => updateState({ encodeMode: e.target.value as UrlCodecState['encodeMode'] })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          <option value="component">Component (encodeURIComponent)</option>
          <option value="full">Full URL (encodeURI)</option>
        </select>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">Input</div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="Enter text or URL..."
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">Output</span>
            <CopyButton text={output.text} />
          </div>
          {output.error ? (
            <div className="p-4 text-sm text-[var(--color-error)]">{output.error}</div>
          ) : (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]">
              {output.text}
            </pre>
          )}
        </div>
      </div>
      {urlParts && (
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">URL Parts</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div><span className="text-[var(--color-text-muted)]">Protocol:</span> <span className="text-[var(--color-text)]">{urlParts.protocol}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Host:</span> <span className="text-[var(--color-text)]">{urlParts.host}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Path:</span> <span className="text-[var(--color-text)]">{urlParts.pathname}</span></div>
            <div><span className="text-[var(--color-text-muted)]">Hash:</span> <span className="text-[var(--color-text)]">{urlParts.hash || '(none)'}</span></div>
          </div>
          {urlParts.params.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-[var(--color-text-muted)]">Query Parameters:</div>
              {urlParts.params.map((p, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-[var(--color-accent)]">{p.key}</span>
                  <span className="text-[var(--color-text-muted)]">=</span>
                  <span className="text-[var(--color-text)]">{p.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Verification:** Paste a URL with query params → see encoded output + parsed URL parts. Toggle decode → paste encoded string → see decoded. Component vs full mode difference visible with special chars.

---

## Task 5: Timestamp Converter

**Files:**
- Create: `apps/cockpit/src/tools/timestamp-converter/TimestampConverter.tsx`

**Context:** PRD 6.17. Input unix timestamp or date string. Output all formats simultaneously. "Now" button. Relative time display.

```typescript
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type TimestampState = {
  input: string
}

type TimeFormats = {
  unixSeconds: string
  unixMilliseconds: string
  iso8601: string
  rfc2822: string
  relative: string
  local: string
  utc: string
}

function parseInput(input: string): Date | null {
  if (!input.trim()) return null
  const trimmed = input.trim()

  // Try as unix timestamp
  const num = Number(trimmed)
  if (!isNaN(num) && isFinite(num)) {
    // Heuristic: if < 1e12 it's seconds, otherwise milliseconds
    const ms = num < 1e12 ? num * 1000 : num
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }

  // Try as date string
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d

  return null
}

function relativeTime(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const absDiff = Math.abs(diffMs)
  const suffix = diffMs >= 0 ? 'ago' : 'from now'

  if (absDiff < 60_000) return `${Math.round(absDiff / 1000)} seconds ${suffix}`
  if (absDiff < 3_600_000) return `${Math.round(absDiff / 60_000)} minutes ${suffix}`
  if (absDiff < 86_400_000) return `${Math.round(absDiff / 3_600_000)} hours ${suffix}`
  if (absDiff < 2_592_000_000) return `${Math.round(absDiff / 86_400_000)} days ${suffix}`
  if (absDiff < 31_536_000_000) return `${Math.round(absDiff / 2_592_000_000)} months ${suffix}`
  return `${Math.round(absDiff / 31_536_000_000)} years ${suffix}`
}

function computeFormats(date: Date): TimeFormats {
  return {
    unixSeconds: String(Math.floor(date.getTime() / 1000)),
    unixMilliseconds: String(date.getTime()),
    iso8601: date.toISOString(),
    rfc2822: date.toUTCString(),
    relative: relativeTime(date),
    local: date.toLocaleString(),
    utc: date.toUTCString(),
  }
}

export default function TimestampConverter() {
  const [state, updateState] = useToolState<TimestampState>('timestamp-converter', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  // Refresh relative time every 10 seconds
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  const parsed = useMemo(() => {
    const date = parseInput(state.input)
    if (!date) return null
    return computeFormats(date)
    // tick dependency forces re-computation for relative time
  }, [state.input, tick])

  const handleNow = useCallback(() => {
    updateState({ input: String(Date.now()) })
    setLastAction('Inserted current timestamp', 'success')
  }, [updateState, setLastAction])

  const formats = parsed
    ? [
        { label: 'Unix (seconds)', value: parsed.unixSeconds },
        { label: 'Unix (milliseconds)', value: parsed.unixMilliseconds },
        { label: 'ISO 8601', value: parsed.iso8601 },
        { label: 'RFC 2822', value: parsed.rfc2822 },
        { label: 'Local time', value: parsed.local },
        { label: 'UTC', value: parsed.utc },
        { label: 'Relative', value: parsed.relative },
      ]
    : []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleNow}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Now
        </button>
      </div>
      <div className="p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Input</h2>
        <input
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Unix timestamp (1234567890) or date string (2024-01-15T10:30:00Z)"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {formats.length > 0 ? (
          <div className="flex flex-col gap-3">
            {formats.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">{f.label}</div>
                  <div className="font-mono text-sm text-[var(--color-text)]">{f.value}</div>
                </div>
                <CopyButton text={f.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : state.input.trim() ? (
          <div className="text-sm text-[var(--color-error)]">Could not parse input as a date or timestamp</div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Enter a timestamp or date string above</div>
        )}
      </div>
    </div>
  )
}
```

**Verification:** Enter `1700000000` → shows all formats. Click "Now" → current time in all formats. Enter "2024-03-15" → parsed correctly. Relative time updates every 10s.

---

## Task 6: Color Converter

**Files:**
- Create: `apps/cockpit/src/tools/color-converter/ColorConverter.tsx`

**Context:** PRD 6.18. Input any color format → output all formats. Visual swatch. WCAG contrast ratio calculator.

```typescript
import { useMemo, useCallback } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type ColorConverterState = {
  input: string
  contrastFg: string
  contrastBg: string
}

type RGB = { r: number; g: number; b: number }
type HSL = { h: number; s: number; l: number }

// Parse any color string to RGB
function parseColor(input: string): RGB | null {
  const trimmed = input.trim().toLowerCase()

  // Hex: #rgb, #rrggbb
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/)
  if (hexMatch?.[1]) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      return { r: parseInt(hex[0]! + hex[0]!, 16), g: parseInt(hex[1]! + hex[1]!, 16), b: parseInt(hex[2]! + hex[2]!, 16) }
    }
    if (hex.length >= 6) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) }
  }

  // hsl(h, s%, l%)
  const hslMatch = trimmed.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/)
  if (hslMatch) {
    return hslToRgb({ h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) })
  }

  // Named CSS colors (common ones)
  const NAMED: Record<string, RGB> = {
    red: { r: 255, g: 0, b: 0 }, green: { r: 0, g: 128, b: 0 }, blue: { r: 0, g: 0, b: 255 },
    white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 },
    yellow: { r: 255, g: 255, b: 0 }, cyan: { r: 0, g: 255, b: 255 }, magenta: { r: 255, g: 0, b: 255 },
    orange: { r: 255, g: 165, b: 0 }, purple: { r: 128, g: 0, b: 128 }, pink: { r: 255, g: 192, b: 203 },
    gray: { r: 128, g: 128, b: 128 }, grey: { r: 128, g: 128, b: 128 },
  }
  const named = NAMED[trimmed]
  if (named) return named

  return null
}

function rgbToHex(rgb: RGB): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToRgb(hsl: HSL): RGB {
  const s = hsl.s / 100, l = hsl.l / 100
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v } }
  const h = hsl.h / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(h + 1/3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1/3) * 255),
  }
}

// WCAG relative luminance
function luminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = Math.max(luminance(fg), luminance(bg))
  const l2 = Math.min(luminance(fg), luminance(bg))
  return (l1 + 0.05) / (l2 + 0.05)
}

export default function ColorConverter() {
  const [state, updateState] = useToolState<ColorConverterState>('color-converter', {
    input: '#39ff14',
    contrastFg: '#ffffff',
    contrastBg: '#000000',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const color = useMemo(() => {
    const rgb = parseColor(state.input)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    return {
      rgb,
      hex: rgbToHex(rgb),
      rgbStr: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hslStr: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    }
  }, [state.input])

  const contrast = useMemo(() => {
    const fg = parseColor(state.contrastFg)
    const bg = parseColor(state.contrastBg)
    if (!fg || !bg) return null
    const ratio = contrastRatio(fg, bg)
    return {
      ratio: ratio.toFixed(2),
      aa: ratio >= 4.5,
      aaLarge: ratio >= 3,
      aaa: ratio >= 7,
    }
  }, [state.contrastFg, state.contrastBg])

  const formats = color
    ? [
        { label: 'Hex', value: color.hex },
        { label: 'RGB', value: color.rgbStr },
        { label: 'HSL', value: color.hslStr },
      ]
    : []

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <section>
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Color Input</h2>
        <div className="flex items-center gap-3">
          <input
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="#39ff14, rgb(255,0,0), hsl(120,100%,50%), red"
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          {color && (
            <div
              className="h-10 w-10 shrink-0 rounded border border-[var(--color-border)]"
              style={{ backgroundColor: color.hex }}
            />
          )}
        </div>
      </section>

      {formats.length > 0 && (
        <section>
          <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Formats</h2>
          <div className="flex flex-col gap-2">
            {formats.map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <div>
                  <span className="text-xs text-[var(--color-text-muted)]">{f.label}: </span>
                  <span className="font-mono text-sm text-[var(--color-text)]">{f.value}</span>
                </div>
                <CopyButton text={f.value} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Contrast Ratio (WCAG)</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Foreground</label>
            <div className="flex items-center gap-2">
              <input
                value={state.contrastFg}
                onChange={(e) => updateState({ contrastFg: e.target.value })}
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              {parseColor(state.contrastFg) && (
                <div className="h-6 w-6 shrink-0 rounded border border-[var(--color-border)]" style={{ backgroundColor: state.contrastFg }} />
              )}
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Background</label>
            <div className="flex items-center gap-2">
              <input
                value={state.contrastBg}
                onChange={(e) => updateState({ contrastBg: e.target.value })}
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              {parseColor(state.contrastBg) && (
                <div className="h-6 w-6 shrink-0 rounded border border-[var(--color-border)]" style={{ backgroundColor: state.contrastBg }} />
              )}
            </div>
          </div>
        </div>
        {contrast && (
          <div className="mt-3 flex items-center gap-4">
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
              <div className="text-xs text-[var(--color-text-muted)]">Ratio</div>
              <div className="font-mono text-lg font-bold text-[var(--color-text)]">{contrast.ratio}:1</div>
            </div>
            <div
              className="flex h-12 items-center justify-center rounded border border-[var(--color-border)] px-6 text-sm font-bold"
              style={{ backgroundColor: state.contrastBg, color: state.contrastFg }}
            >
              Sample Text
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className={contrast.aa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aa ? '✓' : '✗'} AA Normal (≥4.5)
              </span>
              <span className={contrast.aaLarge ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aaLarge ? '✓' : '✗'} AA Large (≥3.0)
              </span>
              <span className={contrast.aaa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aaa ? '✓' : '✗'} AAA (≥7.0)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
```

**Verification:** Enter `#39ff14` → see hex, rgb, hsl outputs + green swatch. Enter `red` → works. Contrast checker shows ratio and WCAG pass/fail with live sample text.

---

## Task 7: Hash Generator

**Files:**
- Create: `apps/cockpit/src/tools/hash-generator/HashGenerator.tsx`

**Context:** PRD 6.20. Input text → all hash formats simultaneously. Web Crypto API for SHA-*, `js-md5` for MD5.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import md5 from 'js-md5'

type HashGeneratorState = {
  input: string
}

type Hashes = {
  md5: string
  sha1: string
  sha256: string
  sha512: string
}

async function computeHashes(input: string): Promise<Hashes> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)

  const [sha1, sha256, sha512] = await Promise.all([
    crypto.subtle.digest('SHA-1', data),
    crypto.subtle.digest('SHA-256', data),
    crypto.subtle.digest('SHA-512', data),
  ])

  const toHex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  return {
    md5: md5(input),
    sha1: toHex(sha1),
    sha256: toHex(sha256),
    sha512: toHex(sha512),
  }
}

export default function HashGenerator() {
  const [state, updateState] = useToolState<HashGeneratorState>('hash-generator', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [hashes, setHashes] = useState<Hashes | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.input) {
      setHashes(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      computeHashes(state.input).then(setHashes)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input])

  const hashList = hashes
    ? [
        { label: 'MD5', value: hashes.md5 },
        { label: 'SHA-1', value: hashes.sha1 },
        { label: 'SHA-256', value: hashes.sha256 },
        { label: 'SHA-512', value: hashes.sha512 },
      ]
    : []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Input</h2>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Enter text to hash..."
          rows={4}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {hashList.length > 0 ? (
          <div className="flex flex-col gap-3">
            {hashList.map((h) => (
              <div
                key={h.label}
                className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--color-text-muted)]">{h.label}</div>
                  <div className="truncate font-mono text-xs text-[var(--color-text)]">{h.value}</div>
                </div>
                <CopyButton text={h.value} className="ml-2 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Enter text above to see hashes</div>
        )}
      </div>
    </div>
  )
}
```

**Verification:** Type "hello" → all 4 hashes displayed instantly. MD5 matches known value `5d41402abc4b2a76b9719d911017c592`.

---

## Task 8: JWT Decoder

**Files:**
- Create: `apps/cockpit/src/tools/jwt-decoder/JwtDecoder.tsx`

**Context:** PRD 6.14. Decode-only (no verification). Color-coded header/payload/signature. Expiry check.

```typescript
import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type JwtDecoderState = {
  input: string
}

type DecodedJwt = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  headerRaw: string
  payloadRaw: string
  expiry: { expired: boolean; expiresAt: string; relative: string } | null
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const withPadding = pad ? padded + '='.repeat(4 - pad) : padded
  return decodeURIComponent(
    atob(withPadding)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null

  try {
    const headerRaw = decodeBase64Url(parts[0]!)
    const payloadRaw = decodeBase64Url(parts[1]!)
    const header = JSON.parse(headerRaw) as Record<string, unknown>
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>

    let expiry: DecodedJwt['expiry'] = null
    if (typeof payload['exp'] === 'number') {
      const expiresAt = new Date(payload['exp'] * 1000)
      const now = new Date()
      const diffMs = expiresAt.getTime() - now.getTime()
      const absDiff = Math.abs(diffMs)
      let relative: string
      if (absDiff < 3_600_000) relative = `${Math.round(absDiff / 60_000)} minutes`
      else if (absDiff < 86_400_000) relative = `${Math.round(absDiff / 3_600_000)} hours`
      else relative = `${Math.round(absDiff / 86_400_000)} days`
      relative = diffMs >= 0 ? `in ${relative}` : `${relative} ago`

      expiry = {
        expired: diffMs < 0,
        expiresAt: expiresAt.toLocaleString(),
        relative,
      }
    }

    return {
      header,
      payload,
      signature: parts[2]!,
      headerRaw,
      payloadRaw,
      expiry,
    }
  } catch {
    return null
  }
}

export default function JwtDecoder() {
  const [state, updateState] = useToolState<JwtDecoderState>('jwt-decoder', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const decoded = useMemo(() => {
    if (!state.input.trim()) return null
    return decodeJwt(state.input)
  }, [state.input])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">JWT Token</h2>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Paste a JWT token (eyJ...)"
          rows={3}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {decoded ? (
          <div className="flex flex-col gap-4">
            {decoded.expiry && (
              <div className={`rounded border px-3 py-2 text-sm ${
                decoded.expiry.expired
                  ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                  : 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
              }`}>
                {decoded.expiry.expired ? '⚠ Token expired' : '✓ Token valid'} — expires {decoded.expiry.expiresAt} ({decoded.expiry.relative})
              </div>
            )}

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-blue-400">Header</h3>
                <CopyButton text={JSON.stringify(decoded.header, null, 2)} />
              </div>
              <pre className="rounded border border-blue-400/30 bg-blue-400/5 p-3 font-mono text-xs text-[var(--color-text)]">
                {JSON.stringify(decoded.header, null, 2)}
              </pre>
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-green-400">Payload</h3>
                <CopyButton text={JSON.stringify(decoded.payload, null, 2)} />
              </div>
              <pre className="rounded border border-green-400/30 bg-green-400/5 p-3 font-mono text-xs text-[var(--color-text)]">
                {JSON.stringify(decoded.payload, null, 2)}
              </pre>
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-red-400">Signature</h3>
                <CopyButton text={decoded.signature} />
              </div>
              <pre className="rounded border border-red-400/30 bg-red-400/5 p-3 font-mono text-xs text-[var(--color-text)] break-all">
                {decoded.signature}
              </pre>
            </section>
          </div>
        ) : state.input.trim() ? (
          <div className="text-sm text-[var(--color-error)]">Invalid JWT token — expected format: header.payload.signature</div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Paste a JWT token above to decode it</div>
        )}
      </div>
    </div>
  )
}
```

**Verification:** Paste a JWT → header (blue), payload (green), signature (red) sections. Expired token shows warning banner. Non-JWT shows error.

---

## Task 9: Regex Tester

**Files:**
- Create: `apps/cockpit/src/tools/regex-tester/RegexTester.tsx`

**Context:** PRD 6.13. Pattern input with flags. Test string. Real-time match highlighting. Capture groups. Reference sidebar.

```typescript
import { useMemo, useState, useCallback } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type RegexTesterState = {
  pattern: string
  flags: string
  testString: string
}

type Match = {
  full: string
  index: number
  groups: Array<{ name: string | null; value: string }>
}

const REFERENCE = [
  { pattern: '.', desc: 'Any character except newline' },
  { pattern: '\\d', desc: 'Digit [0-9]' },
  { pattern: '\\w', desc: 'Word char [a-zA-Z0-9_]' },
  { pattern: '\\s', desc: 'Whitespace' },
  { pattern: '\\b', desc: 'Word boundary' },
  { pattern: '^', desc: 'Start of string/line' },
  { pattern: '$', desc: 'End of string/line' },
  { pattern: '*', desc: '0 or more' },
  { pattern: '+', desc: '1 or more' },
  { pattern: '?', desc: '0 or 1' },
  { pattern: '{n,m}', desc: 'Between n and m' },
  { pattern: '()', desc: 'Capture group' },
  { pattern: '(?:)', desc: 'Non-capture group' },
  { pattern: '(?<name>)', desc: 'Named group' },
  { pattern: '|', desc: 'Alternation (or)' },
  { pattern: '[abc]', desc: 'Character class' },
  { pattern: '[^abc]', desc: 'Negated class' },
  { pattern: '(?=)', desc: 'Positive lookahead' },
  { pattern: '(?!)', desc: 'Negative lookahead' },
]

function findMatches(pattern: string, flags: string, text: string): { matches: Match[]; error: string | null } {
  if (!pattern) return { matches: [], error: null }
  try {
    const re = new RegExp(pattern, flags)
    const matches: Match[] = []

    if (flags.includes('g')) {
      let m: RegExpExecArray | null
      let guard = 0
      while ((m = re.exec(text)) !== null && guard < 1000) {
        guard++
        const groups: Match['groups'] = []
        for (let i = 1; i < m.length; i++) {
          const name = m.groups ? Object.entries(m.groups).find(([, v]) => v === m![i])?.[0] ?? null : null
          groups.push({ name, value: m[i] ?? '' })
        }
        matches.push({ full: m[0], index: m.index, groups })
        if (m[0] === '') re.lastIndex++ // prevent infinite loop on zero-width match
      }
    } else {
      const m = re.exec(text)
      if (m) {
        const groups: Match['groups'] = []
        for (let i = 1; i < m.length; i++) {
          const name = m.groups ? Object.entries(m.groups).find(([, v]) => v === m![i])?.[0] ?? null : null
          groups.push({ name, value: m[i] ?? '' })
        }
        matches.push({ full: m[0], index: m.index, groups })
      }
    }

    return { matches, error: null }
  } catch (e) {
    return { matches: [], error: (e as Error).message }
  }
}

function highlightMatches(text: string, pattern: string, flags: string): string {
  if (!pattern || !text) return ''
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    return text.replace(re, (match) => `<mark class="bg-[var(--color-accent)]/30 text-[var(--color-accent)] rounded px-0.5">${match}</mark>`)
  } catch {
    return text
  }
}

export default function RegexTester() {
  const [state, updateState] = useToolState<RegexTesterState>('regex-tester', {
    pattern: '',
    flags: 'g',
    testString: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [showRef, setShowRef] = useState(false)

  const result = useMemo(
    () => findMatches(state.pattern, state.flags, state.testString),
    [state.pattern, state.flags, state.testString]
  )

  const highlighted = useMemo(
    () => highlightMatches(state.testString, state.pattern, state.flags),
    [state.testString, state.pattern, state.flags]
  )

  const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u'] as const

  const toggleFlag = useCallback((flag: string) => {
    const newFlags = state.flags.includes(flag)
      ? state.flags.replace(flag, '')
      : state.flags + flag
    updateState({ flags: newFlags })
  }, [state.flags, updateState])

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">/</span>
          <input
            value={state.pattern}
            onChange={(e) => updateState({ pattern: e.target.value })}
            placeholder="Enter regex pattern..."
            className="flex-1 border-none bg-transparent font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">/</span>
          <div className="flex gap-1">
            {FLAG_OPTIONS.map((flag) => (
              <button
                key={flag}
                onClick={() => toggleFlag(flag)}
                className={`h-6 w-6 rounded text-xs font-bold ${
                  state.flags.includes(flag)
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {flag}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRef(!showRef)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showRef ? 'Hide' : 'Show'} Reference
          </button>
          {result.error && (
            <span className="text-xs text-[var(--color-error)]">{result.error}</span>
          )}
          {!result.error && result.matches.length > 0 && (
            <span className="text-xs text-[var(--color-success)]">{result.matches.length} match(es)</span>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">Test String</div>
            <textarea
              value={state.testString}
              onChange={(e) => updateState({ testString: e.target.value })}
              placeholder="Enter text to test against..."
              className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
          <div className="flex w-1/2 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Highlighted Matches
            </div>
            <div
              className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-[var(--color-text)]"
              dangerouslySetInnerHTML={{ __html: highlighted || '<span class="text-[var(--color-text-muted)]">Matches will be highlighted here</span>' }}
            />
          </div>
        </div>

        {result.matches.length > 0 && (
          <div className="max-h-48 shrink-0 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Match Details</div>
            {result.matches.map((m, i) => (
              <div key={i} className="mb-2 flex items-start gap-3 text-xs">
                <span className="shrink-0 text-[var(--color-text-muted)]">#{i + 1} @{m.index}</span>
                <code className="text-[var(--color-accent)]">{m.full}</code>
                {m.groups.length > 0 && (
                  <span className="text-[var(--color-text-muted)]">
                    groups: {m.groups.map((g, j) => (
                      <span key={j}>{g.name ? `${g.name}=` : ''}<code className="text-[var(--color-text)]">{g.value}</code>{j < m.groups.length - 1 ? ', ' : ''}</span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showRef && (
        <div className="w-52 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Reference</h3>
          {REFERENCE.map((r) => (
            <div key={r.pattern} className="mb-1 text-xs">
              <code className="text-[var(--color-accent)]">{r.pattern}</code>
              <span className="ml-1 text-[var(--color-text-muted)]">{r.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Verification:** Type `\d+` with flag `g`, test string "abc 123 def 456" → matches highlighted, details show 2 matches at correct indices. Named groups work. Toggle reference sidebar.

---

## Task 10: cURL → Fetch Converter

**Files:**
- Create: `apps/cockpit/src/tools/curl-to-fetch/CurlToFetch.tsx`

**Context:** PRD 6.21. Parse cURL command → output fetch/axios/ky equivalents.

```typescript
import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CurlToFetchState = {
  input: string
  outputTab: string
}

type ParsedCurl = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

function parseCurl(input: string): ParsedCurl | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('curl')) return null

  let method = 'GET'
  const headers: Record<string, string> = {}
  let body: string | null = null
  let url = ''

  // Normalize multi-line curl commands
  const normalized = trimmed.replace(/\\\n\s*/g, ' ')
  const tokens: string[] = []
  let current = ''
  let inQuote: string | null = null

  for (const char of normalized) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuote = char
    } else if (char === ' ') {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += char
    }
  }
  if (current) tokens.push(current)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === 'curl') continue

    if (token === '-X' || token === '--request') {
      method = tokens[++i]?.toUpperCase() ?? 'GET'
    } else if (token === '-H' || token === '--header') {
      const header = tokens[++i] ?? ''
      const colonIdx = header.indexOf(':')
      if (colonIdx > 0) {
        headers[header.slice(0, colonIdx).trim()] = header.slice(colonIdx + 1).trim()
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      body = tokens[++i] ?? null
      if (method === 'GET') method = 'POST'
    } else if (token === '-u' || token === '--user') {
      const creds = tokens[++i] ?? ''
      headers['Authorization'] = `Basic ${btoa(creds)}`
    } else if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] ?? ''
    } else if (token === '--compressed') {
      headers['Accept-Encoding'] = 'gzip, deflate, br'
    } else if (!token.startsWith('-')) {
      url = token
    }
  }

  if (!url) return null
  return { url, method, headers, body }
}

function toFetch(parsed: ParsedCurl): string {
  const opts: string[] = []
  if (parsed.method !== 'GET') opts.push(`  method: '${parsed.method}',`)

  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }

  if (parsed.body) {
    opts.push(`  body: ${JSON.stringify(parsed.body)},`)
  }

  if (opts.length === 0) {
    return `const response = await fetch('${parsed.url}')`
  }

  return `const response = await fetch('${parsed.url}', {\n${opts.join('\n')}\n})\nconst data = await response.json()`
}

function toAxios(parsed: ParsedCurl): string {
  const opts: string[] = []
  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }
  if (parsed.body) {
    opts.push(`  data: ${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)},`)
  }

  const method = parsed.method.toLowerCase()
  if (opts.length === 0) {
    return `const { data } = await axios.${method}('${parsed.url}')`
  }
  return `const { data } = await axios.${method}('${parsed.url}', {\n${opts.join('\n')}\n})`
}

function toKy(parsed: ParsedCurl): string {
  const opts: string[] = []
  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }
  if (parsed.body) {
    opts.push(`  json: ${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)},`)
  }

  const method = parsed.method.toLowerCase()
  if (opts.length === 0) {
    return `const data = await ky.${method}('${parsed.url}').json()`
  }
  return `const data = await ky.${method}('${parsed.url}', {\n${opts.join('\n')}\n}).json()`
}

const OUTPUT_TABS = [
  { id: 'fetch', label: 'fetch' },
  { id: 'axios', label: 'axios' },
  { id: 'ky', label: 'ky' },
]

export default function CurlToFetch() {
  const [state, updateState] = useToolState<CurlToFetchState>('curl-to-fetch', {
    input: '',
    outputTab: 'fetch',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const parsed = useMemo(() => parseCurl(state.input), [state.input])

  const output = useMemo(() => {
    if (!parsed) return ''
    switch (state.outputTab) {
      case 'fetch': return toFetch(parsed)
      case 'axios': return toAxios(parsed)
      case 'ky': return toKy(parsed)
      default: return toFetch(parsed)
    }
  }, [parsed, state.outputTab])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            cURL Command
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={"curl 'https://api.example.com/data' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"key\": \"value\"}'"}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1">
            <TabBar
              tabs={OUTPUT_TABS}
              activeTab={state.outputTab}
              onTabChange={(id) => updateState({ outputTab: id })}
            />
            <CopyButton text={output} className="mr-2" />
          </div>
          {parsed ? (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-[var(--color-text)]">
              {output}
            </pre>
          ) : state.input.trim() ? (
            <div className="p-4 text-sm text-[var(--color-error)]">Could not parse cURL command</div>
          ) : (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">Paste a cURL command on the left</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Paste a cURL from browser DevTools → see fetch output. Switch tabs → see axios/ky equivalents. Multi-line cURL with backslash continuations works.

---

## Task 11: JSON Schema Validator

**Files:**
- Create: `apps/cockpit/src/tools/json-schema-validator/JsonSchemaValidator.tsx`

**Context:** PRD 6.23. Two Monaco editors (data + schema). Validate on keystroke (debounced). Uses `ajv`.

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useUiStore } from '@/stores/ui.store'

type JsonSchemaState = {
  data: string
  schema: string
}

type ValidationError = {
  path: string
  message: string
}

const TEMPLATES: Record<string, string> = {
  basic: JSON.stringify({
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer', minimum: 0 },
      email: { type: 'string', format: 'email' },
    },
    required: ['name', 'email'],
  }, null, 2),
}

export default function JsonSchemaValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<JsonSchemaState>('json-schema-validator', {
    data: '',
    schema: TEMPLATES.basic ?? '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [valid, setValid] = useState<boolean | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.data.trim() || !state.schema.trim()) {
      setErrors([])
      setValid(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        const data = JSON.parse(state.data)
        const schema = JSON.parse(state.schema)
        const ajv = new Ajv({ allErrors: true, verbose: true })
        addFormats(ajv)
        const validate = ajv.compile(schema)
        const isValid = validate(data)

        if (isValid) {
          setValid(true)
          setErrors([])
          setLastAction('Valid', 'success')
        } else {
          setValid(false)
          const errs = (validate.errors ?? []).map((e) => ({
            path: e.instancePath || '/',
            message: e.message ?? 'Unknown error',
          }))
          setErrors(errs)
          setLastAction(`${errs.length} error(s)`, 'error')
        }
      } catch (e) {
        setValid(false)
        setErrors([{ path: '/', message: (e as Error).message }])
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.data, state.schema, setLastAction])

  const loadTemplate = useCallback((name: string) => {
    const tmpl = TEMPLATES[name]
    if (tmpl) updateState({ schema: tmpl })
  }, [updateState])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            onClick={() => loadTemplate(name)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <div className="ml-auto">
          {valid === true && <span className="text-xs text-[var(--color-success)]">✓ Valid</span>}
          {valid === false && <span className="text-xs text-[var(--color-error)]">✗ Invalid ({errors.length} errors)</span>}
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-[var(--color-error)]">
              <span className="text-[var(--color-text-muted)]">{e.path}</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">JSON Data</div>
          <div className="flex-1">
            <Editor
              language="json"
              value={state.data}
              onChange={(v) => updateState({ data: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">JSON Schema</div>
          <div className="flex-1">
            <Editor
              language="json"
              value={state.schema}
              onChange={(v) => updateState({ schema: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Paste valid JSON matching schema → "Valid". Paste invalid JSON → errors with JSON Pointer paths. Format validation (email) works via `ajv-formats`.

---

## Task 12: CSS Validator

**Files:**
- Create: `apps/cockpit/src/tools/css-validator/CssValidator.tsx`

**Context:** PRD 6.24. Monaco editor with CSS mode. Validate via `css-tree`. Show errors with line numbers.

```typescript
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import * as cssTree from 'css-tree'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CssValidatorState = {
  input: string
}

type CssError = {
  message: string
  line: number
  column: number
}

function validateCss(css: string): CssError[] {
  const errors: CssError[] = []
  try {
    cssTree.parse(css, {
      onParseError: (error) => {
        errors.push({
          message: error.message,
          line: error.line ?? 0,
          column: error.column ?? 0,
        })
      },
    })
  } catch (e) {
    errors.push({ message: (e as Error).message, line: 1, column: 1 })
  }
  return errors
}

export default function CssValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<CssValidatorState>('css-validator', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<CssError[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.input.trim()) {
      setErrors([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const errs = validateCss(state.input)
      setErrors(errs)
      if (errs.length === 0) {
        setLastAction('Valid CSS', 'success')
      } else {
        setLastAction(`${errs.length} error(s)`, 'error')
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {state.input.trim() && errors.length === 0 && (
          <span className="text-xs text-[var(--color-success)]">✓ Valid CSS</span>
        )}
        {errors.length > 0 && (
          <span className="text-xs text-[var(--color-error)]">✗ {errors.length} error(s)</span>
        )}
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-[var(--color-error)]">
              <span className="text-[var(--color-text-muted)]">Line {e.line}:{e.column}</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1">
        <Editor
          language="css"
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
```

**Verification:** Paste valid CSS → "Valid CSS". Paste `color: ;` → error with line number. Validates on keystroke (300ms debounce).

---

## Task 13: HTML Validator

**Files:**
- Create: `apps/cockpit/src/tools/html-validator/HtmlValidator.tsx`

**Context:** PRD 6.25. Monaco editor with HTML mode. Validate via `htmlhint`. Accessibility hints.

```typescript
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type HtmlValidatorState = {
  input: string
}

type HtmlError = {
  message: string
  line: number
  col: number
  type: 'error' | 'warning'
  rule: string
}

// HTMLHint has its own ruleset — import dynamically to avoid bundling issues
async function validateHtml(html: string): Promise<HtmlError[]> {
  const { HTMLHint } = await import('htmlhint')
  const results = HTMLHint.verify(html, {
    'tagname-lowercase': true,
    'attr-lowercase': true,
    'attr-value-double-quotes': true,
    'doctype-first': false,
    'tag-pair': true,
    'spec-char-escape': true,
    'id-unique': true,
    'src-not-empty': true,
    'attr-no-duplication': true,
    'title-require': true,
    'alt-require': true,
    'id-class-value': 'dash',
    'tag-self-close': false,
    'head-script-disabled': false,
    'href-abs-or-rel': false,
    'attr-unsafe-chars': true,
  })

  return results.map((r) => ({
    message: r.message,
    line: r.line,
    col: r.col,
    type: r.type === 'error' ? 'error' as const : 'warning' as const,
    rule: r.rule.id,
  }))
}

export default function HtmlValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<HtmlValidatorState>('html-validator', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<HtmlError[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.input.trim()) {
      setErrors([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const errs = await validateHtml(state.input)
      setErrors(errs)
      const errorCount = errs.filter((e) => e.type === 'error').length
      const warnCount = errs.filter((e) => e.type === 'warning').length
      if (errs.length === 0) {
        setLastAction('Valid HTML', 'success')
      } else {
        setLastAction(`${errorCount} error(s), ${warnCount} warning(s)`, errorCount > 0 ? 'error' : 'info')
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, setLastAction])

  const errorCount = errors.filter((e) => e.type === 'error').length
  const warnCount = errors.filter((e) => e.type === 'warning').length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {state.input.trim() && errors.length === 0 && (
          <span className="text-xs text-[var(--color-success)]">✓ Valid HTML</span>
        )}
        {errorCount > 0 && <span className="text-xs text-[var(--color-error)]">✗ {errorCount} error(s)</span>}
        {warnCount > 0 && <span className="text-xs text-[var(--color-warning)]">⚠ {warnCount} warning(s)</span>}
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className={`text-xs ${e.type === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}>
              <span className="text-[var(--color-text-muted)]">Line {e.line}:{e.col}</span>{' '}
              <span className="text-[var(--color-text-muted)]">[{e.rule}]</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1">
        <Editor
          language="html"
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
```

**Verification:** Paste `<img>` → warning about missing `alt`. Paste unclosed `<div>` → tag-pair error. Valid HTML → green badge.

---

## Task 14: CSS Specificity Calculator

**Files:**
- Create: `apps/cockpit/src/tools/css-specificity/CssSpecificity.tsx`

**Context:** PRD 6.26. Input selectors (one per line). Output specificity scores. Visual bar comparison. Sort by specificity.

```typescript
import { useMemo, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CssSpecificityState = {
  input: string
}

type SpecResult = {
  selector: string
  a: number  // IDs
  b: number  // Classes, attributes, pseudo-classes
  c: number  // Elements, pseudo-elements
  score: number
}

function computeSpecificity(selector: string): { a: number; b: number; c: number } {
  let a = 0, b = 0, c = 0
  // Remove :not() content but count its contents
  let s = selector.replace(/:not\(([^)]+)\)/g, (_, inner) => {
    const inner_spec = computeSpecificity(inner as string)
    a += inner_spec.a; b += inner_spec.b; c += inner_spec.c
    return ''
  })
  // Remove strings and attribute values
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return '' })
  // IDs
  a += (s.match(/#[a-zA-Z_-][\w-]*/g) ?? []).length
  // Classes, pseudo-classes (but not pseudo-elements)
  b += (s.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length
  b += (s.match(/:[a-zA-Z][\w-]*(?!\()/g) ?? []).filter((p) => !p.startsWith('::')).length
  // Elements and pseudo-elements
  c += (s.match(/::[a-zA-Z][\w-]*/g) ?? []).length
  // Remove already-counted items, then count remaining element names
  s = s.replace(/#[a-zA-Z_-][\w-]*/g, '').replace(/\.[a-zA-Z_-][\w-]*/g, '').replace(/:+[a-zA-Z][\w-]*/g, '')
  c += (s.match(/[a-zA-Z][\w-]*/g) ?? []).length

  return { a, b, c }
}

export default function CssSpecificity() {
  const [state, updateState] = useToolState<CssSpecificityState>('css-specificity', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [sorted, setSorted] = useState(false)

  const results = useMemo(() => {
    if (!state.input.trim()) return []
    const lines = state.input.split('\n').map((l) => l.trim()).filter(Boolean)
    const res: SpecResult[] = lines.map((selector) => {
      const spec = computeSpecificity(selector)
      return {
        selector,
        ...spec,
        score: spec.a * 100 + spec.b * 10 + spec.c,
      }
    })
    return sorted ? [...res].sort((x, y) => y.score - x.score) : res
  }, [state.input, sorted])

  const maxScore = useMemo(() => Math.max(...results.map((r) => r.score), 1), [results])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={() => setSorted(!sorted)}
          className={`rounded border px-3 py-1 text-xs ${
            sorted
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          Sort by specificity
        </button>
        {results.length > 0 && (
          <span className="text-xs text-[var(--color-text-muted)]">{results.length} selector(s)</span>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            Selectors (one per line)
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={"#main .content p\n.sidebar a:hover\ndiv > p:first-child\n#nav ul li.active"}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col overflow-auto p-4">
          {results.length > 0 ? (
            <div className="flex flex-col gap-3">
              {results.map((r, i) => (
                <div key={i} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <code className="text-xs text-[var(--color-text)]">{r.selector}</code>
                    <span className="font-mono text-xs font-bold text-[var(--color-accent)]">
                      ({r.a}, {r.b}, {r.c})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-[var(--color-bg)]">
                      <div
                        className="h-2 rounded bg-[var(--color-accent)]"
                        style={{ width: `${(r.score / maxScore) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-[var(--color-text-muted)]">{r.score}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">Enter CSS selectors on the left</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Enter `#id .class p` → shows (1, 1, 1). Multiple selectors → visual bar chart. Sort toggle works.

---

## Task 15: CSS → Tailwind Converter

**Files:**
- Create: `apps/cockpit/src/tools/css-to-tailwind/CssToTailwind.tsx`

**Context:** PRD 6.27. Parse CSS → map properties to Tailwind classes. Show unconvertible properties.

Note: The `css-to-tailwindcss` package from the PRD may not be available or reliable. Instead, we build a focused property mapping — this is more maintainable and avoids a fragile dependency. The mapping covers the most common CSS properties developers encounter.

```typescript
import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CssToTailwindState = {
  input: string
}

type ConversionResult = {
  classes: string[]
  unconvertible: string[]
}

// Core property → Tailwind class mapping
const PROPERTY_MAP: Record<string, Record<string, string>> = {
  display: { flex: 'flex', grid: 'grid', block: 'block', 'inline-block': 'inline-block', inline: 'inline', none: 'hidden', 'inline-flex': 'inline-flex' },
  position: { relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky', static: 'static' },
  'text-align': { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify' },
  'font-weight': { 100: 'font-thin', 200: 'font-extralight', 300: 'font-light', 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black', bold: 'font-bold', normal: 'font-normal' },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  'text-decoration': { underline: 'underline', 'line-through': 'line-through', none: 'no-underline' },
  overflow: { hidden: 'overflow-hidden', auto: 'overflow-auto', scroll: 'overflow-scroll', visible: 'overflow-visible' },
  'overflow-x': { hidden: 'overflow-x-hidden', auto: 'overflow-x-auto', scroll: 'overflow-x-scroll' },
  'overflow-y': { hidden: 'overflow-y-hidden', auto: 'overflow-y-auto', scroll: 'overflow-y-scroll' },
  'flex-direction': { row: 'flex-row', column: 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse' },
  'flex-wrap': { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' },
  'justify-content': { center: 'justify-center', 'flex-start': 'justify-start', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly' },
  'align-items': { center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' },
  cursor: { pointer: 'cursor-pointer', default: 'cursor-default', 'not-allowed': 'cursor-not-allowed', wait: 'cursor-wait', text: 'cursor-text' },
  'white-space': { nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap', normal: 'whitespace-normal' },
  'word-break': { 'break-all': 'break-all', 'keep-all': 'break-keep' },
  'pointer-events': { none: 'pointer-events-none', auto: 'pointer-events-auto' },
  'user-select': { none: 'select-none', all: 'select-all', auto: 'select-auto', text: 'select-text' },
  'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
  visibility: { hidden: 'invisible', visible: 'visible' },
  'list-style-type': { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' },
}

// Size-based properties with arbitrary value support
function convertSizeProperty(prop: string, value: string): string | null {
  const prefix: Record<string, string> = {
    width: 'w', 'min-width': 'min-w', 'max-width': 'max-w',
    height: 'h', 'min-height': 'min-h', 'max-height': 'max-h',
    gap: 'gap', 'row-gap': 'gap-y', 'column-gap': 'gap-x',
    top: 'top', right: 'right', bottom: 'bottom', left: 'left',
    'font-size': 'text', 'line-height': 'leading',
    'border-radius': 'rounded',
    'z-index': 'z', opacity: 'opacity',
  }
  const p = prefix[prop]
  if (!p) return null

  if (value === '100%') return `${p}-full`
  if (value === '100vw') return `${p}-screen`
  if (value === '100vh') return `${p}-screen`
  if (value === 'auto') return `${p}-auto`
  if (value === '0' || value === '0px') return `${p}-0`
  if (value === 'fit-content') return `${p}-fit`
  if (value === 'min-content') return `${p}-min`
  if (value === 'max-content') return `${p}-max`

  return `${p}-[${value}]`
}

function convertSpacingProperty(prop: string, value: string): string | null {
  const prefix: Record<string, string> = {
    margin: 'm', 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml',
    padding: 'p', 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
  }
  const p = prefix[prop]
  if (!p) return null
  if (value === '0' || value === '0px') return `${p}-0`
  if (value === 'auto') return `${p}-auto`
  return `${p}-[${value}]`
}

function convertCssToTailwind(css: string): ConversionResult {
  const classes: string[] = []
  const unconvertible: string[] = []

  // Extract declarations from CSS (strip selectors and braces)
  const declarations = css
    .replace(/\/\*[\s\S]*?\*\//g, '')  // strip comments
    .replace(/[^{]*\{/g, '')           // strip selectors
    .replace(/\}/g, '')                 // strip closing braces
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx < 0) continue
    const prop = decl.slice(0, colonIdx).trim()
    const value = decl.slice(colonIdx + 1).trim()

    // Check direct mapping
    const directMap = PROPERTY_MAP[prop]
    if (directMap) {
      const cls = directMap[value]
      if (cls) { classes.push(cls); continue }
    }

    // Check size properties
    const sizeClass = convertSizeProperty(prop, value)
    if (sizeClass) { classes.push(sizeClass); continue }

    // Check spacing properties
    const spacingClass = convertSpacingProperty(prop, value)
    if (spacingClass) { classes.push(spacingClass); continue }

    // Color properties
    if (prop === 'color') { classes.push(`text-[${value}]`); continue }
    if (prop === 'background-color' || prop === 'background') { classes.push(`bg-[${value}]`); continue }
    if (prop === 'border-color') { classes.push(`border-[${value}]`); continue }

    // Border width
    if (prop === 'border-width' || prop === 'border') {
      if (value === '0' || value === 'none') { classes.push('border-0'); continue }
      classes.push(`border-[${value}]`); continue
    }

    // Couldn't convert
    unconvertible.push(`${prop}: ${value}`)
  }

  return { classes, unconvertible }
}

export default function CssToTailwind() {
  useMonacoTheme()
  const [state, updateState] = useToolState<CssToTailwindState>('css-to-tailwind', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const result = useMemo(() => {
    if (!state.input.trim()) return null
    return convertCssToTailwind(state.input)
  }, [state.input])

  const classString = result?.classes.join(' ') ?? ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">CSS Input</div>
          <div className="flex-1">
            <Editor
              language="css"
              value={state.input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">Tailwind Output</span>
            {classString && <CopyButton text={classString} />}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {result ? (
              <div className="flex flex-col gap-4">
                {result.classes.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-pixel text-xs text-[var(--color-success)]">Converted Classes</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.classes.map((cls, i) => (
                        <code
                          key={i}
                          className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs text-[var(--color-accent)]"
                        >
                          {cls}
                        </code>
                      ))}
                    </div>
                    <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="mb-1 text-xs text-[var(--color-text-muted)]">Full class string:</div>
                      <code className="text-xs text-[var(--color-text)]">{classString}</code>
                    </div>
                  </section>
                )}
                {result.unconvertible.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-pixel text-xs text-[var(--color-warning)]">Unconvertible</h3>
                    {result.unconvertible.map((prop, i) => (
                      <div key={i} className="text-xs text-[var(--color-text-muted)]">{prop}</div>
                    ))}
                  </section>
                )}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">Enter CSS on the left to convert</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Paste `display: flex; justify-content: center; align-items: center; padding: 16px;` → output: `flex justify-center items-center p-[16px]`. Unconvertible properties listed separately.

---

## Task 16: Update Tool Registry (all Plan 3 tools)

**Files:**
- Modify: `apps/cockpit/src/app/tool-registry.ts`

**Steps:**
- [ ] Add lazy imports for all 14 new tools:
  ```typescript
  const CaseConverter = lazy(() => import('@/tools/case-converter/CaseConverter'))
  const ColorConverter = lazy(() => import('@/tools/color-converter/ColorConverter'))
  const TimestampConverter = lazy(() => import('@/tools/timestamp-converter/TimestampConverter'))
  const Base64Tool = lazy(() => import('@/tools/base64/Base64Tool'))
  const UrlCodec = lazy(() => import('@/tools/url-codec/UrlCodec'))
  const CurlToFetch = lazy(() => import('@/tools/curl-to-fetch/CurlToFetch'))
  const HashGenerator = lazy(() => import('@/tools/hash-generator/HashGenerator'))
  const RegexTester = lazy(() => import('@/tools/regex-tester/RegexTester'))
  const JwtDecoder = lazy(() => import('@/tools/jwt-decoder/JwtDecoder'))
  const JsonSchemaValidator = lazy(() => import('@/tools/json-schema-validator/JsonSchemaValidator'))
  const CssValidator = lazy(() => import('@/tools/css-validator/CssValidator'))
  const HtmlValidator = lazy(() => import('@/tools/html-validator/HtmlValidator'))
  const CssSpecificity = lazy(() => import('@/tools/css-specificity/CssSpecificity'))
  const CssToTailwind = lazy(() => import('@/tools/css-to-tailwind/CssToTailwind'))
  ```
- [ ] Update each tool entry's `component` from `Placeholder` to the correct lazy component
- [ ] After update, the only tools still on `Placeholder` should be: `api-client`, `docs-browser`, `snippets` (these are Plan 4)

**Verification:** `npx tsc --noEmit` passes. Every Plan 3 tool loads from the sidebar.

---

## Task 17: Build Verification + Smoke Test

**Files:** None (testing only)

**Steps:**
- [ ] Run `cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit && npx tsc --noEmit` — zero errors
- [ ] Run `bunx vite build` — succeeds
- [ ] Quick spot-check: each of the 14 tools renders without crashing when selected
- [ ] Verify only 3 tools remain on Placeholder: api-client, docs-browser, snippets

**Verification:** All checks pass. Plan 3 is complete.

---

## Execution Notes

### Task Dependencies
```
Task 1 (deps install) → all other tasks
Tasks 2-15 are independent of each other (can be heavily parallelized)
Task 16 (registry) depends on Tasks 2-15
Task 17 (smoke test) depends on all tasks
```

### Parallelization Opportunities
After Task 1 completes:
- **Batch A:** Tasks 2+3+4+5 (Case, Base64, URL, Timestamp — simple string transforms, no deps)
- **Batch B:** Tasks 6+7+8 (Color, Hash, JWT — pure computation)
- **Batch C:** Tasks 9+10 (Regex, cURL — pattern matching/parsing)
- **Batch D:** Tasks 11+12+13+14+15 (Schema, CSS, HTML, Specificity, CSS→TW — need ajv/css-tree/htmlhint/Monaco)
- Then Task 16, then Task 17

### Model Selection for Subagents
- **Task 1:** haiku — mechanical `package.json` edit + `bun install`
- **Tasks 2-5 (Batch A):** sonnet — simple tools with exact code provided, but need to adapt to actual store API
- **Tasks 6-8 (Batch B):** sonnet — same rationale
- **Tasks 9-10 (Batch C):** sonnet — regex tester and cURL parser have moderate complexity
- **Tasks 11-15 (Batch D):** sonnet — involve external libraries (ajv, css-tree, htmlhint) that may need type adjustments
- **Task 16:** haiku — mechanical registry update
- **Task 17:** haiku — run commands and verify output
