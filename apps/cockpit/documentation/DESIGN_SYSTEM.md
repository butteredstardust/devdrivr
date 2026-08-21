# DESIGN SYSTEM — devdrivr cockpit

> Visual language reference. Before touching any UI — colours, spacing, typography, components —
> read this first.

Verified against source on 2026-08-19. Where this document and the code disagree, the code is
authoritative and this document is a bug — fix it in the same commit.

---

## Core principle

**All visual values come from CSS custom properties.** Never hardcode a hex value, an `rgb()`, or a
Tailwind palette utility like `bg-zinc-900`.

This is not a style preference. The app ships **22 themes**. A hardcoded colour is correct under
exactly one of them and silently wrong under the other 21 — and it will look fine to whoever wrote
it, because they only ran the theme they were using.

`bun run lint:ds` fails the build on hardcoded colours, off-scale type, off-scale icons, and
non-standard focus rings. See § Enforcement.

---

## Where things live

| File                              | Contains                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| `src/styles/tokens.css`           | All tokens: 22 theme palettes, z-index, spacing, radius, type, focus |
| `src/index.css`                   | Font imports, `@theme` font families, keyframes, reduced-motion      |
| `src/styles/highlight-themes.css` | Syntax-highlighting palettes                                         |

`index.css:21` imports `tokens.css`. Do not add tokens to `index.css`.

---

## Colour tokens

Values are **per-theme** and there are 22 themes, so this table documents each token's _role_
rather than a value that would be wrong for 21 of them. Read the actual values from
`src/styles/tokens.css`.

### Surfaces

| Token                    | Role                                                 |
| ------------------------ | ---------------------------------------------------- |
| `--color-bg`             | Main window / workspace background                   |
| `--color-surface`        | Sidebar, toolbars, panels, cards                     |
| `--color-surface-raised` | Modals, dropdowns, command palette — above `surface` |
| `--color-surface-sunken` | Wells and inset areas — below `surface`              |
| `--color-surface-hover`  | Hover fill on buttons and list rows                  |

**Rule of thumb:** nest by elevation — `sunken → bg → surface → raised`.

### Text and borders

| Token                | Role                                  |
| -------------------- | ------------------------------------- |
| `--color-text`       | Primary body text, labels, headings   |
| `--color-text-muted` | Placeholders, secondary labels, hints |
| `--color-border`     | Every border in the app — one token   |

Never use a hex for text. There are exactly two text colours.

**Never stack an opacity utility on `--color-text-muted`.** In most themes the token is already
partly transparent (0.6–0.75 alpha), so `opacity-60` composites against the background twice.
Measured across all 23 themes, muted text on its own lands at 5.21–7.37:1 — comfortably past
WCAG AA — while the same text under `opacity-60` lands at 2.42–3.55:1, which fails on every
theme. There is no third, dimmer text token, and adding one would recreate the failure by design.

Where you need a third level of hierarchy, take it from the level _above_: make the primary line
`--color-text` and leave the secondary line muted. That is what `EmptyState` does.

Variant-prefixed opacity is fine and deliberately not linted: `disabled:opacity-50` dims a
control that WCAG exempts from contrast, and `opacity-0 group-hover:opacity-100` hides an element
rather than dimming it. The `dimmed-muted-text` rule in `scripts/lint-design-system.mjs` matches
only unprefixed `opacity-1..99` in the same class string as the muted token.

### Accent and semantics

| Token                | Role                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `--color-accent`     | Active state, focus, primary button fill, highlights                |
| `--color-accent-dim` | Selected/hover fill _behind_ accent text, so the text stays legible |
| `--color-error`      | Errors, destructive actions, validation failures                    |
| `--color-warning`    | Warnings, deprecations                                              |
| `--color-success`    | Success states, copy confirmation                                   |
| `--color-info`       | Informational callouts, neutral status                              |
| `--color-shadow`     | Every `box-shadow` colour                                           |
| `--color-scrim`      | Modal backdrop dim                                                  |

Accent is the single point of visual focus — use it sparingly. Prefer the semantic variants on
`Alert` / `StatusBadge` over colouring text at the call site.

### Stacking

One documented z-index scale; same across all themes. Use `z-[var(--z-modal)]`.

| Token         | Value | Layer                             |
| ------------- | ----- | --------------------------------- |
| `--z-scrim`   | 40    | Backdrop behind a modal/palette   |
| `--z-modal`   | 50    | Dialogs, command palette          |
| `--z-popover` | 60    | Context menus, dropdowns, flyouts |
| `--z-tooltip` | 70    | Hover tooltips                    |
| `--z-toast`   | 80    | Toasts — always topmost           |

