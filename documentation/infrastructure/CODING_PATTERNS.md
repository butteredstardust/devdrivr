# CODING PATTERNS — devdrivr

> Use these patterns when you change the app. The pre-commit hook and TypeScript strict mode check them.

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

Create the tool component at this path.

```
src/tools/<your-tool-id>/YourTool.tsx
```

### 2. Register it in the tool registry

Register the tool so the workspace can open it.

```typescript
// src/app/tool-registry.ts
{
  id: 'your-tool-id',
  name: 'Your Tool',
  group: 'convert',           // must match a group id in tool-groups.tsx
  component: React.lazy(() => import('@/tools/your-tool-id/YourTool')),
  keywords: ['keyword1'],     // used by command palette
}
```

### 3. Add to the correct group (if new group)

Add group metadata only when the group is new.

```typescript
// src/app/tool-groups.tsx
{ id: 'convert', label: 'Convert', icon: ArrowsClockwise }
```

### 4. Tool component template

Use this template for state, actions, and feedback.

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

Use selectors to limit component updates.

```typescript
// ✅ Correct — selector prevents unnecessary re-renders
const theme = useSettingsStore((s) => s.theme)
const notes = useNotesStore((s) => s.notes)

// ❌ Wrong — subscribes to entire store
const { theme } = useSettingsStore()
```

### Writing to a store

Call the store action to update persisted state.

```typescript
const updateSetting = useSettingsStore((s) => s.update)
await updateSetting('theme', 'dark') // persists to SQLite automatically
```

### Adding a new setting

Add every setting in these three locations.

1. Add the type to `AppSettings` in `src/types/models.ts`
2. Add default value to `DEFAULT_SETTINGS` in the same file
3. Add to the settings object in `settings.store.ts` → `update()` method

### Writing a new store

Use the promise guard to run initialization once.

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

`useToolState` stores tool state in memory and writes it to SQLite after a delay.

```typescript
const [state, updateState] = useToolState<MyState>('my-tool', defaultState)

// Partial update — merges with current state
updateState({ input: newInput })

// Full replacement
updateState({ input: '', output: '', tab: 'result' })
```

**Operation:**

- On mount, check the in-memory cache. Load SQLite when the cache has no state.
- On update, write the cache immediately. Queue the SQLite write for 2 seconds later.
- On unmount, write pending state immediately.
- This keeps state current during fast tool changes.

---

## Web Workers

### Creating a new worker

Create the worker API first. Then create and check the worker in its tool.

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
  ['doWork'] // list every method name
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

Use CSS variables so themes update correctly.

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
--color-warning      Warning amber
--color-success      Success green
--color-info         Informational purple/blue
--color-shadow       Box shadow base color (rgba)
```

### Applying theme programmatically

Call `applyTheme()` only during asynchronous initialization.

```typescript
import { applyTheme } from '@/lib/theme'
// Only call inside async init functions — never at module level
applyTheme('dark') // 'dark' | 'light' | 'system'
```

---

## Database Access

### Always use `getDb()` — never `Database.load()` directly

Use the shared connection to keep database access consistent.

```typescript
import { getDb } from '@/lib/db'

const conn = await getDb()
const rows = await conn.select<MyRow[]>('SELECT * FROM my_table WHERE id = $1', [id])
await conn.execute('INSERT INTO my_table VALUES ($1, $2)', [id, value])
```

### Existing helper functions in `db.ts`

Use these helpers for common database operations.

```typescript
getSetting<T>(key, fallback) // Get a settings value
setSetting(key, value) // Set a settings value (JSON serialized)
saveNote(note) // Upsert a note
loadNotes() // Load all notes
saveSnippet(snippet) // Upsert a snippet
loadSnippets() // Load all snippets
addHistoryEntry(entry) // Insert + prune history
loadHistory(tool, limit) // Load recent history for a tool
```

---

## Keyboard Shortcuts

### Tool-local shortcut (responds only when tool is active)

Register tool-local shortcuts in the active tool.

```typescript
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

// Cmd+Enter to run
useKeyboardShortcut({ key: 'Enter', mod: true }, handleRun)

