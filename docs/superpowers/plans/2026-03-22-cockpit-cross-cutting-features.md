# Cross-Cutting Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining PRD cross-cutting behaviors — toast notifications, file I/O, cross-tool flow, settings panel, window memory, notes pop-out, quick capture, and keyboard shortcuts — then produce a macOS production build.

**Architecture:** A tool action bus (custom events) connects the shell to active tools for Cmd+Enter/Cmd+S/Cmd+O. Toast notifications use a Zustand store with auto-dismiss. File I/O uses Tauri's `@tauri-apps/plugin-fs` dialog APIs. Cross-tool flow adds a "Send to" context menu that routes content between tools. Notes pop-out uses Tauri multi-window. Quick capture uses `tauri-plugin-global-shortcut`.

**Tech Stack:** Tauri 2, React 19, TypeScript 5.9, Zustand 5, Tailwind CSS 4, `@tauri-apps/api` (window, event), `@tauri-apps/plugin-fs` (dialog), `@tauri-apps/plugin-global-shortcut`

---

## File Map

```
New files:
  src/components/shared/Toast.tsx          — Toast notification renderer
  src/components/shared/SendToMenu.tsx     — "Send to [tool]" context menu
  src/components/shell/SettingsPanel.tsx    — Full settings panel (Cmd+,)
  src/lib/tool-actions.ts                  — Tool action bus (custom events)
  src/lib/file-io.ts                       — Open/save file dialog wrappers
  src/hooks/useFileDropZone.ts             — Drag-and-drop file loading hook
  src/hooks/useToolAction.ts               — Hook for tools to register action handlers

Modified files:
  src/stores/ui.store.ts                   — Add toast queue, settingsPanelOpen
  src/hooks/useGlobalShortcuts.ts          — Add Cmd+Enter, Cmd+Shift+C, Cmd+O, Cmd+S, Cmd+,, Cmd+Shift+P, Cmd+1/2/3
  src/components/shell/Workspace.tsx       — Add drag-and-drop zone, pass file content to tools
  src/components/shell/StatusBar.tsx        — Add always-on-top indicator
  src/components/shell/NotesDrawer.tsx      — Add pop-out button per note
  src/app/App.tsx                          — Add Toast, SettingsPanel overlays
  src/app/providers.tsx                    — Initialize window state restore
  src-tauri/src/lib.rs                     — Add global-shortcut plugin
  src-tauri/Cargo.toml                     — Add tauri-plugin-global-shortcut dep
  src-tauri/capabilities/default.json      — Add dialog, global-shortcut permissions
  package.json                             — Add @tauri-apps/plugin-dialog, @tauri-apps/plugin-global-shortcut
```

---

### Task 1: Toast Notification System

**Files:**
- Modify: `apps/cockpit/src/stores/ui.store.ts`
- Create: `apps/cockpit/src/components/shared/Toast.tsx`
- Modify: `apps/cockpit/src/app/App.tsx`

- [ ] **Step 1: Add toast state to UI store**

In `src/stores/ui.store.ts`, add a toast queue with auto-dismiss:

```ts
// Add to existing types
type ToastItem = {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

// Add to UiStore type
toasts: ToastItem[]
addToast: (message: string, type?: ToastItem['type']) => void
removeToast: (id: string) => void
```

Add to the store implementation:

```ts
toasts: [],

addToast: (message, type = 'info') => {
  const id = crypto.randomUUID()
  set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
  setTimeout(() => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }, 3000)
},

removeToast: (id) =>
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
```

Also add `settingsPanelOpen` and `pendingSendTo` to UiStore (needed by Tasks 4 and 5 but define now):

```ts
// Add to UiStore type
settingsPanelOpen: boolean
setSettingsPanelOpen: (open: boolean) => void
toggleSettingsPanel: () => void
pendingSendTo: string | null
setPendingSendTo: (content: string | null) => void
consumePendingSendTo: () => string | null

// Add to implementation
settingsPanelOpen: false,
setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),
pendingSendTo: null,
setPendingSendTo: (content) => set({ pendingSendTo: content }),
consumePendingSendTo: () => {
  const content = get().pendingSendTo
  if (content !== null) set({ pendingSendTo: null })
  return content
},
```

Tools can call `consumePendingSendTo()` on mount to receive cross-tool content without race conditions.

- [ ] **Step 2: Create Toast component**

Create `src/components/shared/Toast.tsx`:

