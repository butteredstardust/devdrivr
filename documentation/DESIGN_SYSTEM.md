# DESIGN SYSTEM — devdrivr

> Use this reference before you update UI colours, spacing, type, or components.

Keep this document aligned with the code. Update both when a rule changes.

---

## Core principle

**All visual values come from CSS custom properties.** Never hardcode a hex value, an `rgb()`, or a
Tailwind palette utility like `bg-zinc-900`.

This rule preserves all 32 themes. A hardcoded colour can match one theme and conflict with the
other 31.

`bun run lint:ds` fails the build on hardcoded colours, off-scale type, off-scale icons, and
non-standard focus rings. See § Enforcement.

---

## Where things live

| File                              | Contains                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| `src/styles/tokens.css`           | All tokens: 32 theme palettes, z-index, spacing, radius, type, focus |
| `src/index.css`                   | Font imports, `@theme` font families, keyframes, reduced-motion      |
| `src/styles/highlight-themes.css` | Syntax-highlighting palettes                                         |

`index.css:21` imports `tokens.css`. Do not add tokens to `index.css`.

---

## Colour tokens

Values differ by theme. This table defines each token's role. Read `src/styles/tokens.css` for
the values.

### Surfaces

| Token                    | Role                                                 |
| ------------------------ | ---------------------------------------------------- |
| `--color-bg`             | Main window / workspace background                   |
| `--color-surface`        | Sidebar, toolbars, panels, cards                     |
| `--color-surface-raised` | Modals, dropdowns, command palette — above `surface` |
| `--color-surface-sunken` | Wells and inset areas — below `surface`              |
| `--color-surface-hover`  | Hover fill on buttons and list rows                  |

Nest surfaces by elevation: `sunken → bg → surface → raised`.

### Text and borders

| Token                | Role                                  |
| -------------------- | ------------------------------------- |
| `--color-text`       | Primary body text, labels, headings   |
| `--color-text-muted` | Placeholders, secondary labels, hints |
| `--color-border`     | Every border in the app — one token   |

Never use a hex value for text. Use the two text tokens only.

WARNING: Never combine an opacity utility with `--color-text-muted`. The token already uses
0.6–0.75 alpha in most themes. `opacity-60` composites it twice against the background.

Across all 23 themes, muted text alone measures 5.21–7.37:1. With `opacity-60`, it measures
2.42–3.55:1 and fails every theme. Do not create a third dimmer text token.

For a third hierarchy level, use `--color-text` for the primary line. Keep the secondary line
muted. `EmptyState` uses this pattern.

Variant-prefixed opacity is allowed. `disabled:opacity-50` dims a disabled control. `opacity-0
group-hover:opacity-100` hides an element. `dimmed-muted-text` in
`scripts/lint-design-system.mjs` matches only unprefixed `opacity-1..99` with the muted token.

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

Use accent as the single visual focus. Prefer `Alert` and `StatusBadge` semantic variants over
call-site text colours.

`--color-shadow` and `--color-scrim` must stay neutral in every theme. Use black `rgba()` and
vary only its alpha. These tokens paint across the window and all `--elevation-*` levels.

Use `--color-accent` and `--note-*` hues for theme personality. `tokens.test.ts` enforces this
rule.

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

| Token          | Value                          | Use                                            |
| -------------- | ------------------------------ | ---------------------------------------------- |
| `--font-ui`    | `system-ui, -apple-system, …`  | UI chrome: buttons, labels, toolbars, headings |
| `--font-mono`  | `'Source Code Pro', monospace` | Code, editors, values, IDs, output             |
| `--font-brand` | `'JetBrains Mono', monospace`  | App logo / branding only                       |

Use `font-ui`, `font-mono`, and `font-brand`. These are Tailwind `@theme` families. Do not use
`font-[family-name:var(--font-mono)]`.

Use `font-ui` for chrome. Use `font-mono` for user input and tool output. A label for a monospace
region is chrome and uses `font-ui`.

#### `--font-ui` is the inherited default; monospace is opted into

`html, body, #root` set `font-family: var(--font-ui)`. Chrome needs no font class. A `<span>`
without a font utility is correct. Content opts into monospace in this order:

1. **The right tag.** `pre`, `code`, `kbd` and `samp` are monospace by a base rule in `index.css`.
   Tool output rendered in `<code>` or `<pre>` needs nothing else.
