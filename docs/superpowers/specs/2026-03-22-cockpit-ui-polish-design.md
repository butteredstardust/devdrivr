# Cockpit UI/UX Polish — Design Spec

## Goal

Elevate the cockpit from "functional but basic" to "professional with personality" through three focused improvements: Phosphor icons + visual depth, semantic color system + typography scale, and design tokens + standardized components. Also adds discoverability features (sidebar action bar, keyboard shortcuts cheatsheet).

## Context

The cockpit currently has a retro/hacker aesthetic (Silkscreen pixel font, neon green accent, dark background) that works well as a brand identity. The UI is keyboard-driven and functional but suffers from:
- Flat visual hierarchy (1px borders everywhere, no depth cues)
- Emoji/Unicode icons that look inconsistent
- Over-reliance on monochrome + neon green (success = accent = same color)
- Inconsistent spacing and alignment
- No visual component hierarchy (all buttons look the same)
- Hidden features (notes, shortcuts) with no UI affordance

The goal is to keep the pixel font personality while adding modern depth, proper icons, and smooth transitions. Professional look with personality.

## Non-Goals

- Redesigning tool internals (tools work fine, polish them incrementally later)
- Adding animations/motion design beyond basic transitions
- Changing the overall layout structure (sidebar + workspace + drawer)
- Theming beyond dark/light (no custom theme builder)

---

## 1. Phosphor Icons + Visual Depth

### Package

`@phosphor-icons/react` — tree-shakeable, supports 6 weights. Use `regular` default, `fill` for active states, `bold` for emphasis.

### Shell Icon Mapping

| Current | Component | Phosphor Icon |
|---------|-----------|---------------|
| `</>` | Code group | `Code` |
| `{}` | Data group | `Database` |
| `◈` | Web group | `Globe` |
| `⇄` | Convert group | `ArrowsLeftRight` |
| `✓` | Test group | `CheckCircle` |
| `↗` | Network group | `WifiHigh` |
| `✎` | Write group | `PencilSimple` |
| `▶` | Group expand arrow | `CaretRight` (rotates on expand) |
| `🌙/☀️/⚙️` | Theme toggle (in Settings) | `Moon`/`Sun`/`Monitor` |
| `📌` | Always on top | `PushPin` |

### Type Change

`ToolDefinition.icon` and `ToolGroupMeta.icon` change from `string` to `ReactNode` so groups and tools can use Phosphor components directly.

### Depth Cues

- **Sidebar:** `shadow-[1px_0_0_0_var(--color-border),2px_0_8px_-2px_rgba(0,0,0,0.3)]` — subtle right shadow
- **Command palette:** `shadow-lg` + slight border glow
- **Active sidebar item:** Left accent border (2px solid accent) instead of just background change
- **New CSS variable:** `--color-shadow: rgba(0,0,0,0.4)` (dark), `rgba(0,0,0,0.1)` (light)

### Files

- Modify: `types/tools.ts`, `app/tool-registry.ts`, `components/shell/SidebarItem.tsx`, `components/shell/SidebarGroup.tsx`, `components/shell/Sidebar.tsx`, `components/shell/StatusBar.tsx`, `index.css`, `package.json`

---

## 2. Semantic Color System + Typography Scale

### Color System Expansion

Add surface layering (3 tiers) and distinct functional state colors.

**Dark mode:**

```css
/* Surface layering */
--color-bg: #0a0a0a;              /* unchanged — deepest layer */
--color-surface: #141414;          /* was #1a1a1a — sidebar, panels */
--color-surface-raised: #1e1e1e;   /* NEW — cards, dropdowns, modals */
--color-surface-hover: #282828;    /* was #252525 — interactive hover */

/* Functional states */
--color-accent: #39ff14;           /* unchanged — primary actions, nav */
--color-accent-dim: #1a7a0a;       /* unchanged */
--color-info: #3b82f6;             /* NEW — blue, informational */
--color-warning: #f59e0b;          /* was #ffaa00 — warmer amber */
--color-error: #ef4444;            /* was #ff3333 — slightly softer */
--color-success: #22c55e;          /* CHANGED — distinct from accent */

/* Depth */
--color-shadow: rgba(0,0,0,0.4);  /* NEW */
```