```tsx
import { useUiStore } from '@/stores/ui.store'

const TYPE_STYLES = {
  success: 'border-[var(--color-success)] text-[var(--color-success)]',
  error: 'border-[var(--color-error)] text-[var(--color-error)]',
  info: 'border-[var(--color-accent)] text-[var(--color-accent)]',
} as const

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts)
  const removeToast = useUiStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto animate-fade-in cursor-pointer rounded border bg-[var(--color-surface)] px-4 py-2 font-mono text-xs shadow-lg ${TYPE_STYLES[toast.type]}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Add fade-in animation to CSS**

In `src/index.css`, add after the existing styles:

```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 150ms ease-out;
}
```

- [ ] **Step 4: Wire Toast into App.tsx**

In `src/app/App.tsx`, import and add `<ToastContainer />` after `<CommandPalette />`:

```tsx
import { ToastContainer } from '@/components/shared/Toast'

// In the return, after <CommandPalette />:
<ToastContainer />
```

- [ ] **Step 5: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 2: Tool Action Bus + Extended Shortcuts

**Files:**
- Create: `apps/cockpit/src/lib/tool-actions.ts`
- Create: `apps/cockpit/src/hooks/useToolAction.ts`
- Modify: `apps/cockpit/src/hooks/useGlobalShortcuts.ts`

The tool action bus lets the shell dispatch actions (format, copy-output, switch-tab) to whichever tool is active. Tools subscribe to actions they support.

- [ ] **Step 1: Create tool action bus**

Create `src/lib/tool-actions.ts`:

```ts
/**
 * Lightweight pub/sub for shell→tool communication.
 * Shell dispatches actions via keyboard shortcuts;
 * active tool subscribes to the ones it supports.
 */
export type ToolAction =
  | { type: 'execute' }           // Cmd+Enter — format, send, validate
  | { type: 'copy-output' }       // Cmd+Shift+C
  | { type: 'switch-tab'; tab: number } // Cmd+1/2/3
  | { type: 'open-file'; content: string; filename: string }  // Cmd+O result
  | { type: 'save-file' }         // Cmd+S
  | { type: 'send-to'; content: string }  // Cross-tool flow incoming content

type Listener = (action: ToolAction) => void

const listeners = new Set<Listener>()

export function subscribeToolAction(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function dispatchToolAction(action: ToolAction): void {
  listeners.forEach((fn) => fn(action))
}
```

- [ ] **Step 2: Create useToolAction hook**

Create `src/hooks/useToolAction.ts`:

```ts
import { useEffect, useRef } from 'react'
import { subscribeToolAction, type ToolAction } from '@/lib/tool-actions'

/**
 * Subscribe to tool actions in a component. Handler is stable-ref'd
 * so it can close over current state without re-subscribing.
 */
export function useToolAction(handler: (action: ToolAction) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return subscribeToolAction((action) => handlerRef.current(action))
  }, [])
}
```

- [ ] **Step 3: Extend useGlobalShortcuts with new shortcuts**

In `src/hooks/useGlobalShortcuts.ts`, add the following shortcuts. Import `dispatchToolAction` from `@/lib/tool-actions` and add to existing imports:

```ts
import { dispatchToolAction } from '@/lib/tool-actions'
```

Add these combo definitions alongside the existing ones:

```ts
const comboEnter = useMemo(() => ({ key: 'Enter', mod: true } as const), [])
const comboShiftC = useMemo(() => ({ key: 'c', mod: true, shift: true } as const), [])
const combo1 = useMemo(() => ({ key: '1', mod: true } as const), [])
const combo2 = useMemo(() => ({ key: '2', mod: true } as const), [])
const combo3 = useMemo(() => ({ key: '3', mod: true } as const), [])
const comboComma = useMemo(() => ({ key: ',', mod: true } as const), [])
const comboShiftP = useMemo(() => ({ key: 'p', mod: true, shift: true } as const), [])
```

Add selectors for new store fields:

```ts
const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
```

Add callbacks:

```ts
const execute = useCallback(() => dispatchToolAction({ type: 'execute' }), [])
const copyOutput = useCallback(() => dispatchToolAction({ type: 'copy-output' }), [])
const switchTab1 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 0 }), [])
const switchTab2 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 1 }), [])
const switchTab3 = useCallback(() => dispatchToolAction({ type: 'switch-tab', tab: 2 }), [])

// Static import at the top of the file (not dynamic):
// import { getCurrentWindow } from '@tauri-apps/api/window'

