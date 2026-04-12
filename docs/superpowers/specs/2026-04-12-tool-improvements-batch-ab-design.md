# Tool Improvements — Batch A & B

**Date:** 2026-04-12
**Status:** Approved
**Scope:** 4 focused enhancements across Color Converter, CSV Tools, Snippets Manager, and Markdown Editor

---

## Overview

Four independent improvements to existing cockpit tools. Each is self-contained and can be implemented and committed separately.

| ID | Tool | Feature | Complexity |
|----|------|---------|------------|
| A1 | Color Converter | CSS variable preview panel | Low |
| A2 | CSV Analyze | Null % in column stats | Low |
| B1 | Snippets Manager | Flat folder organization | Medium |
| B2 | Markdown Editor | PDF export via print | Medium |

---

## A1 — Color Converter: CSS Variable Preview

### What
Add a 4th section tab `CSS Var` to `ColorConverter.tsx` alongside the existing Formats / Shades & Tints / Harmony tabs.

### Design
- A text input where the user types a CSS variable name (default: `--color-primary`)
- Displays ready-to-copy declarations for all formats: `--color-primary: #39ff14;`, `--color-primary: rgb(57, 255, 20);`, etc.
- A live mini UI mockup — a small card rendered with inline styles applying the color as background, text color, border, and button fill — so the user can see how the color looks in a realistic UI context before copying
- Copy buttons for each format variant

### Architecture
- No new dependencies
- Pure inline style applied to static JSX elements in the tab render
- `activeSection` type union extended from `'formats' | 'scale' | 'harmony'` to include `'cssvar'`
- `ColorConverterState` gets a new `cssVarName: string` field (persisted via `useToolState`)

### Files Changed
- `src/tools/color-converter/ColorConverter.tsx` — add `cssvar` tab, `cssVarName` state, and the preview panel

---

## A2 — CSV Analyze: Null % Column Stat

### What
Add null count and null percentage to each column's stats in `CsvAnalyze.tsx`.

### Design
- A value is "null" if it is `null`, `undefined`, or empty string `""`
- Display format: `Nulls: 12 (8.3%)`
- Shown in the Column Statistics panel card for every column, below the existing type/min/max/unique stats

### Architecture
- No new dependencies, no schema changes
- `calculateStringStats` and `calculateNumberStats` utils in `src/tools/csv-tools/utils.ts` are extended to return `{ nullCount: number, nullPct: number }`
- Alternatively, null computation stays in `CsvAnalyze.tsx` itself since it's a one-pass filter on the values array

### Files Changed
- `src/tools/csv-tools/CsvAnalyze.tsx` — compute and render null stats per column

---

## B1 — Snippets Manager: Flat Folder Organization

### What
Add a `folder` field to snippets so they can be grouped into named folders, with a folder filter in the sidebar.

### Design

**Data model:**
- `folder: string` added to the `Snippet` type in `src/types/models.ts` (default `""` = unfiled)
- DB migration (005):
  ```sql
  ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';
  -- Explicitly backfill existing rows so upgrading users land in a clean state
  UPDATE snippets SET folder = '' WHERE folder IS NULL;
  ```
  SQLite applies the DEFAULT to new rows automatically; the explicit UPDATE ensures any pre-existing rows are also set, following the same pattern as migration 004.

**Sidebar pane 1 changes:**
- A **Folder** filter section appears above the tag filter bar
- Shows all distinct folder names as clickable chips, plus an "All" chip (always present) and an "Unfiled" chip (shown only when any snippet has `folder === ""`)
- Selecting a folder filters the list; selecting "All" clears the folder filter
- Folder filter, tag filter, and search text are independent — all three can be active simultaneously

**Meta pane 3 changes:**
- A **Folder** field added above the Language selector
- Rendered as a `<datalist>` text input (type to create a new folder, or pick from existing ones)
- Saving the input on blur/Enter updates the snippet via `updateSnippet`

**Store changes:**
- `snippets.store.ts`: `add()` and `update()` pass through the `folder` field
- `db.ts`: insert/update queries include `folder`; `loadSnippets` selects it

**No changes to:**
- Sort logic (folders don't affect sort order within a filtered set)
- Favorites
- Export/import (folder field included automatically in JSON export)

### Files Changed
- `src/types/models.ts` — add `folder` to `Snippet` type and default
- `src/lib/db.ts` — update insert/update/select for snippets
- `src/stores/snippets.store.ts` — pass `folder` through add/update
- `src-tauri/migrations/005_snippets_folder.sql` — ALTER TABLE migration
- `src/tools/snippets/SnippetsManager.tsx` — folder filter chips in pane 1, folder input in pane 3

---

## B2 — Markdown Editor: PDF Export via Print

### What
Add a `↓ PDF` export button to the Markdown Editor toolbar that triggers the OS native print dialog (print-to-PDF).

### Design
- Button labeled `↓ PDF` placed alongside the existing `↓ MD` and `↓ HTML` download buttons
- On click: creates a hidden `<iframe>`, writes a fully-styled HTML document into it (reusing the existing `fullHtml` string from `handleExportHtml`), appends a `@media print { body { margin: 0 } }` block, then calls `iframe.contentWindow.print()`
- The iframe is removed from the DOM after the print dialog closes (via `afterprint` event or a 2-second fallback timeout)
- No new dependencies
- Works on macOS (Print → Save as PDF), Windows (Microsoft Print to PDF), and Linux (CUPS PDF)

### Architecture
- All logic lives in a new `handleExportPdf` callback inside `MarkdownEditor.tsx`
- Reuses the same `fullHtml` construction already used by `handleExportHtml` and `handleDownload('html')`
- The iframe approach is necessary because `window.print()` would print the entire Tauri WebView app UI

### Files Changed
- `src/tools/markdown-editor/MarkdownEditor.tsx` — add `handleExportPdf` callback and `↓ PDF` button

---

## Testing Notes

- A1: Visual verification — confirm live preview updates as color changes; confirm copies land correct CSS syntax
- A2: Unit test — add a case with empty string / null values to the CSV analyze test suite
- B1: Test that folder filter correctly intersects with tag filter and search; test that existing snippets with no folder appear under "Unfiled"
- B2: Manual verification only (print dialog is OS-level, not automatable in Vitest)

---

## Out of Scope

- JSON path query UI (already implemented in the Lint & Format tab)
- Code Formatter Python/Go/Rust support (requires system binary Tauri commands — deferred)
- API Client cURL import, history search, response diffing (deferred to future batch)
- Nested/tree folder hierarchy for Snippets (flat model chosen deliberately)