**Light mode:**

```css
--color-surface: #f5f3eb;           /* was #ffffff — warmer */
--color-surface-raised: #ffffff;     /* NEW */
--color-surface-hover: #ece9e0;      /* was #f0eee6 */
--color-info: #2563eb;               /* NEW */
--color-success: #16a34a;            /* distinct from accent */
--color-shadow: rgba(0,0,0,0.1);     /* NEW */
```

**Key change:** `--color-success` is no longer identical to `--color-accent`. Neon green stays for branding/navigation; natural green for "operation succeeded."

### Typography Scale

| Element | Current | New |
|---------|---------|-----|
| App title ("devdrivr") | `text-sm` (14px) | `text-base` (16px) font-pixel bold |
| Sidebar group headers | `text-[10px]` | `text-xs` (12px) font-pixel, `tracking-widest` |
| Tool header in workspace | `text-xs` (12px) | `text-sm` (14px) font-pixel |
| Sidebar tool names | `text-xs` (12px) | unchanged |
| Status bar | `text-[11px]` | unchanged |

### Surface Layering Strategy

- **Sidebar:** `bg-[var(--color-surface)]` — middle tier
- **Workspace:** `bg-[var(--color-bg)]` — deepest, creates natural inset
- **Modals/command palette:** `bg-[var(--color-surface-raised)]` — top tier, floats above

Three visual layers without gradients — just flat tones at different brightness levels.

### Files

- Modify: `index.css`, `components/shell/Sidebar.tsx`, `components/shell/SidebarGroup.tsx`, `components/shell/Workspace.tsx`, `components/shell/StatusBar.tsx`, `components/shell/CommandPalette.tsx`, `components/shared/Toast.tsx`, `components/shell/SettingsPanel.tsx`

---

## 3. Design Tokens + Standardized Components

### Spacing Tokens (4px Grid)

Defined as the spec, enforced through consistent Tailwind class usage:

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px (`gap-1`) | Tight: inline gaps, icon-to-text, label-to-field |
| `space-2` | 8px (`gap-2`, `px-2`) | Default: padding, small gaps |
| `space-3` | 12px (`gap-3`, `px-3`) | Comfortable: section padding |
| `space-4` | 16px (`gap-4`, `px-4`) | Spacious: panel padding |
| `space-6` | 24px (`gap-6`) | Section breaks within tools |
| `space-8` | 32px (`gap-8`) | Major section gaps |

**Normalization rules:**
- Inline icon-to-text gaps: `gap-2` (8px) always
- Panel inner padding: `px-3 py-2` (12px/8px) always
- Section separation within tools: `gap-6` (24px) always
- Between form field + label: `gap-1` (4px) always

### Button Hierarchy (3 Tiers)

| Tier | Style | Use |
|------|-------|-----|
| **Primary** | `bg-[var(--color-accent)] text-[var(--color-bg)] font-pixel text-xs px-4 py-2 rounded` | Main CTA per tool (Execute, Generate, Format) |
| **Secondary** | `border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded hover:bg-[var(--color-surface-hover)]` | Supporting actions (Copy, Clear, Swap) |
| **Ghost** | `text-[var(--color-text-muted)] px-2 py-1 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded` | Toolbar icons, toggles, minor actions |

### Toggle Switch Component

Shared `Toggle` component for binary options (replaces raw checkboxes):
- Track: 32px wide, 18px tall
- Off: `bg-[var(--color-border)]`
- On: `bg-[var(--color-accent)]`
- Knob: 14px circle with smooth `translate-x` transition (150ms)
- Label text to the right, `text-xs`

### Form Input Standards

| Element | Standard Classes |
|---------|-----------------|
| Text input | `h-9 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm focus:border-[var(--color-accent)] focus:outline-none` |
| Textarea | Same as input + `resize-none py-2` |
| Select/dropdown | Same as input + Phosphor `CaretDown` icon |
| Label | `text-xs text-[var(--color-text-muted)] mb-1` |

### New Shared Components

- `components/shared/Toggle.tsx` — binary switch with `checked`, `onChange`, optional `label` props
- `components/shared/Button.tsx` — `variant: 'primary' | 'secondary' | 'ghost'`, `size: 'sm' | 'md'`, forwards ref and button props