const toggleAlwaysOnTop = useCallback(() => {
  const win = getCurrentWindow()
  const next = !alwaysOnTop
  win.setAlwaysOnTop(next)
  update('alwaysOnTop', next)
}, [alwaysOnTop, update])
```

Add the `useKeyboardShortcut` calls:

```ts
useKeyboardShortcut(comboEnter, execute)
useKeyboardShortcut(comboShiftC, copyOutput)
useKeyboardShortcut(combo1, switchTab1)
useKeyboardShortcut(combo2, switchTab2)
useKeyboardShortcut(combo3, switchTab3)
useKeyboardShortcut(comboComma, toggleSettingsPanel)
useKeyboardShortcut(comboShiftP, toggleAlwaysOnTop)
```

- [ ] **Step 4: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 3: File I/O (Open, Save, Drag-and-Drop)

**Files:**
- Create: `apps/cockpit/src/lib/file-io.ts`
- Create: `apps/cockpit/src/hooks/useFileDropZone.ts`
- Modify: `apps/cockpit/src/hooks/useGlobalShortcuts.ts`
- Modify: `apps/cockpit/src/components/shell/Workspace.tsx`
- Modify: `apps/cockpit/src-tauri/capabilities/default.json`
- Modify: `apps/cockpit/package.json`

- [ ] **Step 1: Add @tauri-apps/plugin-dialog dependency**

Run: `cd apps/cockpit && bun add @tauri-apps/plugin-dialog`

Add Tauri plugin to Rust side. In `src-tauri/Cargo.toml` dependencies, add:

```toml
tauri-plugin-dialog = "2"
```

In `src-tauri/src/lib.rs`, add the plugin:

```rust
.plugin(tauri_plugin_dialog::init())
```

In `src-tauri/capabilities/default.json`, add to permissions array:

```json
"dialog:default",
"fs:allow-read-text-file",
"fs:allow-write-text-file"
```

- [ ] **Step 2: Create file-io.ts helper**

Create `src/lib/file-io.ts`:

```ts
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

/**
 * Show native open-file dialog and return { content, filename }.
 * Returns null if user cancels.
 */