2. **A primitive's `monospace` prop.** `Input` and `TextArea` both take one; it is off by default,
   because a field is chrome until proven otherwise. Turn it on for URLs, header values, JSONPath,
   identifiers, tokens, colour literals — anything read character by character.
3. **`font-mono` on the container** of a content region (a tree view, a results pane), so every
   row inherits it rather than repeating the class.
4. **`font-mono` on the element**, last resort.

Keep `font-ui` as the inherited default. This gives the more common chrome elements the correct
font without exceptions.

Two constraints apply:

- **A theme must not declare a font family.** Declare `--font-ui` and `--font-mono` once in
  `:root`. `tokens.test.ts` checks this. Themes change colour only.
- Do not apply `font-mono` to chrome. Chrome inherits `--font-ui`. An element-level family does
  not follow the token system.

`editorFont` in Settings → Editor controls Monaco only. It does not control chrome.

### Size scale

Five sizes. Nothing else. `text-[13px]` and friends are a lint error.

| Class       | rem   | px  | Use                                                       |
| ----------- | ----- | --- | --------------------------------------------------------- |
| `text-2xs`  | 0.625 | 10  | Section labels, status lines, metadata, keyboard hints    |
| `text-xs`   | 0.75  | 12  | The workhorse: buttons, inputs, toolbars, list rows, body |
| `text-sm`   | 0.875 | 14  | Tool/panel titles, modal titles                           |
| `text-base` | 1     | 16  | Rare — large empty-state headings                         |
| `text-lg`   | 1.125 | 18  | Rare — onboarding                                         |

The app uses a dense layout. Treat `text-xs` as the default body size.

Monaco's font size follows `settings.editorFontSize` (default 14, range 10–20) and is independent
of this scale.

---

## Spacing, radius, elevation

Use Tailwind's default 4px spacing scale. `tokens.css` provides `--space-1..8` for inline `style`.
Prefer Tailwind utilities in `className`.

| Token           | Value    | Use                             |
| --------------- | -------- | ------------------------------- |
| `--radius-sm`   | 0.125rem | Buttons, inputs, small controls |
| `--radius-md`   | 0.25rem  | Panels, cards                   |
| `--radius-lg`   | 0.5rem   | Modals, large surfaces          |
| `--elevation-1` | —        | Resting raised surface          |
| `--elevation-2` | —        | Dropdowns, popovers             |
| `--elevation-3` | —        | Modals                          |

### Chrome padding scale

Chrome rows use these two paddings only. `Toolbar` and `PaneHeader` provide them. Do not recreate
these components by hand.

| Padding       | Use                                       |
| ------------- | ----------------------------------------- |
| `px-4 py-2`   | Tool toolbar row (`Toolbar`, `min-h-10`)  |
| `px-3 py-1.5` | Pane header inside a split (`PaneHeader`) |

---

## Icons

Use **Phosphor Icons** (`@phosphor-icons/react`) only. Do not use inline SVG, emoji, or another
icon library.

Use three icon sizes. Sizes 10, 11, 13, and 15 are lint errors.

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

Render every tool through `ToolLayout`. Use `MasterDetailLayout` for a library tool with a list and
detail pane.

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

Use the `toolbar` slot for chrome only. Do not put a form, `TextArea`, or editor there. Put input
longer than a filename in the body.

Do not render a tool title. The tab strip already names the tool. `ToolLayout` has no title slot.
`MasterDetailLayout` can name the collection inside the tool.

Use `flex h-full flex-col` at the tool root. `ToolLayout` provides this. A hand-built root without
`h-full` collapses.

### Shell layout modes

`settings.shellStyle` sets two shell modes through `data-shell` on the app root. `floating` is the
default. `flush` uses the edge-to-edge layout. With `data-shell="flush"`, no `styles/shell.css`
rule matches.

| Hook            | On                                    |
| --------------- | ------------------------------------- |
| `.shell-canvas` | app root — paints the recessed canvas |
| `.shell-row`    | the sidebar/workspace/drawer row      |
| `.shell-panel`  | each of the three panels              |
| `.shell-chrome` | title bar and status bar              |

Keep shell geometry in `styles/shell.css`, not the five shell components. Attribute-plus-class
selectors have specificity 0,2,0. They override Tailwind utilities without `!important`.

