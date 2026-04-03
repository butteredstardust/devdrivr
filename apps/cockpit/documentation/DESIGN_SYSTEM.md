# DESIGN SYSTEM — devdrivr cockpit

> Visual language reference. Before touching any UI — colours, spacing, typography, components — read this first.

---

## Core Principle

**All visual values come from CSS custom properties.** Never hardcode hex values, `rgb()`, or Tailwind palette utilities like `bg-zinc-900`. Using tokens means themes switch correctly at runtime; hardcoding means the app looks broken in light mode or after a theme update.

---

## Colour Tokens

Defined in `src/index.css` under `:root` (dark, default) and `.light` (overrides).

### Background & Surface

| Token                    | Dark      | Light     | When to use                            |
| ------------------------ | --------- | --------- | -------------------------------------- |
| `--color-bg`             | `#0a0a0a` | `#faf8f0` | Main window / page background          |
| `--color-surface`        | `#181818` | `#f5f3eb` | Sidebar, panels, cards, tool workspace |
| `--color-surface-raised` | `#1e1e1e` | `#ffffff` | Modals, dropdowns, command palette     |
| `--color-surface-hover`  | `#282828` | `#ece9e0` | Hover fill on buttons, list items      |

**Rule of thumb:** Nest surfaces by elevation — bg → surface → surface-raised.

### Text

| Token                | Dark      | Light     | When to use                           |
| -------------------- | --------- | --------- | ------------------------------------- |
| `--color-text`       | `#e0e0e0` | `#1a1a1a` | Primary body text, labels, headings   |
| `--color-text-muted` | `#888888` | `#666666` | Placeholders, secondary labels, hints |

Never use a hex value for text. Always pick one of these two.

### Borders

| Token            | Dark      | Light     | When to use                           |
| ---------------- | --------- | --------- | ------------------------------------- |
| `--color-border` | `#333333` | `#d4d0c8` | All borders: panels, inputs, dividers |

One border token. All edges in the UI use it.

### Accent (Brand)

| Token                | Dark                   | Light            | When to use                                                |
| -------------------- | ---------------------- | ---------------- | ---------------------------------------------------------- |
| `--color-accent`     | `#39ff14` (neon green) | `#00875a` (teal) | Active states, focused inputs, highlights, primary buttons |
| `--color-accent-dim` | `#1a7a0a`              | `#b3e0d0`        | Hover fill backgrounds behind accent-coloured text         |

Use `accent` sparingly — it's the single point of visual focus. Use `accent-dim` for hover/selected fill so the accent text remains readable.

### Semantic Colours

| Token             | Dark      | Light     | When to use                                              |
| ----------------- | --------- | --------- | -------------------------------------------------------- |
| `--color-error`   | `#ef4444` | `#dc2626` | Error messages, destructive actions, validation failures |
| `--color-warning` | `#f59e0b` | `#d97706` | Warnings, deprecation notices                            |
| `--color-success` | `#22c55e` | `#16a34a` | Success states, copy confirmations                       |
| `--color-info`    | `#3b82f6` | `#2563eb` | Informational callouts, neutral status                   |

### Shadows

| Token            | Dark              | Light             | When to use         |
| ---------------- | ----------------- | ----------------- | ------------------- |
| `--color-shadow` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.1)` | `box-shadow` values |

Always use this token for shadows rather than hardcoding an alpha value.

### Usage Examples

```typescript
// Panel background
className="bg-[var(--color-surface)]"

// Card with border
className="bg-[var(--color-surface)] border border-[var(--color-border)]"

// Active tab
className="border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"

// Destructive button text
className="text-[var(--color-error)]"

// Hover fill
className="hover:bg-[var(--color-surface-hover)]"

// Muted placeholder
className="text-[var(--color-text-muted)] placeholder:text-[var(--color-text-muted)]"

// Shadow
style={{ boxShadow: `0 4px 16px var(--color-shadow)` }}
```

---

## Typography

### Fonts

| Token          | Value                                      | When to use                                         |
| -------------- | ------------------------------------------ | --------------------------------------------------- |
| `--font-mono`  | `'JetBrains Mono', 'Fira Code', monospace` | All code, input fields, output areas, Monaco editor |
| `--font-pixel` | `'Silkscreen', monospace`                  | App logo / branding only                            |

The system sans-serif (default browser font) is used for all UI chrome — labels, buttons, headings.

```typescript
// Code/monospace content
className = 'font-[family-name:var(--font-mono)] text-sm'

// Logo
className = 'font-[family-name:var(--font-pixel)]'
```

### Text Size Scale

Use Tailwind's text scale. Common sizes in use:

| Class                 | Use case                                             |
| --------------------- | ---------------------------------------------------- |
| `text-xs`             | Button labels, status bar, tab labels, sidebar items |
| `text-sm`             | Body text, tool labels, form inputs                  |
| `text-base`           | Section headings                                     |
| `text-lg` / `text-xl` | Modal titles (rare)                                  |

The Monaco editor font size follows `settings.editorFontSize` (default: 14px, range 10–20).

---

## Spacing & Layout

The app uses Tailwind's default spacing scale. No custom spacing tokens — use the scale directly.

### Common Layout Patterns

**Full-height tool workspace:**

```typescript
<div className="flex h-full flex-col gap-2 p-3">
  {/* header row */}
  <div className="flex items-center gap-2">...</div>
  {/* expanding content area */}
  <div className="flex min-h-0 flex-1 flex-col">...</div>