export async function openFileDialog(): Promise<{ content: string; filename: string } | null> {
  const path = await open({
    multiple: false,
    filters: [
      { name: 'Text', extensions: ['txt', 'json', 'xml', 'html', 'css', 'js', 'ts', 'md', 'yaml', 'yml', 'sql', 'csv', 'svg'] },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  const filePath = typeof path === 'string' ? path : path[0]
  if (!filePath) return null
  const content = await readTextFile(filePath)
  const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
  return { content, filename }
}

/**
 * Show native save-file dialog and write content.
 * Returns the saved path, or null if user cancels.
 */
export async function saveFileDialog(
  content: string,
  defaultName?: string
): Promise<string | null> {
  const path = await save({
    defaultPath: defaultName,
    filters: [
      { name: 'Text', extensions: ['txt', 'json', 'xml', 'html', 'css', 'js', 'ts', 'md'] },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  await writeTextFile(path, content)
  return path
}
```

- [ ] **Step 3: Create useFileDropZone hook**

Create `src/hooks/useFileDropZone.ts`.

**Important:** Tauri 2's webview intercepts OS-level drag-and-drop — the browser `FileReader` API does not reliably receive `dataTransfer.files` from Finder/Explorer drops. Use Tauri's `onDragDropEvent` from `@tauri-apps/api/webviewWindow` instead, which delivers file paths that we then read with `readTextFile`.

```ts
import { useEffect, useRef, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readTextFile } from '@tauri-apps/plugin-fs'

/**
 * Listens for Tauri drag-and-drop events on the current webview.
 * Returns isDragging state. Calls onDrop with file content and filename.
 */
export function useFileDropZone(onDrop: (content: string, filename: string) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    let unlisten: (() => void) | undefined

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragging(true)
        } else if (event.payload.type === 'leave') {
          setIsDragging(false)
        } else if (event.payload.type === 'drop') {
          setIsDragging(false)
          const paths = event.payload.paths
          if (paths.length > 0) {
            const filePath = paths[0]!
            const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
            readTextFile(filePath).then((content) => {
              onDropRef.current(content, filename)
            }).catch((err) => {
              console.error('Failed to read dropped file:', err)
            })
          }
        }
      })
      .then((fn) => { unlisten = fn })

    return () => { unlisten?.() }
  }, [])

  return { isDragging }
}
```

- [ ] **Step 4: Add Cmd+O and Cmd+S shortcuts**

In `src/hooks/useGlobalShortcuts.ts`, add:

```ts
import { openFileDialog, saveFileDialog } from '@/lib/file-io'

// Add combos
const comboO = useMemo(() => ({ key: 'o', mod: true } as const), [])
const comboS = useMemo(() => ({ key: 's', mod: true } as const), [])

// Add from ui store
const addToast = useUiStore((s) => s.addToast)

// Add callbacks
const openFile = useCallback(async () => {
  const result = await openFileDialog()
  if (result) {
    dispatchToolAction({ type: 'open-file', content: result.content, filename: result.filename })
    addToast(`Opened ${result.filename}`, 'success')
  }
}, [addToast])

const saveFile = useCallback(() => {
  dispatchToolAction({ type: 'save-file' })
}, [])

// Wire up
useKeyboardShortcut(comboO, openFile)
useKeyboardShortcut(comboS, saveFile)
```

- [ ] **Step 5: Add drop zone overlay to Workspace**

In `src/components/shell/Workspace.tsx`, wrap the workspace with a drop zone and dispatch file content to the active tool:

```tsx
import { useFileDropZone } from '@/hooks/useFileDropZone'
import { dispatchToolAction } from '@/lib/tool-actions'
import { useUiStore } from '@/stores/ui.store'

// Inside the Workspace function, before the return:
const addToast = useUiStore((s) => s.addToast)

const handleFileDrop = useCallback(
  (content: string, filename: string) => {
    dispatchToolAction({ type: 'open-file', content, filename })
    addToast(`Loaded ${filename}`, 'success')
  },
  [addToast]
)
const { isDragging } = useFileDropZone(handleFileDrop)
```

Add a drag overlay (no ref needed — Tauri handles drop at the webview level):

```tsx
<div className="relative flex h-full flex-col overflow-hidden">
  {isDragging && (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm">
      <div className="rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 font-pixel text-sm text-[var(--color-accent)]">
        Drop file here
      </div>
    </div>
  )}
  {/* ... existing content ... */}
</div>
```

- [ ] **Step 6: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 4: Cross-Tool "Send To" Flow

**Files:**
- Create: `apps/cockpit/src/components/shared/SendToMenu.tsx`
- Modify: `apps/cockpit/src/stores/ui.store.ts`

- [ ] **Step 1: Create SendToMenu component**

Create `src/components/shared/SendToMenu.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'
import { dispatchToolAction } from '@/lib/tool-actions'

type Position = { x: number; y: number }

type SendToMenuProps = {
  content: string
  position: Position
  onClose: () => void
}

export function SendToMenu({ content, position, onClose }: SendToMenuProps) {
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const addToast = useUiStore((s) => s.addToast)
  const menuRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')

  const tools = TOOLS.filter(
    (t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Store-based approach: set pendingSendTo in ui store, target tool reads it on mount.
  // This avoids a race condition with lazy-loaded tools that may not be subscribed yet.
  const setPendingSendTo = useUiStore((s) => s.setPendingSendTo)

  const handleSelect = useCallback(
    (toolId: string, toolName: string) => {
      setPendingSendTo(content)
      setActiveTool(toolId)
      addToast(`Sent to ${toolName}`, 'success')
      onClose()
    },
    [content, setActiveTool, setPendingSendTo, addToast, onClose]
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-[var(--color-border)] p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Send to..."
          className="w-full bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleSelect(tool.id, tool.name)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="w-5 text-center font-pixel text-[10px] text-[var(--color-text-muted)]">{tool.icon}</span>
            {tool.name}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add a useSendTo hook for tools to use**

Tools can use this pattern to show the SendToMenu. Add a shared hook at the bottom of `SendToMenu.tsx`:

```tsx
import { createContext, useContext } from 'react'

type SendToContextType = {
  showSendTo: (content: string, position: Position) => void
}

export const SendToContext = createContext<SendToContextType>({
  showSendTo: () => {},
})

export function useSendTo() {
  return useContext(SendToContext)
}
```

- [ ] **Step 3: Provide SendToContext in App.tsx**

In `src/app/App.tsx`, add state for the SendTo menu and wrap children:

```tsx
import { useState, useCallback } from 'react'
import { SendToMenu, SendToContext } from '@/components/shared/SendToMenu'

// Inside App():
const [sendTo, setSendTo] = useState<{ content: string; position: { x: number; y: number } } | null>(null)

const showSendTo = useCallback((content: string, position: { x: number; y: number }) => {
  setSendTo({ content, position })
}, [])

const closeSendTo = useCallback(() => setSendTo(null), [])

// Wrap the return in SendToContext.Provider:
<SendToContext.Provider value={{ showSendTo }}>
  {/* existing layout */}
  {sendTo && <SendToMenu content={sendTo.content} position={sendTo.position} onClose={closeSendTo} />}
</SendToContext.Provider>
```

- [ ] **Step 4: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 5: Settings Panel UI

**Files:**
- Create: `apps/cockpit/src/components/shell/SettingsPanel.tsx`
- Modify: `apps/cockpit/src/app/App.tsx`

- [ ] **Step 1: Create SettingsPanel component**

Create `src/components/shell/SettingsPanel.tsx`:

```tsx
import { useCallback, useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { AppSettings, Theme } from '@/types/models'

const INDENT_OPTIONS = [2, 4] as const
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20] as const
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]
const KEYBINDING_OPTIONS: { value: AppSettings['editorKeybindingMode']; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'vim', label: 'Vim' },
  { value: 'emacs', label: 'Emacs' },
]

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsPanelOpen)
  const setOpen = useUiStore((s) => s.setSettingsPanelOpen)
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)
  const defaultTimezone = useSettingsStore((s) => s.defaultTimezone)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  const handleAlwaysOnTop = useCallback((checked: boolean) => {
    getCurrentWindow().setAlwaysOnTop(checked)
    update('alwaysOnTop', checked)
  }, [update])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={panelRef}
        className="w-full max-w-md rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-pixel text-sm text-[var(--color-accent)]">Settings</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ×
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] px-4">
          {/* Appearance */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Appearance</h3>
            <SettingRow label="Theme">
              <select
                value={theme}
                onChange={(e) => update('theme', e.target.value as Theme)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {THEME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Always on Top">
              <input
                type="checkbox"
                checked={alwaysOnTop}
                onChange={(e) => handleAlwaysOnTop(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
            </SettingRow>
          </div>

          {/* Editor */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Editor</h3>
            <SettingRow label="Font Size">
              <select
                value={editorFontSize}
                onChange={(e) => update('editorFontSize', Number(e.target.value))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {FONT_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Indent Size">
              <select
                value={defaultIndentSize}
                onChange={(e) => update('defaultIndentSize', Number(e.target.value))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {INDENT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s} spaces</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Keybinding Mode">
              <select
                value={editorKeybindingMode}
                onChange={(e) => update('editorKeybindingMode', e.target.value as AppSettings['editorKeybindingMode'])}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {KEYBINDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Format on Paste">
              <input
                type="checkbox"
                checked={formatOnPaste}
                onChange={(e) => update('formatOnPaste', e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
            </SettingRow>
          </div>

          {/* Data */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Data</h3>
            <SettingRow label="History per Tool">
              <input
                type="number"
                value={historyRetentionPerTool}
                onChange={(e) => update('historyRetentionPerTool', Math.max(10, Number(e.target.value)))}
                min={10}
                max={5000}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)]"
              />
            </SettingRow>
            <SettingRow label="Default Timezone">
              <input
                value={defaultTimezone}
                onChange={(e) => update('defaultTimezone', e.target.value)}
                className="w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              />
            </SettingRow>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3 text-right">
          <span className="text-[10px] text-[var(--color-text-muted)]">Changes saved automatically</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire SettingsPanel into App.tsx**

In `src/app/App.tsx`, add:

```tsx
import { SettingsPanel } from '@/components/shell/SettingsPanel'

// In return, after <ToastContainer />:
<SettingsPanel />
```

- [ ] **Step 3: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 6: Window Behavior (Position/Size Memory + Always-on-Top)

**Files:**
- Modify: `apps/cockpit/src/app/providers.tsx`
- Modify: `apps/cockpit/src/components/shell/StatusBar.tsx`

- [ ] **Step 1: Save/restore window position and size**

In `src/app/providers.tsx`, after stores init, restore window bounds and set up save-on-change:

```tsx
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting, setSetting } from '@/lib/db'

// After all store inits complete, inside the .then() block:
// Restore window bounds
type WindowBounds = { x: number; y: number; width: number; height: number }
const bounds = await getSetting<WindowBounds | null>('windowBounds', null)
const win = getCurrentWindow()
if (bounds) {
  await win.setPosition(new (await import('@tauri-apps/api/dpi')).LogicalPosition(bounds.x, bounds.y))
  await win.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(bounds.width, bounds.height))
}

// Restore always-on-top
const settings = useSettingsStore.getState()
if (settings.alwaysOnTop) {
  await win.setAlwaysOnTop(true)
}

// Save window bounds on move/resize (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | undefined
async function saveWindowBounds() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    const pos = await win.outerPosition()
    const size = await win.outerSize()
    await setSetting('windowBounds', {
      x: pos.x, y: pos.y,
      width: size.width, height: size.height,
    })
  }, 1000)
}
win.onMoved(saveWindowBounds)
win.onResized(saveWindowBounds)
```

Note: This code goes inside the existing `init().then(...)` block. The full providers.tsx will need restructuring to accommodate async setup. Convert the init chain to an async function:

```tsx
useEffect(() => {
  async function bootstrap() {
    await init()
    await useNotesStore.getState().init()
    await useSnippetsStore.getState().init()
    await useHistoryStore.getState().init()

    // Window state restore
    const win = getCurrentWindow()
    const bounds = await getSetting<{ x: number; y: number; width: number; height: number } | null>('windowBounds', null)
    if (bounds) {
      const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi')
      await win.setPosition(new LogicalPosition(bounds.x, bounds.y))
      await win.setSize(new LogicalSize(bounds.width, bounds.height))
    }
    const settings = useSettingsStore.getState()
    if (settings.alwaysOnTop) {
      await win.setAlwaysOnTop(true)
    }

    // Save bounds on move/resize
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    async function persistBounds() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        const pos = await win.outerPosition()
        const sz = await win.outerSize()
        await setSetting('windowBounds', { x: pos.x, y: pos.y, width: sz.width, height: sz.height })
      }, 1000)
    }
    win.onMoved(persistBounds)
    win.onResized(persistBounds)
  }

  bootstrap().catch((err) => {
    console.error('Failed to initialize:', err)
    setError(String(err))
  })
}, [init])
```

- [ ] **Step 2: Add window permissions (do this before code that uses them)**

In `src-tauri/capabilities/default.json`, add to the permissions array:

```json
"core:window:allow-outer-position",
"core:window:allow-outer-size",
"core:window:allow-set-focus"
```

- [ ] **Step 3: Add always-on-top indicator to StatusBar**

In `src/components/shell/StatusBar.tsx`, add:

```tsx
const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)