Sidebar and notes-drawer tests check the hook classes. jsdom does not apply the stylesheet.

Apply these constraints before you update shell layout:

- **Panels keep a 1px border in floating mode.** A shadow-only panel can be invisible in light
  themes. `github-light` uses `#fbfcfd` for `--color-surface-sunken` and `#ffffff` for `--color-bg`.
  The border supports light themes. The shadow supports dark themes.
- **Use margins for gutters, not flex `gap`.** The closed notes drawer remains mounted at
  `width: 0` to animate opening. Flex `gap` would keep an empty gutter. When `inert`, remove the
  panel border and shadow because a zero-width box still paints them.

---

## Breakpoints

Use these two viewport widths. Document the reason before you add a third.

| Width      | Means                                              | Written as                                     |
| ---------- | -------------------------------------------------- | ---------------------------------------------- |
| **900px**  | A side-by-side split becomes a column              | `stackBelow={900}` — or `max-[900px]:flex-col` |
| **1000px** | Density: rows wrap, panes narrow, padding tightens | `max-[1000px]:…`                               |

For an existing split, prefer `SplitPane`'s `stackBelow` to raw `max-[900px]:flex-col`. It keeps
the media query and disabled drag handle together.

Use these deliberate exceptions:

- `MarkdownEditor` and `ApiClient` stack at **1000px**, not 900. Prose needs more line length than
  most panes before a 50/50 split stops being readable, and a request/response pair is two forms
  rather than two views of one thing.
- `CssValidator` and `HtmlValidator` use `min-[700px]:grid-cols-2 min-[1100px]:grid-cols-N` for
  their rule grids. That's a column _count_ for a list of checkboxes, not a layout mode change, so
  it doesn't belong on the scale above.

`MasterDetailLayout` narrows its sidebar at 1000px. This matches `SnippetsManager` and avoids
earlier row wrapping.

---

## Shared components

Import from `@/components/shared/<Name>`.

### Layout

| Component            | Use                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- |
| `ToolLayout`         | Every tool's outer shell. `fullBleed` for editors, `maxWidth` for forms. No title slot |
| `Toolbar`            | The chrome row. `ToolbarGroup` for families, `ToolbarSpacer` to push                   |
| `DocumentToolbar`    | Single-row variant for document tools; pairs with `DocumentIdentity`                   |
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

Use `SegmentedControl` to change a view of the same item. Use `TabBar` to change the item you work
on.

### Feedback

| Component      | Use                                                              |
| -------------- | ---------------------------------------------------------------- |
| `Alert`        | A message needing attention, or an operation outcome             |
| `StatusBadge`  | A compact state or metadata value (HTTP status, validity)        |
| `EmptyState`   | Replaces an ambiguous blank pane; may carry one next-step action |
| `Spinner`      | Indeterminate progress                                           |
| `SectionLabel` | The small uppercase label naming a region                        |
| `Dialog`       | Modal; owns focus trap, escape, and backdrop                     |

### Floating surfaces

| Component         | Use                                                                   |
| ----------------- | --------------------------------------------------------------------- |
| `Dialog`          | Modal. Owns focus trap, escape, backdrop. Centred, not anchored.      |
| `Popover`         | Anchored dismissible surface — menus, flyouts, anything above chrome  |
| `SettingsPopover` | The toolbar options surface: gear-style trigger plus rows of settings |

Do not hand-build `absolute right-0 top-full` with a `mousedown` effect. Use `Popover` for Escape
handling, stacking, position clamping, dismissal, and focus return.

`Popover` takes a render-prop trigger. Put `aria-expanded`, `aria-controls`, and the anchor ref on
the same element. It anchors at the trigger's trailing edge. It uses remaining lower space as
`max-height` and scrolls instead of flipping above the toolbar.

#### Tool options go in a `SettingsPopover`, not a second toolbar row

Use `SettingsPopover` for tool options. An options row resizes the editor and makes toolbar height
depend on the open tool. Code Formatter, TS Playground, HTML Validator, and CSS Validator use the
popover.

What stays in the toolbar:

- **Anything acted on repeatedly while working.** Diff Viewer's ignore-whitespace and ignore-case
  get cycled several times per comparison, and CSV Tools' delimiter is the first thing tried when
  a paste won't parse. These are working controls wearing an option's clothes; a gear costs two
  clicks per attempt. Diff Viewer keeps its second row for exactly this reason.
