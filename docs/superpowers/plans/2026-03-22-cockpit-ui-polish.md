# Cockpit UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the cockpit shell from functional-but-basic to professional-with-personality through Phosphor icons, semantic colors, design tokens, standardized components, and discoverability features.

**Architecture:** Shell-first approach — modify only shell components (sidebar, workspace header, status bar, command palette, settings) and shared components. Tool internals stay as-is. Add `@phosphor-icons/react` for icons. Expand CSS design tokens for surface layering and functional colors. Create shared Button/Toggle components. Add sidebar action bar and keyboard shortcuts modal.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, `@phosphor-icons/react`, Zustand 5, Vitest

**Spec:** `docs/superpowers/specs/2026-03-22-cockpit-ui-polish-design.md`

---

## File Structure

### New Files
- `apps/cockpit/src/components/shared/Button.tsx` — Shared button with primary/secondary/ghost variants
- `apps/cockpit/src/components/shared/Toggle.tsx` — Binary switch replacing checkboxes
- `apps/cockpit/src/components/shell/ShortcutsModal.tsx` — Keyboard shortcuts cheatsheet modal
- `apps/cockpit/src/components/shell/SidebarFooter.tsx` — Action bar with Notes/Settings/Shortcuts buttons

### Modified Files
- `apps/cockpit/src/index.css` — Expanded color tokens, surface layering, shadow variable
- `apps/cockpit/src/types/tools.ts` — Icon type change (`string | ReactNode`), group icon to `ReactNode`
- `apps/cockpit/src/app/tool-registry.ts` — No changes to tool entries (icons stay as strings)
- `apps/cockpit/src/components/shell/Sidebar.tsx` — Add SidebarFooter, shadows, layout restructure
- `apps/cockpit/src/components/shell/SidebarGroup.tsx` — Phosphor CaretRight icon, typography bump
- `apps/cockpit/src/components/shell/SidebarItem.tsx` — Dual icon rendering (string vs ReactNode), active border
- `apps/cockpit/src/components/shell/StatusBar.tsx` — Remove theme toggle, simplify
- `apps/cockpit/src/components/shell/Workspace.tsx` — Typography bump in tool header
- `apps/cockpit/src/components/shell/CommandPalette.tsx` — Surface-raised background
- `apps/cockpit/src/components/shell/SettingsPanel.tsx` — Surface-raised background, checkboxes → toggles, Phosphor close icon
- `apps/cockpit/src/components/shared/Toast.tsx` — Surface-raised background
- `apps/cockpit/src/stores/ui.store.ts` — Add shortcutsModalOpen state
- `apps/cockpit/src/hooks/useGlobalShortcuts.ts` — Add Cmd+/ binding
- `apps/cockpit/src/app/App.tsx` — Render ShortcutsModal
- `apps/cockpit/package.json` — Add `@phosphor-icons/react`

---

### Task 1: Semantic Color System + Surface Layering

**Files:**
- Modify: `apps/cockpit/src/index.css`

- [ ] **Step 1: Update dark mode CSS variables**

In `apps/cockpit/src/index.css`, replace the `:root` block:

```css
:root {
  --color-bg: #0a0a0a;
  --color-surface: #181818;
  --color-surface-raised: #1e1e1e;
  --color-surface-hover: #282828;
  --color-border: #333333;
  --color-text: #e0e0e0;
  --color-text-muted: #888888;
  --color-accent: #39ff14;
  --color-accent-dim: #1a7a0a;
  --color-info: #3b82f6;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
  --color-success: #22c55e;
  --color-shadow: rgba(0,0,0,0.4);
}
```

Note: `--color-surface` set to `#181818` (not `#141414` from spec — bumped after review for contrast at low brightness). `--color-success` is now distinct from `--color-accent`.

- [ ] **Step 2: Update light mode CSS variables**

Replace the `.light` block:

```css
.light {
  --color-bg: #faf8f0;
  --color-surface: #f5f3eb;
  --color-surface-raised: #ffffff;
  --color-surface-hover: #ece9e0;
  --color-border: #d4d0c8;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
  --color-accent: #00875a;
  --color-accent-dim: #b3e0d0;
  --color-info: #2563eb;
  --color-error: #dc2626;
  --color-warning: #d97706;
  --color-success: #16a34a;
  --color-shadow: rgba(0,0,0,0.1);
}
```