// In the right side of the status bar, before the theme button:
{alwaysOnTop && (
  <span className="text-[var(--color-accent)]" title="Always on top">📌</span>
)}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 7: Notes Pop-Out Windows

**Files:**
- Modify: `apps/cockpit/src/components/shell/NotesDrawer.tsx`
- Modify: `apps/cockpit/src-tauri/capabilities/default.json`

This uses Tauri's `WebviewWindow` API to create a new window per popped-out note. The new window loads the same app URL with a `?note=<id>` query param. The app detects this and renders just the note editor.

- [ ] **Step 1: Create NotePopout route component**

Create `src/components/shell/NotePopout.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { NoteColor } from '@/types/models'

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray']

const COLOR_BG: Record<NoteColor, string> = {
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  pink: 'bg-pink-500/10',
  purple: 'bg-purple-500/10',
  orange: 'bg-orange-500/10',
  red: 'bg-red-500/10',
  gray: 'bg-gray-500/10',
}

export function NotePopout({ noteId }: { noteId: string }) {
  const notes = useNotesStore((s) => s.notes)
  const updateNote = useNotesStore((s) => s.update)
  const initialized = useNotesStore((s) => s.initialized)
  const initNotes = useNotesStore((s) => s.init)
  const initSettings = useSettingsStore((s) => s.init)
  const settingsReady = useSettingsStore((s) => s.initialized)
  const [localTitle, setLocalTitle] = useState('')
  const [localContent, setLocalContent] = useState('')

  // Pop-out windows bypass <Providers>, so init settings (for theme) and notes store here
  useEffect(() => {
    if (!settingsReady) { initSettings() }
    if (!initialized) { initNotes() }
  }, [settingsReady, initialized, initSettings, initNotes])

  const note = notes.find((n) => n.id === noteId)

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title)
      setLocalContent(note.content)
    }
  }, [note?.id]) // Only sync on note change, not every keystroke

  if (!initialized) {
    return <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">Loading...</div>
  }
  if (!note) {
    return <div className="flex h-full items-center justify-center text-[var(--color-error)]">Note not found</div>
  }

  const handleTitleBlur = () => updateNote(noteId, { title: localTitle })
  const handleContentBlur = () => updateNote(noteId, { content: localContent })

  return (
    <div className={`flex h-full flex-col ${COLOR_BG[note.color]}`}>
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-3 py-2" data-tauri-drag-region>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => updateNote(noteId, { color: c })}
            className={`h-3 w-3 rounded-full ${note.color === c ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <input
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="Title"
        className="bg-transparent px-3 py-2 text-sm font-bold text-[var(--color-text)] outline-none"
      />
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        onBlur={handleContentBlur}
        placeholder="Write something..."
        className="flex-1 resize-none bg-transparent px-3 py-1 text-sm text-[var(--color-text)] outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 2: Detect ?note= param in App and render NotePopout**

In `src/app/App.tsx`, add at the top of the `App` function:

```tsx
import { NotePopout } from '@/components/shell/NotePopout'

// At the top of App():
const noteId = new URLSearchParams(window.location.search).get('note')
if (noteId) {
  return <NotePopout noteId={noteId} />
}
```

- [ ] **Step 3: Add pop-out button to NotesDrawer**

In `src/components/shell/NotesDrawer.tsx`, add a pop-out function and button:

```tsx
const handlePopOut = useCallback(async (note: Note) => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const label = `note-${note.id}`
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return
  }
  // Restore saved bounds if available, otherwise center
  const bounds = note.windowBounds
  const noteWindow = new WebviewWindow(label, {
    url: `/?note=${note.id}`,
    title: note.title || 'Note',
    width: bounds?.width ?? 320,
    height: bounds?.height ?? 400,
    x: bounds?.x,
    y: bounds?.y,
    alwaysOnTop: true,
    decorations: true,
    center: !bounds,
  })
  noteWindow.once('tauri://error', (e) => {
    console.error('Failed to create note window:', e)
  })
  // Persist window position/size when moved/resized
  noteWindow.onMoved(async () => {
    const pos = await noteWindow.outerPosition()
    const sz = await noteWindow.outerSize()
    await updateNote(note.id, {
      windowBounds: { x: pos.x, y: pos.y, width: sz.width, height: sz.height },
    })
  })
  noteWindow.onResized(async () => {
    const pos = await noteWindow.outerPosition()
    const sz = await noteWindow.outerSize()
    await updateNote(note.id, {
      windowBounds: { x: pos.x, y: pos.y, width: sz.width, height: sz.height },
    })
  })
  await updateNote(note.id, { poppedOut: true })
  setLastAction('Note popped out', 'info')
}, [updateNote, setLastAction])
```

Add the pop-out button next to the pin button in the note card:

```tsx
<button
  onClick={() => handlePopOut(note)}
  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
  title="Pop out"
>
  ⧉
</button>
```

- [ ] **Step 4: Add webviewWindow permissions**

In `src-tauri/capabilities/default.json`, add:

```json
"core:webview:allow-create-webview-window"
```

Also ensure `tauri.conf.json` CSP doesn't block new windows (it's currently `null` which means no CSP, so this is fine).