---

## Typography

### Families

| Token          | Value                                            | Use                                            |
| -------------- | ------------------------------------------------ | ---------------------------------------------- |
| `--font-ui`    | `system-ui, -apple-system, …`                    | UI chrome: buttons, labels, toolbars, headings |
| `--font-mono`  | `'Source Code Pro', monospace` (theme-dependent) | Code, editors, values, IDs, output             |
| `--font-pixel` | `'Silkscreen', monospace`                        | App logo / branding only                       |

Use `font-ui`, `font-mono`, `font-pixel` (Tailwind `@theme` families — not
`font-[family-name:var(--font-mono)]`).

**The split is semantic, not decorative:** chrome is `font-ui`, content the user typed or the tool
produced is `font-mono`. A _label naming_ a monospace region is chrome and takes `font-ui`.

### Size scale

Five sizes. Nothing else. `text-[13px]` and friends are a lint error.

| Class       | rem   | px  | Use                                                       |
| ----------- | ----- | --- | --------------------------------------------------------- |
| `text-2xs`  | 0.625 | 10  | Section labels, status lines, metadata, keyboard hints    |
| `text-xs`   | 0.75  | 12  | The workhorse: buttons, inputs, toolbars, list rows, body |
| `text-sm`   | 0.875 | 14  | Tool/panel titles, modal titles                           |
| `text-base` | 1     | 16  | Rare — large empty-state headings                         |
| `text-lg`   | 1.125 | 18  | Rare — onboarding                                         |

The app is dense by design; `text-xs` is the default body size, not a small variant.

Monaco's font size follows `settings.editorFontSize` (default 14, range 10–20) and is independent
of this scale.

---

## Spacing, radius, elevation

Tailwind's default spacing scale, on a 4px rhythm. `--space-1..8` exist in `tokens.css` for use in
inline `style`, but in `className` prefer the Tailwind utilities.

| Token           | Value    | Use                             |
| --------------- | -------- | ------------------------------- |
| `--radius-sm`   | 0.125rem | Buttons, inputs, small controls |
| `--radius-md`   | 0.25rem  | Panels, cards                   |
| `--radius-lg`   | 0.5rem   | Modals, large surfaces          |
| `--elevation-1` | —        | Resting raised surface          |
| `--elevation-2` | —        | Dropdowns, popovers             |
| `--elevation-3` | —        | Modals                          |

### Chrome padding scale

Chrome rows use two paddings and no others. This is what `Toolbar` and `PaneHeader` encode; if you
are writing either by hand, you are writing a bug.

| Padding       | Use                                       |
| ------------- | ----------------------------------------- |
| `px-4 py-2`   | Tool toolbar row (`Toolbar`, `min-h-10`)  |
| `px-3 py-1.5` | Pane header inside a split (`PaneHeader`) |

---

## Icons

**Phosphor Icons** (`@phosphor-icons/react`) only. No inline SVG, no emoji, no second icon library.

Three sizes. 10/11/13/15 are lint errors — they existed, they meant nothing, they are gone.

| `size` | Use                                                        |
| ------ | ---------------------------------------------------------- |
| `12`   | Dense/inline: inside `text-2xs` rows, status lines, chips  |
| `14`   | Toolbar and button icons — the default                     |
| `16`   | Navigation and identity: sidebar groups, document identity |

Decorative icons need `aria-hidden="true"`. Icons that _are_ the control need the `aria-label` on
the button, not the icon.

Weights: `regular` default; `bold` for emphasis and active states; `fill` for status indicators
(solid reads better at 12px); `duotone` for empty-state illustrations.

---

## Layout contract

Every tool renders through `ToolLayout`, or — if it's a library tool with a list beside a detail
pane — `MasterDetailLayout`. No exceptions.

```
ToolLayout
  toolbar: Toolbar | DocumentToolbar     ← chrome only
    ToolbarGroup (+ separated)           ← action families
    ToolbarSpacer
  body:
    fullBleed  → SplitPane / editors, each pane headed by PaneHeader
    otherwise  → maxWidth-capped stack of Panel sections

MasterDetailLayout                       ← snippets, prompt-templates, api-client
  title / subtitle / sidebarActions      ← names the collection, not the tool
  sidebar: filters, then the list
  children: the detail pane (may itself be a ToolLayout)
```

**The `toolbar` slot is for chrome.** Not a form, not a `TextArea`, not an editor. If the thing you
want to put there accepts typed input longer than a filename, it belongs in the body.

**No tool renders its own title.** The tab strip already names it. `ToolLayout` has no title slot
for this reason — one existed and reached zero consumers. The only heading a tool shows is
`MasterDetailLayout`'s, which names the collection inside the tool.