- **Actions.** A popover full of settings is live-applied — no OK, no Cancel, and nothing that
  performs an operation. A settings surface with a confirm button is a dialog in disguise.
- **Read-outs.** A line count or a byte size is a fact about the document, not a setting.

Pass `badge` when changed settings make “back to defaults” meaningful. The badge shows that hidden
settings differ from their defaults.

Use `info`, `success`, `warning`, and `error` variants. Do not style status text at the call site.
Do not add check marks, warning glyphs, emoji, or custom SVG.

#### Toolbar overflow is measured collapse, never wrapping

Keep each toolbar on one line. A wrapped row moves the document and changes tool layout. When
controls do not fit, `Toolbar` moves trailing groups into the “More actions” menu. It restores
them when space returns.

Follow these overflow rules:

- **Group order is priority order.** Groups leave from the right, so put what must survive first
  in JSX. Identity (which truncates) and file actions outlast view options; view options outlast
  document actions.
- **Only `ToolbarGroup`s collapse.** Bare buttons and inputs always stay in the row — wrap them
  in a group if they may be shed.
- **No opt-out.** The old `wrap` prop is gone; horizontal scrolling of chrome is not an
  alternative the app offers.

The overflow menu uses the group label as its heading. It stacks the same controls vertically, so
state stays unique.

### `SectionLabel`

Use `SectionLabel` for every section label.

```tsx
<SectionLabel>Output</SectionLabel>                        // <span>, chrome
<SectionLabel as="h2">Validate &amp; parse</SectionLabel>  // real heading
<SectionLabel hint={`${count} matches`}>Results</SectionLabel>
```

It renders `font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`.
Choose `as` for the required document structure. The visual remains the same.

### `Button` variants

- `primary` — the main action. The rule, in full:

  > **A tool that computes live as you type has no primary action. A tool you trigger has exactly
  > one visible at a time.**

  `case-converter`, `regex-tester`, `hash-generator`, `timestamp-converter`, `color-converter`,
  `jwt-decoder`, and `refactoring-toolkit` have none. These tools compute live. Do not add an
  action that creates an unnecessary step.

  These items are outside that count:
  - **A modal's confirm button.** It's the primary of its dialog, and the dialog is the only thing
    focusable while it's open.
  - **An `EmptyState` action.** It shows precisely when the chrome has nothing to act on.
  - **A conditional swap** — `variant={originalImg ? 'secondary' : 'primary'}` in `image-tool`,
    where opening a file is the primary until a file is open and Download takes over.

  Use `secondary` for a `MasterDetailLayout` sidebar create action. Do not use accent for a
  `PaneHeader` action.

- `secondary` — ordinary actions (Clear, Reset, Swap)
- `ghost` — tertiary actions and navigation
- `danger` — destructive only
- `icon` — icon-only; **always** pass `aria-label` (it also becomes the tooltip)

Use `loading` for async actions. It preserves width, announces busy, and blocks repeat clicks.

### Toasts

Triggered through the UI store, never rendered directly:

```tsx
const setLastAction = useUiStore((s) => s.setLastAction)
setLastAction('Formatted successfully', 'success')
setLastAction('Invalid JSON', 'error')
setLastAction('Copied to clipboard', 'info')
```

Place toasts at bottom-right. Auto-dismiss them after 3s. Allow click dismissal.

---

## Focus

Use these two focus treatments only. Other treatments fail `lint:ds`.

```tsx
// Standard — control with room around it
className = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

// Inset — control flush in a dense container (sidebar row, tab strip, list item)
className = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)]'
```

`--focus-ring` draws 4px outside the element. Its background-coloured inner layer keeps it visible
on every surface. Use `--focus-ring-inset` only when a dense container clips the standard ring.

Give every interactive element a visible focus state. Give icon-only buttons `aria-label`. Use
semantic HTML instead of a `<div>` with `onClick`. Make every core action reachable with
`useGlobalShortcuts`.

---

## Motion

Use the durations and easings in `tokens.css`. Keep interaction feedback below 200ms. The theme
cross-fade uses the longer duration because it repaints every surface.