- [ ] **Step 5: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 8: Quick Capture Global Hotkey

**Files:**
- Modify: `apps/cockpit/src-tauri/Cargo.toml`
- Modify: `apps/cockpit/src-tauri/src/lib.rs`
- Modify: `apps/cockpit/src-tauri/capabilities/default.json`
- Modify: `apps/cockpit/package.json`
- Modify: `apps/cockpit/src/app/providers.tsx`

This registers a global hotkey (Cmd+Shift+Space on macOS, Ctrl+Shift+Space on Windows) that shows/creates a quick capture window even when the app is in the background.

- [ ] **Step 1: Add global-shortcut plugin dependencies**

In `src-tauri/Cargo.toml` dependencies:

```toml
tauri-plugin-global-shortcut = "2"
```

Run: `cd apps/cockpit && bun add @tauri-apps/plugin-global-shortcut`

- [ ] **Step 2: Register plugin in Rust**

In `src-tauri/src/lib.rs`, add:

```rust
.plugin(tauri_plugin_global_shortcut::Builder::new().build())
```

- [ ] **Step 3: Add permissions**

In `src-tauri/capabilities/default.json`, add:

```json
"global-shortcut:default"
```

- [ ] **Step 4: Register global shortcut in providers.tsx**

In `src/app/providers.tsx`, inside the `bootstrap()` function, after window state restore:

```ts
// Register global quick-capture hotkey
try {
  const { register } = await import('@tauri-apps/plugin-global-shortcut')
  // CommandOrControl is Tauri's standard accelerator — maps to Cmd on macOS, Ctrl on Windows
  await register('CommandOrControl+Shift+Space', async () => {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = 'quick-capture'
    const existing = await WebviewWindow.getByLabel(label)
    if (existing) {
      await existing.setFocus()
      return
    }
    new WebviewWindow(label, {
      url: '/?quick-capture=1',
      title: 'Quick Capture',
      width: 400,
      height: 200,
      alwaysOnTop: true,
      decorations: true,
      center: true,
      resizable: true,
    })
  })
} catch (err) {
  console.warn('Failed to register global shortcut:', err)
}
```

- [ ] **Step 5: Create QuickCapture component**

Create `src/components/shell/QuickCapture.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function QuickCapture() {
  const [content, setContent] = useState('')
  const addNote = useNotesStore((s) => s.add)
  const notesInit = useNotesStore((s) => s.initialized)
  const initNotes = useNotesStore((s) => s.init)
  const settingsInit = useSettingsStore((s) => s.initialized)
  const initSettings = useSettingsStore((s) => s.init)

  // Pop-out windows bypass <Providers>, so init settings (for theme) and notes store
  useEffect(() => {
    if (!settingsInit) { initSettings() }
    if (!notesInit) { initNotes() }
  }, [settingsInit, notesInit, initSettings, initNotes])

  const handleSave = useCallback(async () => {
    if (!content.trim()) return
    await addNote('Quick note', content.trim())
    await getCurrentWindow().close()
  }, [content, addNote])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSave()
      }
      if (e.key === 'Escape') {
        getCurrentWindow().close()
      }
    },
    [handleSave]
  )

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)] p-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Quick note... (Cmd+Enter to save, Esc to close)"
        className="flex-1 resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close())}
          className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!content.trim()}
          className="rounded border border-[var(--color-accent)] px-3 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Detect ?quick-capture= param in App.tsx**

In `src/app/App.tsx`, extend the early return:

```tsx
import { QuickCapture } from '@/components/shell/QuickCapture'

