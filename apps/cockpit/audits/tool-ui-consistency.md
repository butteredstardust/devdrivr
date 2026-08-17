# Cockpit Tool UI Consistency Audit

> **Status:** revised 2026-08-17 after verifying every claim against the source. The first version
> of this document was written without checking the codebase and was substantially wrong — it
> proposed building components that already exist and reported inconsistencies that had already been
> fixed. The corrected findings are below; the original counts are not recoverable and were not
> reproducible. Treat any figure here as checkable, and check it.

## Executive Summary

Shared-primitive adoption across `src/tools/` is already high. The remaining inconsistencies are
narrow and specific rather than systemic: a handful of tools hand-rolled chrome that a shared
primitive already covered, and the drift was always in the same direction — the hand-rolled copy
dropped a focus ring, a background token, or an ARIA role.

**Measured adoption** (files under `src/tools/`, tests excluded):

| Primitive          | Files | Note                                                        |
| ------------------ | ----: | ----------------------------------------------------------- |
| `ToolLayout`       |    29 | Non-adopters are sub-components and two-pane library tools  |
| `CopyButton`       |    26 |                                                             |
| `Alert`            |    22 | This is the "ErrorBanner" the first draft proposed building |
| `EmptyState`       |    21 |                                                             |
| `Toolbar`          |    20 | Was 13 before this pass                                     |
| `SegmentedControl` |    13 |                                                             |
| `TabBar`           |     4 |                                                             |

Custom tab implementations (`role="tab"` outside `TabBar`): **0**.

## Corrections to the first draft

These claims were checked and are false:

- **"14 tools implement custom tab styling instead of using `TabBar`."** No tool defines
  `role="tab"`. Tools that switch a view _mode_ use `SegmentedControl`, which is a deliberate
  choice documented in that component — a mode switch is a radio group, not a tablist, and using
  tablist would oblige every call site to wire `aria-controls` to a matching tabpanel.
- **"Create shared `ErrorBanner` component."** `Alert` already does this, with four variants and an
  `aria-live` level that varies by severity, and is used in 22 files.
- **"Add a `loading` prop to `Button` that handles the spinner."** `Button` already has it, and
  keeps the children in the layout while hidden so loading never changes the button's width.
- **"Adopt `EmptyState` in 8 tools / only used in 4 of 30+."** Used in 21.
- **"Create a `CodeEditor` wrapper."** Code panes are Monaco, configured through the shared
  `useMonacoTheme` / `useMonacoOptions` hooks. A textarea-based wrapper would be a downgrade.
- **"Add an ESLint rule to flag custom tabs / button variants."** A `no-restricted-syntax` block
  scoped to `src/tools/**/*.tsx` has guarded raw `button` and `select` since an earlier pass.

## Verified findings, and what was done

### 1. Seven hand-rolled toolbar rows (fixed)

`CsvConvert`, `CsvTable`, `TimestampConverter`, `CssSpecificity`, `RegexTester`, `ImageTool` and
`JsonSchemaValidator` each rebuilt the
`flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2` row by hand instead of
using `Toolbar`. All seven lacked `role="toolbar"` and the surface background, so they rendered a
shade darker than the rows already on the shared component; none had its `min-h-10` floor.
`RegexTester`'s mode row also used `px-3` against everyone else's `px-4`.

### 2. `ImageTool` duplicated `Input` and `Toggle` (fixed)

A local `inputClass` string, repeated in the resize and crop panels, styled six dimension fields. It
had drifted from `Input` on three points — `--color-bg` instead of the surface token, plain
`rounded` instead of `--radius-md`, and **no focus ring on any of the six fields**.

The crop enable switch was hand-rolled under an `eslint-disable` whose reason claimed no equivalent
existed. `Toggle` is that control, and it also fixes the semantics: `role="switch"` +
`aria-checked` rather than a button with `aria-pressed`.

### 3. Five chrome-less fields, five class strings (fixed)

The snippet title, API request name, environment name, and the regex pattern and replacement bars
all edit text in place rather than in a box. Each had hand-rolled it differently, and the snippet
title and both regex bars had **no focus indicator at all** — the only affordance a borderless field
has. Now a shared `InlineInput` with `title` / `heading` / `code` variants and the ring in the base
class.

`CollectionsSidebar`'s rename box moved to the boxed `Input` instead: its border is what signals
that the row has flipped into edit mode, so it is a different control, not a sixth copy of this one.

### 4. The lint rule did not cover `input` (fixed)

The existing `no-restricted-syntax` block guarded `button` and `select`; `input` was excluded with a
stated reason — no shared primitive to point violators at — that stopped being true once `Input`
landed. That gap is what allowed findings 2 and 3. A third selector now covers text-entry inputs,
exempting `checkbox` / `radio` / `file` / `color` / `range` by type rather than by fourteen
identical disable comments.

## Open, not addressed in this pass

- **`PromptTemplates` and `SnippetsManager` duplicate a two-pane library shell.** Both render the
  same grid, sidebar `<aside>`, `min-h-14` header, and search field with a clear button — near
  identically, and independently. They are internally consistent with each other today, so there is
  no visible defect; the risk is that a change to one silently diverges from the other. Extracting
  the shell is a refactor with real behavioural surface (search focus handling, keyboard shortcuts,
  selection state) and wants its own change, not a ride-along in a consistency pass.
- **Direct `clipboard.writeText` calls in 15 files.** Most are legitimate — keyboard shortcuts and
  click-to-copy tree nodes, which are not buttons and cannot be `CopyButton`. Worth a look for the
  subset that _is_ a button, but there was no measured drift to fix.
- **`TabBar` is used in only 4 tools.** Not a defect on its own, given `SegmentedControl` correctly
  covers mode switching. Recorded here so the low number is not re-reported as a finding.

## How to check any claim in this document

```bash
cd apps/cockpit/src/tools
grep -rl "shared/Alert" --include='*.tsx' . | grep -v __tests__ | wc -l   # adoption count
grep -rl 'role="tab"'   --include='*.tsx' . | grep -v __tests__           # custom tabs
grep -rnE '<div className="[^"]*border-b[^"]*px-4 py-2' --include='*.tsx' .  # hand-rolled toolbars
```