### Files

- Modify: `index.css`
- Create: `components/shared/Toggle.tsx`, `components/shared/Button.tsx`
- Modify: `components/shell/SettingsPanel.tsx` (checkboxes → toggles, adopt Button component)
- Gradual adoption across tools (not in scope for this plan — tools adopt incrementally)

---

## 4. Sidebar Action Bar + Keyboard Shortcuts Cheatsheet

### Sidebar Footer Action Bar

Fixed at the bottom of the sidebar, separated from tool groups by `border-t`. Three ghost-style icon buttons:

```
┌─────────────────────┐
│ devdrivr             │
│ ▸ Code               │
│   JSON Tools         │
│   ...                │
│ (flex-1 spacer)      │
│─────────────────────│
│ 📓  ⚙️  ⌨️           │  ← Notes, Settings, Shortcuts
└─────────────────────┘
```

- **Notes** — Phosphor `Notebook` icon, toggles NotesDrawer. Shows 4px accent dot indicator when notes exist.
- **Settings** — Phosphor `GearSix` icon, opens SettingsPanel.
- **Shortcuts** — Phosphor `Keyboard` icon, opens ShortcutsModal.

When sidebar is collapsed (`w-10`), icons stack vertically.

Theme toggle removed from StatusBar (already in Settings panel). StatusBar simplified to: tool name + last action + always-on-top indicator.

### Keyboard Shortcuts Cheatsheet Modal

**Trigger:** `Cmd+/` shortcut OR Shortcuts button in sidebar footer.

**Layout:**
- Centered modal, `bg-[var(--color-surface-raised)]`, `shadow-lg`, rounded
- Max width 560px, max height 70vh, scrollable
- Title: "Keyboard Shortcuts" in `font-pixel text-sm`
- Close: Escape key or X button (Phosphor `X`)
- Backdrop: `bg-black/50`

**Categories:**

| Category | Shortcut | Action |
|----------|----------|--------|
| **Navigation** | | |
| | `Cmd+K` | Command palette |
| | `Cmd+B` | Toggle sidebar |
| | `Cmd+]` | Next tool |
| | `Cmd+[` | Previous tool |
| **Notes** | | |
| | `Cmd+Shift+N` | Toggle notes drawer |
| | `Cmd+Shift+Space` | Quick capture (global) |
| **Editor** | | |
| | `Cmd+Enter` | Execute / Run |
| | `Cmd+Shift+C` | Copy output |
| | `Cmd+1/2/3` | Switch tab |
| | `Cmd+O` | Open file |
| | `Cmd+S` | Save file |
| **Window** | | |
| | `Cmd+,` | Settings |
| | `Cmd+Shift+T` | Toggle theme |
| | `Cmd+Shift+P` | Toggle always-on-top |
| | `Cmd+/` | Keyboard shortcuts |

**`<kbd>` styling:** `bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[11px] font-mono`

**Platform detection:** Uses `navigator.platform` or `navigator.userAgentData?.platform` to show `⌘` on macOS, `Ctrl` on Windows/Linux.

### State

- `ui.store.ts`: Add `shortcutsModalOpen: boolean` + `setShortcutsModalOpen` + `toggleShortcutsModal`

### Files

- Create: `components/shell/ShortcutsModal.tsx`
- Modify: `components/shell/Sidebar.tsx` (add footer bar)
- Modify: `components/shell/StatusBar.tsx` (remove theme toggle)
- Modify: `stores/ui.store.ts` (add shortcutsModalOpen)
- Modify: `hooks/useGlobalShortcuts.ts` (add Cmd+/ binding)
- Modify: `app/App.tsx` (render ShortcutsModal)

---

## Testing Strategy

- Visual regression: manual testing in dark + light mode
- TypeScript: `tsc --noEmit` after each task
- Functional: verify all keyboard shortcuts still work, sidebar collapse/expand, notes drawer toggle, settings panel, command palette
- Cross-check: Phosphor icons render at correct size in both sidebar states (expanded/collapsed)

## Scope Boundary

This spec covers **shell-level polish only**. Individual tool UIs (28 tools) are not modified — they will adopt the shared Button/Toggle components incrementally in future work. The tool-registry icon field change is the one cross-cutting change that touches tool definitions.