// Extend the existing param check:
const params = new URLSearchParams(window.location.search)
const noteId = params.get('note')
const isQuickCapture = params.has('quick-capture')

if (noteId) return <NotePopout noteId={noteId} />
if (isQuickCapture) return <QuickCapture />
```

- [ ] **Step 7: Verify build**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

---

### Task 9: Production Build + Verification

**Files:**
- Modify: `apps/cockpit/src-tauri/tauri.conf.json` (if needed)

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/cockpit && bunx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run Vite build**

Run: `cd apps/cockpit && bun run build`
Expected: successful build output with chunk sizes listed

- [ ] **Step 3: Run Tauri production build**

Run: `cd apps/cockpit && source "$HOME/.cargo/env" && bun run tauri build`
Expected: `.dmg` and `.app` files output in `src-tauri/target/release/bundle/`

This will take several minutes (Rust release compilation). Expected output location:
- `apps/cockpit/src-tauri/target/release/bundle/dmg/devdrivr_0.1.0_aarch64.dmg`
- `apps/cockpit/src-tauri/target/release/bundle/macos/devdrivr.app`

- [ ] **Step 4: Smoke test the production build**

Open the `.app` bundle and verify:
- App launches, shows the cockpit shell
- Theme toggle works
- Command palette opens (Cmd+K)
- A few tools render correctly
- Notes drawer opens and can create/edit notes
- Settings panel opens (Cmd+,)
- Always-on-top toggle works (Cmd+Shift+P)

---

## Known PRD Conflicts

**Cmd+Shift+T** — PRD §5.3 assigns this to theme toggle, but §7.3 assigns it to "Send to" keyboard trigger. These cannot coexist. Resolution: keep theme toggle on Cmd+Shift+T (it's in the canonical shortcuts table §5.3). The "Send to" flow is accessible via right-click context menu — no dedicated shortcut.

---

## Execution Strategy

**Sequential:** Tasks 1 → 2 (toast and action bus are foundational)

**Parallel Batch A:** Tasks 3 + 4 (file I/O + send-to — independent of each other, both depend on Task 2)

**Parallel Batch B:** Tasks 5 + 6 (settings panel + window behavior — independent)

**Parallel Batch C:** Tasks 7 + 8 (pop-out + quick capture — both use multi-window but are independent)

**Final:** Task 9 (production build — depends on all above)

```
Task 1 → Task 2 → ┬─ Task 3 (Batch A) ─┬→ ┬─ Task 5 (Batch B) ─┬→ ┬─ Task 7 (Batch C) ─┬→ Task 9
                   └─ Task 4 (Batch A) ─┘  └─ Task 6 (Batch B) ─┘  └─ Task 8 (Batch C) ─┘
```
