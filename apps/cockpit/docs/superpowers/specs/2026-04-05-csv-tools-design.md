# CSV Tools Design Specification

**Date:** 2026-04-05
**Tool ID:** `csv-tools`
**Group:** Data
**Priority:** High (completes the Data tool suite alongside JSON/XML/YAML Tools)

---

## Overview

A comprehensive CSV tool for the cockpit app, providing viewing, editing, conversion, and analysis capabilities. Matches the depth and user experience of existing data tools (JSON Tools, XML Tools, YAML Tools) with a tabbed interface pattern.

**Core capabilities:**
- **View & Edit**: Interactive table with sorting, filtering, inline editing (TanStack Table)
- **Convert**: Bidirectional CSV ↔ JSON with round-trip fidelity and multiple output formats
- **Analyze**: Column statistics, data quality checks, and schema generation (TypeScript, JSON Schema, SQL)

---

## Architecture

### Approach

**Single component with tabbed interface** — matches JSON Tools pattern (3 tabs: Lint & Format, Tree View, Table View).

**Rationale:**
- Keeps related functionality in one place for discoverability
- Single tool registry entry, simpler navigation
- State managed in one object via `useToolState`
- Component size manageable (~500-800 lines total) with sub-component extraction

**Rejected alternatives:**
- Worker-based processing: Papa Parse is synchronous and fast for typical CSVs (< 1MB). Premature optimization.
- Multi-tool split: Fragmentation, loses context when switching between related tasks.

---

## Component Structure

### File Layout

```
src/tools/csv-tools/
├── CsvTools.tsx          # Main container, state management, tabs (400-500 lines)
├── CsvTable.tsx          # View & Edit tab - TanStack Table wrapper (200 lines)
├── CsvConvert.tsx        # Convert tab - CSV ↔ JSON conversion (250 lines)
├── CsvAnalyze.tsx        # Analyze tab - stats/quality/schema (300 lines)
└── utils.ts              # Papa parse helpers, type inference, metadata (150 lines)
```

### Tool Registration

```typescript
// src/app/tool-registry.ts
{
  id: 'csv-tools',
  name: 'CSV Tools',
  group: 'data',
  icon: 'CSV',
  description: 'View, edit, convert, and analyze CSV with table view, JSON conversion, and data profiling',
  component: CsvTools,
}
```

### State Shape

```typescript
type CsvToolsState = {
  input: string                    // Raw CSV text
  activeTab: 'view' | 'convert' | 'analyze'
  delimiter: ',' | '\t' | '|' | ';' | 'auto'
  hasHeader: boolean               // First row is headers
  jsonOutputFormat: 'array-of-objects' | 'object-of-arrays'
}
```

---

## Tab 1: View & Edit

### Features

**Table Display:**
- TanStack Table with virtual scrolling for large files (10K+ rows)
- Column header clicks for sorting (asc/desc)
- Column resizing via drag
- Per-column filter inputs (text contains, number range, date range)
- Inline cell editing (double-click to edit, auto-commit on blur)

**Import/Export:**
- "Open CSV" button — Tauri file dialog (existing pattern)
- "Download" button — Blob + anchor element
- Drag-and-drop file onto component

### Toolbar

```
[Format] [Clear] [Copy] [Download] | [Delimiter: ▼] [✓ Header row] | {stats: 5 cols · 234 rows · 45 KB}
```

### Edge Cases

- **Malformed CSV** (unclosed quotes, mixed delimiters) → Alert component shows Papa Parse error, table displays partial parse
- **Empty input** → Empty state: "Paste CSV or open a file"
- **Large files** (> 5MB) → Spinner during parse, then virtualized render

---

## Tab 2: Convert

### CSV → JSON Conversion

**Layout:**
- Left panel: Raw CSV from `state.input` (shared across tabs)
- Right panel: JSON output in Monaco Editor (read-only, syntax highlighted)

**Format Options:**

```typescript
// Array of objects (default)
[{"name": "Alice", "age": 30}]

// Object of arrays (columnar)
{"name": ["Alice", "Bob"], "age": [30, 25]}
```

**Configuration:**
- Delimiter selector: Auto-detect (default), Comma, Tab, Pipe, Semicolon
- Header toggle: "First row is headers" (checked by default)

**Actions:**
- [Convert to JSON] — Parse and display in output panel
- [Copy JSON] — Write output to clipboard
- [Download JSON] — Save output as `.json` file (Tauri save dialog)

### JSON → CSV Conversion

**Interface:**
- Arrow button: "↑ CSV from JSON" (switches direction)
- Left panel: Monaco Editor for JSON input
- Right panel: CSV output

**Round-Trip Fidelity:**

Store metadata in a special `__csv_meta__` field to preserve structure:

```json
{
  "__csv_meta__": {
    "columnOrder": ["name", "age"],
    "types": {"age": "number"}
  },
  "name": ["Alice", "Bob"],
  "age": [30, 25]
}
```