</div>
```

**Side-by-side panels:**

```typescript
<div className="flex h-full min-h-0 gap-2">
  <div className="flex flex-1 flex-col">Left</div>
  <div className="flex flex-1 flex-col">Right</div>
</div>
```

**Toolbar row:**

```typescript
<div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
  ...
</div>
```

**Key layout rule:** Tools must be `flex h-full flex-col` at the root. Without `h-full`, the tool won't fill the workspace.

---

## Icons

All icons use **Phosphor Icons** (`@phosphor-icons/react`). No inline SVGs, no emoji, no other icon libraries.

```typescript
import { ArrowRight, Clipboard, Lightning, Code, Gear } from '@phosphor-icons/react'

// Standard sizes
<Gear size={16} />           // toolbar / button icons
<Code size={20} />           // sidebar group icons
<Lightning size={14} />      // status bar

// Weights
weight="regular"   // default
weight="bold"      // emphasis, active states
weight="fill"      // filled/active icon variant
weight="duotone"   // decorative, two-tone
weight="light"     // subtle, secondary icons
weight="thin"      // very subtle
```

**Choosing weight by context:**

- Sidebar group headers: `weight="bold"` at `size={16}`
- Toolbar actions: `weight="regular"` at `size={14}` or `size={16}`
- Status indicators: `weight="fill"` (solid, immediately readable at small sizes)
- Empty state illustrations: `weight="duotone"` at larger sizes

---

## Shared Components

### `Button`

```typescript
import { Button } from '@/components/shared/Button'

// Variants
<Button variant="primary">Run</Button>        // accent background — main CTA
<Button variant="secondary">Cancel</Button>   // border style — default
<Button variant="ghost">Settings</Button>     // text only — minimal chrome

// Sizes
<Button size="md">Default</Button>            // px-4 py-2
<Button size="sm">Compact</Button>            // px-2 py-1

// All standard HTMLButtonElement props pass through
<Button variant="primary" disabled={loading} onClick={handleRun}>
  {loading ? 'Running…' : 'Run'}
</Button>
```

**When to use which variant:**

- `primary` — one per tool, the main action (Format, Run, Generate, etc.)
- `secondary` — secondary actions (Clear, Reset, Copy as…)
- `ghost` — tertiary actions, icon-only buttons, navigation

### `CopyButton`

```typescript
import { CopyButton } from '@/components/shared/CopyButton'

<CopyButton text={output} />
<CopyButton text={output} label="Copy JSON" />
<CopyButton text={output} className="ml-auto" />
```

Shows "✓ Copied" for 1.5s after click. Triggers a success toast automatically.

### `TabBar`

```typescript
import { TabBar } from '@/components/shared/TabBar'

const TABS = [
  { id: 'format', label: 'Format' },
  { id: 'minify', label: 'Minify' },
]

<TabBar
  tabs={TABS}
  activeTab={state.tab}
  onTabChange={(id) => updateState({ tab: id })}
/>
```

Active tab has a 2px bottom border in `--color-accent`. Use `TabBar` for multi-mode tools.

### `Toggle`

```typescript
import { Toggle } from '@/components/shared/Toggle'

<Toggle
  checked={state.wrap}
  onChange={(v) => updateState({ wrap: v })}
  label="Word wrap"
/>
```

### `Toast` / Status feedback

Toasts are triggered via the UI store, not rendered directly:

```typescript
const setLastAction = useUiStore((s) => s.setLastAction)

// Success (green)
setLastAction('Formatted successfully', 'success')

// Error (red)
setLastAction('Invalid JSON', 'error')

// Info (accent)
setLastAction('Copied to clipboard', 'info')
```

Toasts auto-dismiss after 3 seconds and can be dismissed by click. They appear bottom-right at `fixed bottom-12 right-4`.

### `SendToMenu`

Allows sending text content from one tool to another:

```typescript
import { SendToMenu } from '@/components/shared/SendToMenu'

<SendToMenu content={state.output} />
```

The menu lists all other tools that accept `open-file` / `send-to` actions.

---

## Animations

One animation is defined globally:

```css
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Used for modals, toasts, and panels appearing. Apply with:

```typescript
className = 'animate-[fade-in_150ms_ease-out]'
```

Keep all animations under 200ms. The app is a utility — it should feel instant.

---

## Monaco Editor

Tools using Monaco import shared theme sync and options:

```typescript
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'

export default function MyTool() {
  useMonacoTheme()   // keeps Monaco in sync with app theme — must be called

  return (
    <Editor
      options={EDITOR_OPTIONS}   // shared base options (minimap off, line numbers, etc.)
      theme="cockpit-dark"       // set by useMonacoTheme
      language="javascript"
      value={state.input}
      onChange={(v) => updateState({ input: v ?? '' })}
    />
  )
}
```

Always use `EDITOR_OPTIONS` as the base. Override individual options if needed, but don't replace the whole object.

---

## Accessibility Notes

- All interactive elements must have visible focus states (Tailwind's `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`)
- Icon-only buttons need an `aria-label`
- Use semantic HTML (`<button>`, `<input>`, `<label>`) over generic `<div>` with `onClick`
- The app is keyboard-first — every core action must be reachable without a mouse (see `useGlobalShortcuts`)