- [ ] **Step 3: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS (CSS-only changes, no TS impact)

- [ ] **Step 4: Visually verify in dev mode**

Run: `cd /Users/tuxgeek/Dev/devdrivr && bun run desktop`
Expected: App launches. Dark mode shows slightly different surface tone. Sidebar should look subtly different from workspace background. Toggle to light mode via Cmd+Shift+T — verify warmer tones.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/index.css
git commit -m "feat(cockpit): expand semantic color system with surface layering and functional states"
```

---

### Task 2: Install Phosphor Icons + Update Type Definitions

**Files:**
- Modify: `apps/cockpit/package.json`
- Modify: `apps/cockpit/src/types/tools.ts`

- [ ] **Step 1: Install Phosphor Icons**

Run: `cd apps/cockpit && bun add @phosphor-icons/react`

- [ ] **Step 2: Update types and extract TOOL_GROUPS**

Replace the **entire contents** of `apps/cockpit/src/types/tools.ts` with (removing `TOOL_GROUPS` from this file — it moves to `tool-groups.tsx`):

```ts
import type { LazyExoticComponent, ComponentType, ReactNode } from 'react'

export type ToolGroup = 'code' | 'data' | 'web' | 'convert' | 'test' | 'network' | 'write'

export type ToolDefinition = {
  id: string
  name: string
  group: ToolGroup
  icon: string | ReactNode
  description: string
  component: LazyExoticComponent<ComponentType>
}

export type ToolGroupMeta = {
  id: ToolGroup
  label: string
  icon: ReactNode
}
```

Create `apps/cockpit/src/app/tool-groups.tsx`:

```tsx
import type { ToolGroupMeta } from '@/types/tools'
import { Code, Database, Globe, ArrowsLeftRight, CheckCircle, WifiHigh, PencilSimple } from '@phosphor-icons/react'

export const TOOL_GROUPS: ToolGroupMeta[] = [
  { id: 'code', label: 'Code', icon: <Code size={14} /> },
  { id: 'data', label: 'Data', icon: <Database size={14} /> },
  { id: 'web', label: 'Web', icon: <Globe size={14} /> },
  { id: 'convert', label: 'Convert', icon: <ArrowsLeftRight size={14} /> },
  { id: 'test', label: 'Test', icon: <CheckCircle size={14} /> },
  { id: 'network', label: 'Network', icon: <WifiHigh size={14} /> },
  { id: 'write', label: 'Write', icon: <PencilSimple size={14} /> },
]
```

- [ ] **Step 3: Update Sidebar.tsx import**

In `apps/cockpit/src/components/shell/Sidebar.tsx`, change:
```ts
import { TOOL_GROUPS } from '@/types/tools'
```
to:
```ts
import { TOOL_GROUPS } from '@/app/tool-groups'
```

Remove `TOOL_GROUPS` from `types/tools.ts` (it no longer exports the array, only types).

- [ ] **Step 4: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/package.json apps/cockpit/src/types/tools.ts apps/cockpit/src/app/tool-groups.tsx apps/cockpit/src/components/shell/Sidebar.tsx
git commit -m "feat(cockpit): add Phosphor icons package and update tool type definitions"
```

---

### Task 3: Shared Button Component

**Files:**
- Create: `apps/cockpit/src/components/shared/Button.tsx`

- [ ] **Step 1: Create Button component**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-[var(--color-bg)] font-pixel hover:brightness-110 active:brightness-90',
  secondary:
    'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
  ghost:
    'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-4 py-2 text-xs',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
```

- [ ] **Step 2: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/cockpit/src/components/shared/Button.tsx
git commit -m "feat(cockpit): add shared Button component with primary/secondary/ghost variants"
```

---

### Task 4: Shared Toggle Component

**Files:**
- Create: `apps/cockpit/src/components/shared/Toggle.tsx`

- [ ] **Step 1: Create Toggle component**

```tsx
import { useId } from 'react'

type ToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-xs text-[var(--color-text)]">
          {label}
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/cockpit/src/components/shared/Toggle.tsx
git commit -m "feat(cockpit): add shared Toggle switch component"
```

---

### Task 5: Update Shell Components — Sidebar, SidebarGroup, SidebarItem