| Token              | Value                           | Use                                           |
| ------------------ | ------------------------------- | --------------------------------------------- |
| `--duration-fast`  | `150ms`                         | hovers, colour changes, focus, small reveals  |
| `--duration-panel` | `200ms`                         | panels opening/closing, layout-sized movement |
| `--duration-spin`  | `700ms`                         | the loading spinner only                      |
| `--duration-theme` | `260ms`                         | the whole-window theme cross-fade only        |
| `--ease-out`       | `cubic-bezier(0.16, 1, 0.3, 1)` | things entering — fast start, soft landing    |
| `--ease-in-out`    | `cubic-bezier(0.4, 0, 0.2, 1)`  | things that move both ways (panel width)      |

```tsx
className = 'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]'
```

### Theme cross-fade

Changing a theme rewrites every `--color-*` token. Custom properties do not animate. Use
`setThemeClass()` in `src/lib/theme.ts` to change the theme class. It adds `.theme-transition` to
`<html>`, changes the class, and removes the transition on a timer. `index.css` then fades the
palette for that interval.

Keep these theme cross-fade rules:

- It is a temporary class, not a standing `* { transition: colors }`. The latter would slow every
  hover and focus in the app to the theme duration.
- It uses `--ease-in-out`. `--ease-out` is front-loaded enough that the palette lands in ~60ms and
  reads as the flash it replaces.

`lint:ds` blocks literal `duration-150` and `ease-in-out`. Use the tokens so matching interactions
use matching timing.

Shared keyframe utilities, all defined in `index.css`:

| Utility                 | Effect                                                 |
| ----------------------- | ------------------------------------------------------ |
| `animate-fade-in`       | opacity + 8px rise — menus, popovers, panels appearing |
| `animate-pop-in`        | opacity + 0.98→1 scale — tooltips and flyouts          |
| `animate-fade-in-place` | opacity only                                           |

Use `animate-fade-in-place` for an element positioned with a transform such as
`-translate-x-1/2`. A transform keyframe overwrites that positioning transform.

Apply these motion rules:

- **Never transition a property a drag writes on every mousemove.** Setting an inline `width` does
  not opt out of a `transition-[width]` class — each move re-aims a fresh eased animation at a
  target that has already moved, so the edge trails the pointer and arrives in visible steps. Both
  resizable panels drop the transition class while dragging and restore it on mouseup
  (`Sidebar.tsx`, `NotesDrawer.tsx`); `NotesDrawer.test.tsx` pins it.
- **Prefer `transform` and `opacity`.** They composite; `width`, `height` and `top` re-run layout
  on every frame of the animation.

`index.css` disables animation globally under `prefers-reduced-motion`. Do not add component
guards.

---

## Monaco editor

```tsx
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'

useMonacoTheme() // keeps Monaco in sync with the app theme — must be called

<Editor options={EDITOR_OPTIONS} theme={monacoTheme} language="json" … />
```

Base editor options on `EDITOR_OPTIONS`. Override individual keys instead of replacing the object.
Always pass `theme` explicitly. `DiffEditor` defaults to light and `setTheme` is global.

---

## Enforcement

`bun run lint` runs ESLint and then `bun run lint:ds`
(`scripts/lint-design-system.mjs`).

ESLint (`eslint.config.js`) blocks raw `<button>`, `<select>`, and text `<input>` in `src/tools`.
It also blocks raw text `<input>` in `src/components/shell`. Use a per-line
`// eslint-disable-next-line no-restricted-syntax` with a reason when required.

`lint:ds` checks raw source, including template literals. It blocks:

| Rule                | Blocks                                             |
| ------------------- | -------------------------------------------------- |
| `off-scale-text`    | `text-[Npx]`                                       |
| `off-scale-icon`    | `size={9\|10\|11\|13\|15}`                         |
| `off-scale-motion`  | literal `duration-N` / `ease-out` — use the tokens |
| `legacy-focus-ring` | `focus-visible:ring-*`                             |
| `hardcoded-colour`  | hex / `rgb()` inside a class attribute             |
| `tailwind-palette`  | `bg-zinc-900` and friends                          |
| `dimmed-muted-text` | unprefixed `opacity-*` on `--color-text-muted`     |

Use `/* design-system-ignore: <reason> */` on the preceding line as an escape hatch. Include the
reason.

Update this document in the same commit when you update a rule.

---

## Adding a new tool

The gates check tokens and class strings. Use this checklist to validate structure before you open
a PR:

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
- [ ] All four gates green, run from `.`.
