# CODING PATTERNS — devdrivr cockpit

> Read this before writing any code. These patterns are enforced by the pre-commit hook and TypeScript strict mode.

---

## The Golden Rules

1. **Never call `Database.load()` directly** — use `getDb()` from `@/lib/db`
2. **Never hardcode colors** — use `var(--color-*)` CSS tokens
3. **Never add `React.StrictMode`** — causes double-mount flash in Tauri WebView
4. **Never create new Tauri windows** — IPC capability scoping causes issues
5. **`?worker` imports only** for Web Workers — `new URL() + {type:'module'}` is unreliable in WKWebView

---

## Adding a New Tool

### 1. Create the component
```
src/tools/<your-tool-id>/YourTool.tsx
```

### 2. Register it in the tool registry
```typescript
// src/app/tool-registry.ts
{
  id: 'your-tool-id',
  label: 'Your Tool',
  group: 'convert',           // must match a group id in tool-groups.tsx
  component: React.lazy(() => import('@/tools/your-tool-id/YourTool')),
  keywords: ['keyword1'],     // used by command palette
}
```

### 3. Add to the correct group (if new group)
```typescript
// src/app/tool-groups.tsx
{ id: 'convert', label: 'Convert', icon: ArrowsClockwise }
```

### 4. Tool component template
```typescript
import { useToolState } from '@/hooks/useToolState'
import { useToolAction } from '@/hooks/useToolAction'
import { useUiStore } from '@/stores/ui.store'

type MyToolState = {
  input: string
  output: string
}

export default function MyTool() {
  const [state, updateState] = useToolState<MyToolState>('my-tool-id', {
    input: '',
    output: '',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)

  // Listen for global shortcuts dispatched to this tool
  useToolAction(async (action) => {
    if (action.type === 'execute') await handleRun()
    if (action.type === 'copy-output') navigator.clipboard.writeText(state.output)
    if (action.type === 'open-file') updateState({ input: action.content })
    if (action.type === 'save-file') { /* save state.output */ }
  })

  const handleRun = useCallback(async () => {
    // ... do work ...
    setLastAction('Done', 'success')
  }, [state.input, updateState, setLastAction])

  return <div className="flex h-full flex-col">...</div>
}
```

---

## State Management (Zustand)

### Reading from a store — always use selectors
```typescript
// ✅ Correct — selector prevents unnecessary re-renders
const theme = useSettingsStore((s) => s.theme)
const notes = useNotesStore((s) => s.notes)

// ❌ Wrong — subscribes to entire store
const { theme } = useSettingsStore()
```

### Writing to a store
```typescript
const updateSetting = useSettingsStore((s) => s.update)
await updateSetting('theme', 'dark')   // persists to SQLite automatically
```

### Adding a new setting
1. Add the type to `AppSettings` in `src/types/models.ts`
2. Add default value to `DEFAULT_SETTINGS` in the same file
3. Add to the settings object in `settings.store.ts` → `update()` method

### Writing a new store
```typescript
// Required: idempotent init guard
let initPromise: Promise<void> | null = null

export const useMyStore = create<MyStore>()((set) => ({
  items: [],

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const conn = await getDb()
        const rows = await conn.select<Row[]>('SELECT * FROM my_table')
        set({ items: rows.map(toModel) })
      })()
    }
    return initPromise
  },
}))
```

---

## Tool State Persistence

`useToolState` handles everything — in-memory cache + debounced SQLite write:

```typescript
const [state, updateState] = useToolState<MyState>('my-tool', defaultState)

// Partial update — merges with current state
updateState({ input: newInput })

// Full replacement
updateState({ input: '', output: '', tab: 'result' })
```

**How it works:**
- On mount: check in-memory cache → if miss, load from SQLite
- On update: write to cache synchronously + queue 2s SQLite write
- On unmount: write immediately (cache is already up-to-date)
- This prevents stale state when rapidly switching between tools

---

## Web Workers

### Creating a new worker

**Worker file** (`src/workers/my-task.worker.ts`):
```typescript
import { handleRpc } from './rpc'

const api = {
  async doWork(input: string, options: MyOptions): Promise<string> {
    // ... expensive computation ...
    return result
  },
}

export type MyTaskWorker = typeof api

handleRpc(api)
```

**Using the worker in a tool**:
```typescript
import { useWorker } from '@/hooks/useWorker'
import type { MyTaskWorker } from '@/workers/my-task.worker'
import MyTaskWorkerFactory from '@/workers/my-task.worker?worker'

const worker = useWorker<MyTaskWorker>(
  () => new MyTaskWorkerFactory(),
  ['doWork']   // list every method name
)

// worker is null until the Worker spawns — always guard
const result = worker ? await worker.doWork(input, options) : null
```

**Rules:**
- Always use `?worker` import (not `new URL(...), { type: 'module' }`)
- Always list method names in the `useWorker` call
- Always null-check before calling methods
- No Comlink — `handleRpc` + `useWorker` is the only approved pattern

---

## Theming