When converting back:
1. Strip `__csv_meta__` field
2. Restore original column order
3. Apply type coercion based on stored types

**Warning Handling:**
- Invalid JSON → Alert: "Parse error: Unexpected token at line 5"
- Nested objects → Alert: "Nested data will be JSON-stringified in CSV"
- Type mismatches → Inline warning with count

---

## Tab 3: Analyze

### Panel 1: Column Statistics (Expanded by Default)

One card per column:

**Number columns:**
- Min, max, mean, median, sum
- Null percentage

**Date columns:**
- Earliest, latest, range (days)
- Null percentage

**String columns:**
- Unique count, longest value length
- Null percentage

**Mixed-type columns:**
- Type breakdown (e.g., "60% number, 40% string")

Example:
```
age (number)
Min: 18 · Max: 87 · Mean: 42.3
Null: 0%

name (string)
Unique: 89 · Longest: 24 chars
Null: 3%
```

### Panel 2: Data Quality (Collapsed by Default)

Checks with click-to-action:

| Check | Pass/Fail | Action |
|-------|-----------|--------|
| Missing values | ✓/✗ | "3 cells (2%)" → highlight rows |
| Duplicate rows | ✓/✗ | "5 duplicates" → filter to show them |
| Inconsistent types | ✓/✗ | "Column 'age' has 12 strings, 88 numbers" → filter |
| Empty rows | ✓/✗ | "2 rows" → remove button |

### Panel 3: Schema Generation (Collapsed by Default)

Three export buttons with success toasts:

**TypeScript:**
```typescript
interface CsvRow {
  name: string;
  age: number;
  email: string | null;
}
```

**JSON Schema:**
- Draft-07 format
- Type inference for properties
- Required fields based on null analysis

**SQL CREATE TABLE:**
- Inferred types: VARCHAR, INTEGER, DATE, BOOLEAN
- NULL/NOT NULL based on data

### Analysis Triggers

- Auto-run on CSV change (debounced 500ms)
- Manual "Reanalyze" button if parse failed initially

---

## Dependencies

### New Dependency

**papaparse** (v5.4.1)
- 47KB minified
- Handles CSV parsing/unparsing
- Auto-detects delimiter, handles quoted fields with newlines

```typescript
// Parse
Papa.parse(csv, {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true
})

// Unparse
Papa.unparse(data, {
  quotes: true,
  header: true
})
```

### Existing Dependencies

- `@tanstack/react-table` (v8.21.3) — Table view
- `@monaco-editor/react` — JSON output display
- `zustand` — State via `useToolState`
- `@phosphor-icons/react` — Icons

---

## Implementation Notes

### Parse Flow

1. User pastes/loads CSV into `input` state
2. `Papa.parse(input, config)` runs on every change
3. Result stored in component ref (not state — avoid re-render)
4. Errors surface to Alert component
5. Active tab reads parsed data

### Type Inference Strategy

```typescript
// Single-pass inference per column
function inferColumnType(values: unknown[]): 'number' | 'date' | 'string' | 'mixed' {
  let numberCount = 0
  let dateCount = 0

  for (const val of values) {
    if (val === null || val === '') continue
    if (typeof val === 'number') numberCount++
    else if (isDateString(val)) dateCount++
  }

  const total = values.filter(v => v !== null && v !== '').length
  if (numberCount / total > 0.9) return 'number'
  if (dateCount / total > 0.9) return 'date'
  return 'string'
}
```

### TanStack Table Configuration

```typescript
const table = useReactTable({
  data: parsedData,
  columns: columnDefs,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  state: { sorting, columnFilters },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
})
```

---

## Testing Strategy

### Unit Tests

- Parse utils: delimiter detection, type inference, round-trip metadata
- Filtering/sorting logic
- Schema generation output

### Component Tests

- Each tab renders correct content
- Empty state, error state
- User interactions (cell edit, filter input, button clicks)

### Integration Tests

- CSV → JSON → CSV round-trip preserves data
- Large file handling (mock 10MB input)
- Malformed CSV recovery

### Test Location

```
src/tools/__tests__/csv-tools.test.tsx
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Convert (active in Convert tab) or Reanalyze (active in Analyze tab) |
| `Cmd+Shift+C` | Copy output (JSON in Convert, schema in Analyze) |

---

## Future Enhancements (Out of Scope)

- Streaming parse for files > 50MB (would require Worker)
- Custom delimiters (regex-based)
- CSV diff viewer (compare two CSVs)
- Pivot table/aggregations
- Chart visualization

---

## Success Metrics

- Parse + render 10K rows in < 100ms
- Round-trip CSV → JSON → CSV with 100% accuracy
- All existing DATA group tests pass after integration
- Component follows CODING_PATTERNS.md exactly