**Tools must be `flex h-full flex-col` at the root** — `ToolLayout` handles this; hand-rolled roots
without `h-full` silently collapse.

---

## Shared components

Import from `@/components/shared/<Name>`.

### Layout

| Component            | Use                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- |
| `ToolLayout`         | Every tool's outer shell. `fullBleed` for editors, `maxWidth` for forms. No title slot |
| `Toolbar`            | The chrome row. `ToolbarGroup` for families, `ToolbarSpacer` to push                   |
| `DocumentToolbar`    | Wrapping variant for document tools; pairs with `DocumentIdentity`                     |
| `PaneHeader`         | Header strip for one pane of a split — title, optional status/actions                  |
| `Panel`              | Bordered section container with optional title + actions                               |
| `SplitPane`          | Resizable two-pane split; persists ratio via `storageKey`                              |
| `MasterDetailLayout` | Sidebar + detail shell for library-style tools                                         |

### Controls

| Component                       | Notes                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `Button`                        | Variants `primary`/`secondary`/`ghost`/`danger`/`icon`; sizes `xs`/`sm`/`md` |
| `CopyButton`                    | Copy + 1.5s confirmation + success toast                                     |
| `Input` / `TextArea` / `Select` | Boxed form controls                                                          |
| `InlineInput`                   | Chrome-less input for editable titles                                        |
| `SearchInput`                   | Search field with clear affordance                                           |
| `Field`                         | Label + control + hint/error. **Use this instead of a raw `<label>`**        |
| `Toggle`                        | Boolean switch with label                                                    |
| `SegmentedControl`              | Pick one view mode                                                           |
| `TabBar`                        | ARIA tabs for multi-mode tools; arrow/Home/End nav                           |
| `Kbd`                           | Keyboard hint. `<Kbd keys="mod+enter" />` — resolves `mod` per platform      |

`SegmentedControl` switches a _view_ of the same thing; `TabBar` switches _what you're working on_.

### Feedback

| Component      | Use                                                              |
| -------------- | ---------------------------------------------------------------- |
| `Alert`        | A message needing attention, or an operation outcome             |
| `StatusBadge`  | A compact state or metadata value (HTTP status, validity)        |
| `EmptyState`   | Replaces an ambiguous blank pane; may carry one next-step action |
| `Spinner`      | Indeterminate progress                                           |
| `SectionLabel` | The small uppercase label naming a region                        |
| `Dialog`       | Modal; owns focus trap, escape, and backdrop                     |

Use semantic variants (`info`/`success`/`warning`/`error`) rather than styling status text at the
call site. Do not add check marks, warning glyphs, emoji, or custom SVG — the component or a
Phosphor icon supplies the cue.

### `SectionLabel`

The one label idiom. Before it existed there were seven, differing on font, weight, and tracking
with no rule distinguishing them.

```tsx
<SectionLabel>Output</SectionLabel>                        // <span>, chrome
<SectionLabel as="h2">Validate &amp; parse</SectionLabel>  // real heading
<SectionLabel hint={`${count} matches`}>Results</SectionLabel>
```

Renders `font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`.
Pick `as` for the _document structure_ you need; the visual is identical either way.

### `Button` variants

- `primary` — the main action. The rule, in full:

  > **A tool that computes live as you type has no primary action. A tool you trigger has exactly
  > one visible at a time.**

  `case-converter`, `regex-tester`, `hash-generator`, `timestamp-converter`, `color-converter`,
  `jwt-decoder` and `refactoring-toolkit` correctly have none — there is no button to press, and
  adding one to fill the slot invents a step the tool doesn't have.

  Three things are outside the count, because they can't compete with the tool's own action:
  - **A modal's confirm button.** It's the primary of its dialog, and the dialog is the only thing
    focusable while it's open.
  - **An `EmptyState` action.** It shows precisely when the chrome has nothing to act on.
  - **A conditional swap** — `variant={originalImg ? 'secondary' : 'primary'}` in `image-tool`,
    where opening a file is the primary until a file is open and Download takes over.

  Two placements are settled: a `MasterDetailLayout` sidebar heading **never** carries the accent
  (its create action is `secondary`), and neither does a `PaneHeader` action, however transient.

- `secondary` — ordinary actions (Clear, Reset, Swap)
- `ghost` — tertiary actions and navigation
- `danger` — destructive only
- `icon` — icon-only; **always** pass `aria-label` (it also becomes the tooltip)

Use `loading` for async actions: it preserves width, announces busy, and blocks repeat clicks.