### Colors — only use CSS variables
```typescript
// ✅ Correct
className="bg-[var(--color-surface)] text-[var(--color-text)]"
style={{ borderColor: 'var(--color-accent)' }}

// ❌ Wrong
className="bg-zinc-900 text-white"
style={{ borderColor: '#39ff14' }}
```

### Available tokens (defined in `src/index.css`)
```
--color-bg           Main background
--color-surface      Card/panel background
--color-surface-hover  Hover state for panels
--color-border       Border color
--color-text         Primary text
--color-text-muted   Dimmed/secondary text
--color-accent       Brand green (neon in dark, teal in light)
--color-accent-dim   Accent with low opacity (hover backgrounds)
--color-error        Error red
```

### Applying theme programmatically
```typescript
import { applyTheme } from '@/lib/theme'
// Only call inside async init functions — never at module level
applyTheme('dark')   // 'dark' | 'light' | 'system'
```

---

## Database Access

### Always use `getDb()` — never `Database.load()` directly
```typescript
import { getDb } from '@/lib/db'

const conn = await getDb()
const rows = await conn.select<MyRow[]>('SELECT * FROM my_table WHERE id = $1', [id])
await conn.execute('INSERT INTO my_table VALUES ($1, $2)', [id, value])
```

### Existing helper functions in `db.ts`
```typescript
getSetting<T>(key, fallback)    // Get a settings value
setSetting(key, value)          // Set a settings value (JSON serialized)
saveNote(note)                  // Upsert a note
loadNotes()                     // Load all notes
saveSnippet(snippet)            // Upsert a snippet
loadSnippets()                  // Load all snippets
addHistoryEntry(entry)          // Insert + prune history
loadHistory(tool, limit)        // Load recent history for a tool
```

---

## Keyboard Shortcuts

### Tool-local shortcut (responds only when tool is active)
```typescript
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

// Cmd+Enter to run
useKeyboardShortcut({ key: 'Enter', mod: true }, handleRun)

// Cmd+Shift+F to format
useKeyboardShortcut({ key: 'f', mod: true, shift: true }, handleFormat)
```

**Note:** Shortcuts are automatically suppressed when focus is in an editable field (input, textarea, Monaco editor) unless a modifier key is held.

### Global shortcut (add to `useGlobalShortcuts.ts`)
```typescript
// src/hooks/useGlobalShortcuts.ts
useKeyboardShortcut({ key: 'p', mod: true, shift: true }, () => {
  useUiStore.getState().toggleAlwaysOnTop()
})
```

### Tool action dispatch (shell → active tool)
```typescript
import { dispatchToolAction } from '@/lib/tool-actions'

// From anywhere in the shell:
dispatchToolAction({ type: 'execute' })
dispatchToolAction({ type: 'send-to', content: 'some text' })

// In the tool component:
useToolAction((action) => {
  if (action.type === 'send-to') updateState({ input: action.content })
})
```

---

## Window / DPI

### Converting physical to logical pixels (required for Retina)
```typescript
const factor = await win.scaleFactor()
const pos = await win.outerPosition()          // physical pixels
const sz = await win.outerSize()               // physical pixels
const logicalPos = pos.toLogical(factor)       // logical
const logicalSz = sz.toLogical(factor)         // logical
```

**Never** pass raw `outerPosition`/`outerSize` values to `setPosition`/`setSize` — they'll be doubled on Retina screens.

---

## Icons

Always use Phosphor Icons — never inline SVGs or emoji:
```typescript
import { ArrowRight, Clipboard, Lightning } from '@phosphor-icons/react'

<ArrowRight size={16} weight="bold" />
<Clipboard size={14} weight="duotone" />
```

Available weights: `thin`, `light`, `regular`, `bold`, `fill`, `duotone`

---

## TypeScript Strict Mode

This codebase runs with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

```typescript
// Array access may be undefined — must check
const items = ['a', 'b', 'c']
const first = items[0]   // type: string | undefined
if (first !== undefined) console.log(first.toUpperCase())

// Optional properties are exact
type Config = { label?: string }
const c: Config = { label: undefined }  // ✅
const c2: Config = {}                   // ✅
// c.label = undefined is an assignment to an absent key — careful
```

### `any` is forbidden — except in worker files (plugin types)
```typescript
// ✅ Worker plugin lists only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plugins: any[] = [prettierPluginBabel, ...]

// ✅ Escape hatch with a comment explaining why
const result = (value as unknown as Record<string, string>)['key']

// ❌ Silently typed any
const result: any = doSomething()
```

---

## File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Tool component | `PascalCase.tsx` | `CodeFormatter.tsx` |
| Worker | `kebab-case.worker.ts` | `formatter.worker.ts` |
| Hook | `useCamelCase.ts` | `useToolState.ts` |
| Store | `kebab-case.store.ts` | `settings.store.ts` |
| Library | `kebab-case.ts` | `tool-actions.ts` |
| Type file | `kebab-case.ts` | `models.ts` |

---

## Prettier Config (`.prettierrc`)

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
```