// Cmd+Shift+F to format
useKeyboardShortcut({ key: 'f', mod: true, shift: true }, handleFormat)
```

**Note:** Editable fields suppress shortcuts without modifier keys. This includes inputs, textareas, and the Monaco editor.

### Global shortcut (add to `useGlobalShortcuts.ts`)

Register workspace shortcuts in `useGlobalShortcuts.ts`.

```typescript
// src/hooks/useGlobalShortcuts.ts
useKeyboardShortcut({ key: 'p', mod: true, shift: true }, () => {
  useUiStore.getState().toggleAlwaysOnTop()
})
```

### Tool action dispatch (shell → active tool)

Dispatch an action from the shell. Receive it in the active tool.

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

Convert values before you save window geometry.

```typescript
const factor = await win.scaleFactor()
const pos = await win.outerPosition() // physical pixels
const sz = await win.outerSize() // physical pixels
const logicalPos = pos.toLogical(factor) // logical
const logicalSz = sz.toLogical(factor) // logical
```

**WARNING:** Do not pass raw `outerPosition` or `outerSize` values to setters. Retina screens double them.

---

## Drag to Reorder — use pointer events, never HTML5 drag-and-drop

`dragDropEnabled` stays `true` to deliver OS file drops to `useFileDropZone`.
The native handler swallows in-page `dragover` and `drop` events. HTML5 dragging cannot reorder items.
It can also show **"File drop is not supported by the active tool"** during an in-app drag.
Use pointer events for reordering. They work with the native file-drop handler.

```tsx
// pointerdown on the handle records an origin; it does not start a drag yet
const dragOrigin = useRef<{ id: string; y: number } | null>(null)
// window-level pointermove/pointerup, so the gesture survives the pointer
// leaving the element — and refs, not state, because a pointerup can arrive in
// the same task as the pointermove before it, ahead of any re-render
```

Use these requirements:

- **Keep gesture state in refs.** Use `useState` only to paint the result.
- **Require a small movement threshold** (~4px). This keeps clicks working.
- **Suppress the trailing click.** Let the suppressor expire without a click.
- **Listen for `pointercancel` and window `blur`.** Clear interrupted gestures.
- **Hit-test rendered items** against the pointer midpoint. The list can move below the pointer.
- Add `touch-none` to the handle. This prevents scroll handling.

See `WorkspaceTabStrip.tsx` for horizontal tabs. See `NotesDrawer.tsx` for grouped vertical notes.
Do not move a note between pinned and unpinned groups.

jsdom has no layout. Stub `getBoundingClientRect` in tests. Then use `pointerDown`, `pointerMove`, and `pointerUp`.
See `layOutNotes` and `dragNote` in `NotesDrawer.test.tsx`.

---

## Icons

Use Phosphor Icons. Do not use inline SVGs or emoji.

```typescript
import { ArrowRight, Clipboard, Lightning } from '@phosphor-icons/react'

<ArrowRight size={16} weight="bold" />
<Clipboard size={14} weight="duotone" />
```

Use these weights: `thin`, `light`, `regular`, `bold`, `fill`, `duotone`.

---

## TypeScript Strict Mode

The project enables `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

```typescript
// Array access may be undefined — must check
const items = ['a', 'b', 'c']
const first = items[0] // type: string | undefined
if (first !== undefined) console.log(first.toUpperCase())

// Optional properties are exact
type Config = { label?: string }
const c: Config = { label: undefined } // ✅
const c2: Config = {} // ✅
// c.label = undefined is an assignment to an absent key — careful
```

### `any` is forbidden — except in worker files (plugin types)

Use a concrete type. Use `any` only for worker plugin lists.

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

| Type           | Convention             | Example               |
| -------------- | ---------------------- | --------------------- |
| Tool component | `PascalCase.tsx`       | `CodeFormatter.tsx`   |
| Worker         | `kebab-case.worker.ts` | `formatter.worker.ts` |
| Hook           | `useCamelCase.ts`      | `useToolState.ts`     |
| Store          | `kebab-case.store.ts`  | `settings.store.ts`   |
| Library        | `kebab-case.ts`        | `tool-actions.ts`     |
| Type file      | `kebab-case.ts`        | `models.ts`           |

---

## Prettier Config (`.prettierrc`)

Use this formatting configuration.

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always"
}
```