### Toasts

Triggered through the UI store, never rendered directly:

```tsx
const setLastAction = useUiStore((s) => s.setLastAction)
setLastAction('Formatted successfully', 'success')
setLastAction('Invalid JSON', 'error')
setLastAction('Copied to clipboard', 'info')
```

Auto-dismiss after 3s, dismissable by click, bottom-right.

---

## Focus

Two treatments, both tokens. Anything else is drift and fails `lint:ds`.

```tsx
// Standard — control with room around it
className = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

// Inset — control flush in a dense container (sidebar row, tab strip, list item)
className = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)]'
```

`--focus-ring` draws 4px _outside_ the element, with a background-coloured inner layer so it stays
visible on any surface. In a dense container that ring gets clipped or lands on the neighbouring
row, which is what `--focus-ring-inset` is for. Reach for inset only when the standard ring is
actually clipped.

Every interactive element needs a visible focus state. Icon-only buttons need `aria-label`. Use
semantic HTML (`<button>`, `<input>`, `<label>`) over a `<div>` with `onClick`. The app is
keyboard-first — every core action must be reachable without a mouse (`useGlobalShortcuts`).

---

## Animation

One shared animation:

```tsx
className = 'animate-fade-in' // 150ms ease-out, 8px rise
```

Defined at `index.css:89`. Keep everything under 200ms — this is a utility app, it should feel
instant. `index.css` disables animation under `prefers-reduced-motion` globally, so don't add
per-component guards.

---

## Monaco editor

```tsx
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'

useMonacoTheme() // keeps Monaco in sync with the app theme — must be called

<Editor options={EDITOR_OPTIONS} theme={monacoTheme} language="json" … />
```

Always base off `EDITOR_OPTIONS`; override individual keys rather than replacing the object.
**Always pass `theme` explicitly** — `DiffEditor` defaults to light, and `setTheme` is global.

---

## Enforcement

`bun run lint` runs ESLint and then `bun run lint:ds`
(`scripts/lint-design-system.mjs`).

ESLint (`eslint.config.js`) blocks raw `<button>`, `<select>`, and text `<input>` in `src/tools`,
and raw text `<input>` in `src/components/shell`. Per-line
`// eslint-disable-next-line no-restricted-syntax` with a stated reason is the escape hatch.

`lint:ds` walks raw source — including template literals, where most of the historical drift hid —
and blocks:

| Rule                | Blocks                                 |
| ------------------- | -------------------------------------- |
| `off-scale-text`    | `text-[Npx]`                           |
| `off-scale-icon`    | `size={10\|11\|13\|15}`                |
| `legacy-focus-ring` | `focus-visible:ring-*`                 |
| `hardcoded-colour`  | hex / `rgb()` inside a class attribute |
| `tailwind-palette`  | `bg-zinc-900` and friends              |

Escape hatch: `/* design-system-ignore: <reason> */` on the preceding line. The reason is required.

If you need to change a rule, change this document in the same commit. A gate that disagrees with
its documentation teaches contributors to ignore both.

---

## Adding a new tool

The gates catch tokens and class strings. They cannot catch structure, which is where every
inconsistency in the 2026-08 audit actually came from. Walk this before opening the PR:

- [ ] Root is `ToolLayout` (or `MasterDetailLayout` for a library tool). Nothing above it.
- [ ] No `<h1>`/`<h2>` naming the tool — the tab strip does that.
- [ ] The `toolbar` slot holds chrome only. A `TextArea` in there is the single most common mistake.
- [ ] Chrome rows are `Toolbar`/`DocumentToolbar` with `aria-label`, grouped by `ToolbarGroup`,
      spaced by `ToolbarSpacer` — never `ml-auto`.
- [ ] Side-by-side panes use `SplitPane` with a unique `storageKey`, and `stackBelow` if the layout
      needs to stack on a narrow window. Each pane is headed by `PaneHeader`.
- [ ] Body sections are `Panel`. Anything nested inside one uses `bg-bg`, not `bg-surface`.
- [ ] Every labelled control is a `Field` — no bare `<label>`. Pass `htmlFor` when the field holds
      more than one labelable element.
- [ ] Region labels are `SectionLabel`. Keyboard hints are `Kbd`, including inside `title=` prose.
- [ ] Exactly one `variant="primary"` visible at a time, or none if the tool computes live.
- [ ] Icons are `size={12}`, `{14}` or `{16}`; icon-only buttons carry `aria-label`.
- [ ] Live results that settle are announced (`role="status"` + `aria-live="polite"`); values that
      change on every keystroke are not.
- [ ] All four gates green, run from `apps/cockpit`.