**Files:**
- Modify: `apps/cockpit/src/components/shell/Sidebar.tsx`
- Modify: `apps/cockpit/src/components/shell/SidebarGroup.tsx`
- Modify: `apps/cockpit/src/components/shell/SidebarItem.tsx`

- [ ] **Step 1: Update SidebarGroup with Phosphor caret and typography**

In `apps/cockpit/src/components/shell/SidebarGroup.tsx`:

```tsx
import { useState } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { CaretRight } from '@phosphor-icons/react'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
}

export function SidebarGroup({ group, tools }: SidebarGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-2 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <CaretRight
          size={10}
          className={`shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="font-pixel">{group.label}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-1">
          {tools.map((tool) => (
            <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update SidebarItem with dual icon rendering and active border**

In `apps/cockpit/src/components/shell/SidebarItem.tsx`:

```tsx
import { type ReactNode, isValidElement } from 'react'
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: string | ReactNode
}

export function SidebarItem({ id, name, icon }: SidebarItemProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const isActive = activeTool === id

  return (
    <button
      onClick={() => setActiveTool(id)}
      title={name}
      className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-xs transition-colors ${
        isActive
          ? 'border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-dim)] pl-1.5 text-[var(--color-accent)]'
          : 'border-l-2 border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
      }`}
    >
      {isValidElement(icon) ? (
        <span className="flex w-5 shrink-0 items-center justify-center">{icon}</span>
      ) : (
        <span className="w-5 shrink-0 text-center font-pixel text-[10px]">{icon}</span>
      )}
      <span className="truncate">{name}</span>
    </button>
  )
}
```

- [ ] **Step 3: Update Sidebar with shadow, typography, and scroll layout**

In `apps/cockpit/src/components/shell/Sidebar.tsx`:

```tsx
import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarGroup } from './SidebarGroup'

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[2px_0_8px_-2px_var(--color-shadow)]">
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.id}
            className="mb-2 flex h-7 w-7 items-center justify-center text-[var(--color-text-muted)]"
            title={group.label}
          >
            {group.icon}
          </div>
        ))}
      </aside>
    )
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[2px_0_8px_-2px_var(--color-shadow)]">
      <div className="px-3 py-3">
        <h1 className="font-pixel text-base font-bold text-[var(--color-accent)]">devdrivr</h1>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {TOOL_GROUPS.map((group) => {
          const tools = TOOLS.filter((t) => t.group === group.id)
          return <SidebarGroup key={group.id} group={group} tools={tools} />
        })}
      </div>
    </aside>
  )
}
```

Note: The sidebar footer (Notes/Settings/Shortcuts buttons) will be added in Task 8 after the ShortcutsModal exists. For now the sidebar has the scroll layout ready (`flex-1 overflow-y-auto` for tool groups).

- [ ] **Step 4: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/components/shell/Sidebar.tsx apps/cockpit/src/components/shell/SidebarGroup.tsx apps/cockpit/src/components/shell/SidebarItem.tsx
git commit -m "feat(cockpit): update sidebar with Phosphor icons, depth shadows, and active border"
```

---

### Task 6: Update StatusBar, Workspace Header, CommandPalette, Toast, SettingsPanel

**Files:**
- Modify: `apps/cockpit/src/components/shell/StatusBar.tsx`
- Modify: `apps/cockpit/src/components/shell/Workspace.tsx`
- Modify: `apps/cockpit/src/components/shell/CommandPalette.tsx`
- Modify: `apps/cockpit/src/components/shared/Toast.tsx`
- Modify: `apps/cockpit/src/components/shell/SettingsPanel.tsx`

- [ ] **Step 1: Simplify StatusBar (remove theme toggle, use Phosphor PushPin)**

In `apps/cockpit/src/components/shell/StatusBar.tsx`:

```tsx
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getToolById } from '@/app/tool-registry'
import { PushPin } from '@phosphor-icons/react'

export function StatusBar() {
  const activeTool = useUiStore((s) => s.activeTool)
  const lastAction = useUiStore((s) => s.lastAction)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const tool = getToolById(activeTool)

  const actionColor =
    lastAction?.type === 'error'
      ? 'text-[var(--color-error)]'
      : lastAction?.type === 'success'
        ? 'text-[var(--color-success)]'
        : 'text-[var(--color-text-muted)]'

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px]">
      <div className="flex items-center gap-3">
        <span className="text-[var(--color-text-muted)]">{tool?.name ?? ''}</span>
        {lastAction && (
          <span className={actionColor}>{lastAction.message}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {alwaysOnTop && (
          <PushPin size={12} weight="fill" className="text-[var(--color-accent)]" />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update Workspace header typography**

In `apps/cockpit/src/components/shell/Workspace.tsx`, change the tool header text from `text-xs` to `text-sm`:

```tsx
<span className="font-pixel text-sm text-[var(--color-accent)]">{tool.name}</span>
```

(Only this one line changes — find `text-xs` in the header `<span>` and replace with `text-sm`.)

- [ ] **Step 3: Update CommandPalette to use surface-raised**

In `apps/cockpit/src/components/shell/CommandPalette.tsx`, change the panel container class (the `<div>` with `w-[500px]`):

- Change `bg-[var(--color-surface)]` to `bg-[var(--color-surface-raised)]`
- Change `shadow-2xl` to `shadow-lg`

- [ ] **Step 4: Update Toast to use surface-raised**

In `apps/cockpit/src/components/shared/Toast.tsx`, change:

From: `bg-[var(--color-surface)]`
To: `bg-[var(--color-surface-raised)]`

This is on the toast `<div>` at line 22.

- [ ] **Step 5: Update SettingsPanel — surface-raised, Toggle, Phosphor close icon**

In `apps/cockpit/src/components/shell/SettingsPanel.tsx`:

Add imports at top:
```tsx
import { X } from '@phosphor-icons/react'
import { Toggle } from '@/components/shared/Toggle'
```

Change the modal container `bg-[var(--color-surface)]` to `bg-[var(--color-surface-raised)]` (find the `<div>` with `max-w-md rounded border`).

Find the close button that renders `×` and replace with:
```tsx
<button
  onClick={() => setOpen(false)}
  className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
>
  <X size={16} />
</button>
```

Find the "Always on Top" `<SettingRow>` containing `<input type="checkbox"` and replace the entire row with:
```tsx
<SettingRow label="Always on Top">
  <Toggle checked={alwaysOnTop} onChange={handleAlwaysOnTop} />
</SettingRow>
```

Find the "Format on Paste" `<SettingRow>` containing `<input type="checkbox"` and replace the entire row with:
```tsx
<SettingRow label="Format on Paste">
  <Toggle checked={formatOnPaste} onChange={(v) => update('formatOnPaste', v)} />
</SettingRow>
```

Remove the `accent-[var(--color-accent)]` checkbox inputs entirely.

- [ ] **Step 6: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/cockpit/src/components/shell/StatusBar.tsx apps/cockpit/src/components/shell/Workspace.tsx apps/cockpit/src/components/shell/CommandPalette.tsx apps/cockpit/src/components/shared/Toast.tsx apps/cockpit/src/components/shell/SettingsPanel.tsx
git commit -m "feat(cockpit): apply surface layering, Phosphor icons, and Toggle to shell components"
```

---

### Task 7: Keyboard Shortcuts Modal

**Files:**
- Create: `apps/cockpit/src/components/shell/ShortcutsModal.tsx`
- Modify: `apps/cockpit/src/stores/ui.store.ts`
- Modify: `apps/cockpit/src/hooks/useGlobalShortcuts.ts`
- Modify: `apps/cockpit/src/app/App.tsx`

- [ ] **Step 1: Add shortcutsModalOpen state to ui.store.ts**

In `apps/cockpit/src/stores/ui.store.ts`, add to the `UiStore` type:

```ts
shortcutsModalOpen: boolean
setShortcutsModalOpen: (open: boolean) => void
toggleShortcutsModal: () => void
```

Add to the store initial state:
```ts
shortcutsModalOpen: false,
```

Add the actions:
```ts
setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
```

- [ ] **Step 2: Create ShortcutsModal component**

Create `apps/cockpit/src/components/shell/ShortcutsModal.tsx`:

```tsx
import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { usePlatform } from '@/hooks/usePlatform'
import { X } from '@phosphor-icons/react'

type ShortcutEntry = {
  keys: string[]
  action: string
}

type ShortcutCategory = {
  label: string
  shortcuts: ShortcutEntry[]
}

function getCategories(mod: string): ShortcutCategory[] {
  return [
    {
      label: 'Navigation',
      shortcuts: [
        { keys: [mod, 'K'], action: 'Command palette' },
        { keys: [mod, 'B'], action: 'Toggle sidebar' },
        { keys: [mod, ']'], action: 'Next tool' },
        { keys: [mod, '['], action: 'Previous tool' },
      ],
    },
    {
      label: 'Notes',
      shortcuts: [
        { keys: [mod, 'Shift', 'N'], action: 'Toggle notes drawer' },
        { keys: [mod, 'Shift', 'Space'], action: 'Quick capture (global)' },
      ],
    },
    {
      label: 'Editor',
      shortcuts: [
        { keys: [mod, 'Enter'], action: 'Execute / Run' },
        { keys: [mod, 'Shift', 'C'], action: 'Copy output' },
        { keys: [mod, '1 / 2 / 3'], action: 'Switch tab' },
        { keys: [mod, 'O'], action: 'Open file' },
        { keys: [mod, 'S'], action: 'Save file' },
      ],
    },
    {
      label: 'Window',
      shortcuts: [
        { keys: [mod, ','], action: 'Settings' },
        { keys: [mod, 'Shift', 'T'], action: 'Toggle theme' },
        { keys: [mod, 'Shift', 'P'], action: 'Toggle always-on-top' },
        { keys: [mod, '/'], action: 'Keyboard shortcuts' },
      ],
    },
  ]
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)]">
      {children}
    </kbd>
  )
}

export function ShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsModalOpen)
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen)
  const { modSymbol } = usePlatform()

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  if (!open) return null

  const categories = getCategories(modSymbol)

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-pixel text-sm text-[var(--color-accent)]">Keyboard Shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          {categories.map((cat) => (
            <div key={cat.label} className="mb-4 last:mb-0">
              <h3 className="mb-2 font-pixel text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
                {cat.label}
              </h3>
              <div className="flex flex-col gap-1">
                {cat.shortcuts.map((s) => (
                  <div
                    key={s.action}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-xs text-[var(--color-text)]">{s.action}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add Cmd+/ shortcut binding**

In `apps/cockpit/src/hooks/useGlobalShortcuts.ts`:

Add to the store selectors at the top of the function:
```ts
const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
```

Add the combo definition:
```ts
const comboSlash = useMemo(() => ({ key: '/', mod: true } as const), [])
```

Register it at the bottom with the other shortcuts:
```ts
useKeyboardShortcut(comboSlash, toggleShortcutsModal)
```

- [ ] **Step 4: Render ShortcutsModal in App.tsx**

In `apps/cockpit/src/app/App.tsx`:

Add import:
```ts
import { ShortcutsModal } from '@/components/shell/ShortcutsModal'
```

Add `<ShortcutsModal />` inside the outer `<div>`, after `<SettingsPanel />`:
```tsx
<SettingsPanel />
<ShortcutsModal />
```

- [ ] **Step 5: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/components/shell/ShortcutsModal.tsx apps/cockpit/src/stores/ui.store.ts apps/cockpit/src/hooks/useGlobalShortcuts.ts apps/cockpit/src/app/App.tsx
git commit -m "feat(cockpit): add keyboard shortcuts cheatsheet modal with Cmd+/ trigger"
```

---

### Task 8: Sidebar Footer Action Bar

**Files:**
- Create: `apps/cockpit/src/components/shell/SidebarFooter.tsx`
- Modify: `apps/cockpit/src/components/shell/Sidebar.tsx`

- [ ] **Step 1: Create SidebarFooter component**

Create `apps/cockpit/src/components/shell/SidebarFooter.tsx`:

```tsx
import { Notebook, GearSix, Keyboard } from '@phosphor-icons/react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useNotesStore } from '@/stores/notes.store'

type SidebarFooterProps = {
  collapsed: boolean
}

export function SidebarFooter({ collapsed }: SidebarFooterProps) {
  const update = useSettingsStore((s) => s.update)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const hasNotes = useNotesStore((s) => s.notes.length > 0)

  const toggleNotes = () => update('notesDrawerOpen', !notesDrawerOpen)

  const buttonClass =
    'flex items-center justify-center rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors'

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-[var(--color-border)] py-2">
        <button onClick={toggleNotes} className={buttonClass} title="Notes">
          <span className="relative">
            <Notebook size={16} />
            {hasNotes && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </span>
        </button>
        <button onClick={toggleSettingsPanel} className={buttonClass} title="Settings">
          <GearSix size={16} />
        </button>
        <button onClick={toggleShortcutsModal} className={buttonClass} title="Keyboard Shortcuts">
          <Keyboard size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-[var(--color-border)] px-3 py-2">
      <button onClick={toggleNotes} className={buttonClass} title="Notes">
        <span className="relative">
          <Notebook size={16} />
          {hasNotes && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </span>
      </button>
      <button onClick={toggleSettingsPanel} className={buttonClass} title="Settings">
        <GearSix size={16} />
      </button>
      <button onClick={toggleShortcutsModal} className={buttonClass} title="Keyboard Shortcuts">
        <Keyboard size={16} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add SidebarFooter to Sidebar**

In `apps/cockpit/src/components/shell/Sidebar.tsx`, add the import:

```ts
import { SidebarFooter } from './SidebarFooter'
```

In the collapsed sidebar (first `return`), add `<SidebarFooter collapsed />` at the bottom of the `<aside>`:

```tsx
if (sidebarCollapsed) {
  return (
    <aside className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[2px_0_8px_-2px_var(--color-shadow)]">
      <div className="flex flex-1 flex-col items-center">
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.id}
            className="mb-2 flex h-7 w-7 items-center justify-center text-[var(--color-text-muted)]"
            title={group.label}
          >
            {group.icon}
          </div>
        ))}
      </div>
      <SidebarFooter collapsed />
    </aside>
  )
}
```

In the expanded sidebar, add `<SidebarFooter collapsed={false} />` after the scrollable tool groups:

```tsx
return (
  <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[2px_0_8px_-2px_var(--color-shadow)]">
    <div className="px-3 py-3">
      <h1 className="font-pixel text-base font-bold text-[var(--color-accent)]">devdrivr</h1>
    </div>
    <div className="flex-1 overflow-y-auto py-1">
      {TOOL_GROUPS.map((group) => {
        const tools = TOOLS.filter((t) => t.group === group.id)
        return <SidebarGroup key={group.id} group={group} tools={tools} />
      })}
    </div>
    <SidebarFooter collapsed={false} />
  </aside>
)
```

- [ ] **Step 3: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/cockpit/src/components/shell/SidebarFooter.tsx apps/cockpit/src/components/shell/Sidebar.tsx
git commit -m "feat(cockpit): add sidebar footer with Notes, Settings, and Shortcuts buttons"
```

---

### Task 9: Final Integration Verification

- [ ] **Step 1: Run full type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Run dev build and manual test**

Run: `cd /Users/tuxgeek/Dev/devdrivr && bun run desktop`

**Verify:**
- [ ] Sidebar shows Phosphor icons for all 7 groups
- [ ] Active tool has left accent border
- [ ] Sidebar has subtle right shadow
- [ ] "devdrivr" title is larger (16px)
- [ ] Group headers are 12px uppercase with wide tracking
- [ ] Sidebar footer shows three icon buttons (Notes, Settings, Shortcuts)
- [ ] Notes button has accent dot when notes exist
- [ ] Clicking Notes button toggles drawer
- [ ] Clicking Settings button opens settings modal
- [ ] Clicking Shortcuts button opens shortcuts modal
- [ ] `Cmd+/` opens/closes shortcuts modal
- [ ] Shortcuts modal shows correct platform key (⌘ on macOS)
- [ ] Escape closes shortcuts modal
- [ ] StatusBar no longer has theme toggle emoji
- [ ] StatusBar shows PushPin icon when always-on-top is enabled
- [ ] SettingsPanel uses Toggle switches instead of checkboxes
- [ ] SettingsPanel has X icon for close button
- [ ] Command palette has slightly raised background
- [ ] Toast notifications have raised background
- [ ] Dark mode: three distinct surface layers visible (bg < surface < raised)
- [ ] Light mode: same three layers with warmer tones
- [ ] Tool header shows tool name at 14px

- [ ] **Step 3: Commit any final adjustments**

If any visual tweaks are needed, make them and commit:

```bash
git add -A
git commit -m "fix(cockpit): final UI polish adjustments"
```
