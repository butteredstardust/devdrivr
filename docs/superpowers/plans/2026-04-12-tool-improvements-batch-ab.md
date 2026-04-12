# Tool Improvements Batch A&B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSS variable preview to Color Converter, null % to CSV Analyze column stats, flat folder organization to Snippets Manager, and PDF export to Markdown Editor.

**Architecture:** Four independent features — implement and commit each separately. B1 (Snippets folders) requires a DB migration and touches the most files; do it after the two quick wins (A1, A2). B2 (PDF export) is self-contained to one file. No new dependencies for any feature.

**Tech Stack:** React 19, TypeScript, Zustand 5, tauri-plugin-sql (SQLite), Vitest + Testing Library

---

## File Map

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| A1 | `src/tools/color-converter/ColorConverter.tsx` | — |
| A2 | `src/tools/csv-tools/CsvAnalyze.tsx` | — |
| A2 test | `src/tools/__tests__/csv-analyze.test.tsx` | — |
| B1 | `src/types/models.ts`, `src/lib/schemas.ts`, `src/lib/db.ts`, `src/stores/snippets.store.ts`, `src/tools/snippets/SnippetsManager.tsx` | `src-tauri/migrations/005_snippets_folder.sql` |
| B2 | `src/tools/markdown-editor/MarkdownEditor.tsx` | — |

---

## Task 1: A1 — Color Converter CSS Variable Preview Tab

**Files:**
- Modify: `apps/cockpit/src/tools/color-converter/ColorConverter.tsx`

### Context
`ColorConverter.tsx` has an `activeSection` state of type `'formats' | 'scale' | 'harmony'` and a section tab bar that switches between them. `ColorConverterState` is persisted via `useToolState`. The color is computed into `color.hex`, `color.rgb`, `color.hsl`, `color.hsb`, `color.oklch`.

- [ ] **Step 1: Add `cssVarName` to state and `'cssvar'` to the section type**

In `ColorConverter.tsx`, update the state type and initial value:

```tsx
// Change this line:
const [activeSection, setActiveSection] = useState<'formats' | 'scale' | 'harmony'>('formats')
// To:
const [activeSection, setActiveSection] = useState<'formats' | 'scale' | 'harmony' | 'cssvar'>('formats')
```

Add `cssVarName` to `ColorConverterState` and the `useToolState` call:

```tsx
// Change type:
type ColorConverterState = {
  input: string
  contrastFg: string
  contrastBg: string
  history: string[]
  cssVarName: string
}

// Change useToolState initial value — add the new field:
const [state, updateState] = useToolState<ColorConverterState>('color-converter', {
  input: '#39ff14',
  contrastFg: '#ffffff',
  contrastBg: '#000000',
  history: [],
  cssVarName: '--color-primary',
})
```

- [ ] **Step 2: Add the CSS Var tab button to the section tab bar**

Find the section tab bar (the `div` with `className="flex gap-2 border-b ..."` that maps over `['formats', 'scale', 'harmony']`). Change the array to include `'cssvar'`:

```tsx
{(['formats', 'scale', 'harmony', 'cssvar'] as const).map((tab) => (
  <button
    key={tab}
    onClick={() => setActiveSection(tab)}
    className={`px-3 py-1 text-xs font-mono rounded-t ${
      activeSection === tab
        ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
    }`}
  >
    {tab === 'formats' ? 'Formats' : tab === 'scale' ? 'Shades & Tints' : tab === 'harmony' ? 'Harmony' : 'CSS Var'}
  </button>
))}
```

- [ ] **Step 3: Add the CSS Var panel content**

After the closing `{activeSection === 'harmony' && ( ... )}` block and before the closing `</>` of the `{color && ( <> ... </> )}` block, add:

```tsx
{/* ── CSS Variable Preview ─────────────────────────── */}
{activeSection === 'cssvar' && (
  <section className="flex flex-col gap-4">
    {/* Variable name input */}
    <div className="flex items-center gap-3">
      <label className="text-xs text-[var(--color-text-muted)] shrink-0">Variable name</label>
      <Input
        value={state.cssVarName}
        onChange={(e) => updateState({ cssVarName: e.target.value })}
        placeholder="--color-primary"
        className="flex-1 font-mono"
      />
    </div>

    {/* Declarations to copy */}
    <div className="flex flex-col gap-2">
      {[
        { label: 'Hex', value: `${state.cssVarName}: ${color.hex};` },
        { label: 'RGB', value: `${state.cssVarName}: rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b});` },
        { label: 'HSL', value: `${state.cssVarName}: hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%);` },
        { label: 'OKLCH', value: `${state.cssVarName}: oklch(${color.oklch.l}% ${color.oklch.c} ${color.oklch.h});` },
      ].map((decl) => (
        <div
          key={decl.label}
          className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">{decl.label}: </span>
            <span className="font-mono text-sm text-[var(--color-text)]">{decl.value}</span>
          </div>
          <CopyButton text={decl.value} />
        </div>
      ))}
    </div>

    {/* Live UI mockup */}
    <div>
      <div className="mb-2 text-xs text-[var(--color-text-muted)]">Preview</div>
      <div
        className="flex flex-wrap items-center gap-3 rounded border border-[var(--color-border)] p-4"
        style={{ '--preview-color': color.hex } as React.CSSProperties}
      >
        {/* Surface swatch */}
        <div
          className="h-10 w-24 rounded border border-[var(--color-border)] flex items-center justify-center text-xs font-mono"
          style={{ backgroundColor: color.hex, color: color.hsl.l > 50 ? '#000' : '#fff' }}
        >
          surface
        </div>
        {/* Button */}
        <button
          className="rounded px-3 py-1.5 text-xs font-bold"
          style={{ backgroundColor: color.hex, color: color.hsl.l > 50 ? '#000' : '#fff' }}
        >
          Button
        </button>
        {/* Badge */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: color.hex + '33', color: color.hex }}
        >
          Badge
        </span>
        {/* Text */}
        <span className="text-sm font-bold" style={{ color: color.hex }}>
          Text color
        </span>
        {/* Border sample */}
        <div
          className="h-10 w-10 rounded"
          style={{ border: `2px solid ${color.hex}` }}
          title="border color"
        />
      </div>
    </div>
  </section>
)}
```

- [ ] **Step 4: Type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/color-converter/ColorConverter.tsx
git commit -m "feat(color-converter): add CSS variable preview tab"
```

---

## Task 2: A2 — CSV Analyze Null % Stats

**Files:**
- Modify: `apps/cockpit/src/tools/csv-tools/CsvAnalyze.tsx`
- Modify: `apps/cockpit/src/tools/__tests__/csv-analyze.test.tsx`

### Context
`CsvAnalyze.tsx` computes `columnStats` via `useMemo`. For each column it calls `inferColumnType(values)` then `calculateNumberStats` or `calculateStringStats`. The column card currently shows type + min/max (numbers) or unique count (strings). A null is `null`, `undefined`, or `""`.

- [ ] **Step 1: Write failing test for null % display**

Add to `src/tools/__tests__/csv-analyze.test.tsx`:

```tsx
it('shows null percentage for columns with missing values', () => {
  const dataWithNulls = [
    { name: 'Alice', score: 95 },
    { name: '', score: 88 },       // empty string = null
    { name: 'Charlie', score: 72 },
    { name: null, score: null },   // null = null
  ]
  render(<CsvAnalyze data={dataWithNulls as Record<string, unknown>[]} />)
  // 2 of 4 name values are null/empty → 50.0%
  expect(screen.getByText(/Nulls: 2 \(50\.0%\)/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/csv-analyze.test.tsx
```

Expected: FAIL — "Unable to find an element with the text: /Nulls: 2 (50.0%)/"

- [ ] **Step 3: Add null computation and display to CsvAnalyze.tsx**

In the `columnStats` `useMemo`, after the existing `stats` computation for each key, add `nullCount` and `nullPct`:

```tsx
const columnStats = useMemo(() => {
  const keys = Object.keys(data[0] ?? {})
  const result: Record<string, { type: ColumnType; stats: unknown; nullCount: number; nullPct: number }> = {}

  for (const key of keys) {
    const values = data.map((row) => row[key])
    const type = inferColumnType(values)

    let stats: unknown
    if (type === 'number') {
      stats = calculateNumberStats(values)
    } else {
      stats = calculateStringStats(values)
    }

    const nullCount = values.filter((v) => v === null || v === undefined || v === '').length
    const nullPct = data.length > 0 ? (nullCount / data.length) * 100 : 0

    result[key] = { type, stats, nullCount, nullPct }
  }

  return result
}, [data])
```

Then in the column card render, add the null display after the existing type/stats lines:

```tsx
{Object.entries(columnStats).map(([key, { type, stats, nullCount, nullPct }]) => (
  <div
    key={key}
    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
  >
    <div className="font-mono text-sm font-bold text-[var(--color-accent)]">{key}</div>
    <div className="text-[10px] text-[var(--color-text-muted)]">{type}</div>
    {type === 'number' && stats != null && (
      <div className="text-[10px] text-[var(--color-text-muted)]">
        Min: {String((stats as { min: number }).min)} · Max:{' '}
        {String((stats as { max: number }).max)}
      </div>
    )}
    {(type === 'string' || type === 'mixed') && stats != null && (
      <div className="text-[10px] text-[var(--color-text-muted)]">
        Unique: {String((stats as { unique: number }).unique)}
      </div>
    )}
    {nullCount > 0 && (
      <div className="text-[10px] text-[var(--color-warning)]">
        Nulls: {nullCount} ({nullPct.toFixed(1)}%)
      </div>
    )}
  </div>
))}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/csv-analyze.test.tsx
```

Expected: all tests PASS including the new null % test.

- [ ] **Step 5: Type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/tools/csv-tools/CsvAnalyze.tsx \
        apps/cockpit/src/tools/__tests__/csv-analyze.test.tsx
git commit -m "feat(csv-analyze): show null count and percentage per column"
```

---

## Task 3: B1 — Snippets Folder Organization (DB + Types)

**Files:**
- Create: `apps/cockpit/src-tauri/migrations/005_snippets_folder.sql`
- Modify: `apps/cockpit/src/types/models.ts`
- Modify: `apps/cockpit/src/lib/schemas.ts`
- Modify: `apps/cockpit/src/lib/db.ts`
- Modify: `apps/cockpit/src/stores/snippets.store.ts`

### Context
The migration system is Tauri's built-in SQL plugin migration runner. Migration files are in `src-tauri/migrations/` and run in filename order at DB startup. The current latest is `004_history_metadata.sql`. `SnippetRow` in `db.ts` is the raw DB shape; `Snippet` in `models.ts` is the app type. `snippetRowSchema` in `schemas.ts` transforms `SnippetRow → Snippet`. `saveSnippet` in `db.ts` must be updated to persist `folder`.

- [ ] **Step 1: Create the migration file**

Create `apps/cockpit/src-tauri/migrations/005_snippets_folder.sql`:

```sql
-- Add folder field for flat folder organization in Snippets Manager
ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';

-- Backfill existing rows so upgrading users land in a clean state
-- (SQLite applies DEFAULT to new rows automatically, but pre-existing rows need explicit update)
UPDATE snippets SET folder = '' WHERE folder IS NULL;
```

- [ ] **Step 2: Add `folder` to the `Snippet` type**

In `apps/cockpit/src/types/models.ts`, update the `Snippet` type:

```ts
export type Snippet = {
  id: string
  title: string
  content: string
  language: string
  tags: string[]
  folder: string
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 3: Update `snippetRowSchema` to include `folder`**

In `apps/cockpit/src/lib/schemas.ts`, update `snippetRowSchema`:

```ts
export const snippetRowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    language: z.string(),
    tags: z.string(),
    folder: z.string().optional().default(''),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform(
    (row): Snippet => ({
      id: row.id,
      title: row.title,
      content: row.content,
      language: row.language,
      tags: (() => {
        try {
          const parsed = JSON.parse(row.tags)
          const result = z.array(z.string()).safeParse(parsed)
          return result.success ? result.data : []
        } catch {
          return []
        }
      })(),
      folder: row.folder ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  )
```

Note: `folder` uses `.optional().default('')` so the schema handles rows from before the migration if somehow the column is missing.

- [ ] **Step 4: Update `SnippetRow` type and `saveSnippet` in `db.ts`**

In `apps/cockpit/src/lib/db.ts`, update the `SnippetRow` type and `saveSnippet`:

```ts
type SnippetRow = {
  id: string
  title: string
  content: string
  language: string
  tags: string
  folder: string
  created_at: number
  updated_at: number
}
```

Update `saveSnippet` to persist the `folder` field:

```ts
export async function saveSnippet(snippet: Snippet): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO snippets (id, title, content, language, tags, folder, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, folder=$6, updated_at=$8`,
    [
      snippet.id,
      snippet.title,
      snippet.content,
      snippet.language,
      JSON.stringify(snippet.tags),
      snippet.folder,
      snippet.createdAt,
      snippet.updatedAt,
    ]
  )
}
```

- [ ] **Step 5: Update `snippets.store.ts` to pass `folder` through**

In `apps/cockpit/src/stores/snippets.store.ts`, update the `SnippetsStore` type and `add`:

```ts
type SnippetsStore = {
  snippets: Snippet[]
  initialized: boolean
  saving: boolean
  init: () => Promise<void>
  add: (title: string, content: string, language: string, tags?: string[], folder?: string) => Promise<Snippet>
  update: (
    id: string,
    patch: Partial<Pick<Snippet, 'title' | 'content' | 'language' | 'tags' | 'folder'>>
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}
```

Update `add`:

```ts
add: async (title, content, language, tags = [], folder = '') => {
  const now = Date.now()
  const snippet: Snippet = {
    id: nanoid(),
    title,
    content,
    language,
    tags,
    folder,
    createdAt: now,
    updatedAt: now,
  }
  // ... rest of add unchanged
```

- [ ] **Step 6: Type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit the data layer**

```bash
git add apps/cockpit/src-tauri/migrations/005_snippets_folder.sql \
        apps/cockpit/src/types/models.ts \
        apps/cockpit/src/lib/schemas.ts \
        apps/cockpit/src/lib/db.ts \
        apps/cockpit/src/stores/snippets.store.ts
git commit -m "feat(snippets): add folder field — migration, types, schema, db, store"
```

---

## Task 4: B1 — Snippets Folder Organization (UI)

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

### Context
`SnippetsManager.tsx` is a 3-pane layout: `[01-SELECT]` (snippet list + search/sort/tags), `[02-EDIT]` (Monaco editor), `[03-META]` (language, tags, stats). The tag filter uses a `TagFilterBar` component and a `filterTag: string | null` state. We add parallel `filterFolder: string | null` state. The folder filter chips render above the tag chips. Meta pane 3 gets a folder input using a `<datalist>` for autocomplete.

- [ ] **Step 1: Add `filterFolder` state and `FolderFilterBar` component**

At the top of the component, after `const [filterTag, setFilterTag] = useState<string | null>(null)`, add:

```tsx
const [filterFolder, setFilterFolder] = useState<string | null>(null)
```

Add a `FolderFilterBar` component (above or below `TagFilterBar` in the file):

```tsx
function FolderFilterBar({
  folders,
  filterFolder,
  onFilterFolder,
  hasUnfiled,
}: {
  folders: string[]
  filterFolder: string | null
  onFilterFolder: (folder: string | null) => void
  hasUnfiled: boolean
}) {
  const allFolders = hasUnfiled ? [...folders, '__unfiled__'] : folders
  if (allFolders.length === 0) return null

  return (
    <div className="border-b border-[var(--color-border)] px-3 py-1.5">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        Folders
      </div>
      <div className="flex flex-wrap gap-1">
        {filterFolder && (
          <button
            onClick={() => onFilterFolder(null)}
            className="rounded bg-[var(--color-error)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-error)]"
          >
            ✕ All
          </button>
        )}
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => onFilterFolder(filterFolder === folder ? null : folder)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              filterFolder === folder
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30'
            }`}
          >
            {folder}
          </button>
        ))}
        {hasUnfiled && (
          <button
            onClick={() => onFilterFolder(filterFolder === '__unfiled__' ? null : '__unfiled__')}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              filterFolder === '__unfiled__'
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Unfiled
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Compute `allFolders` and `hasUnfiled` in the component**

After the `allTags` useMemo, add:

```tsx
const allFolders = useMemo(() => {
  const folderSet = new Set<string>()
  for (const s of snippets) {
    if (s.folder && s.folder.trim()) folderSet.add(s.folder.trim())
  }
  return [...folderSet].sort()
}, [snippets])

const hasUnfiled = useMemo(
  () => snippets.some((s) => !s.folder || !s.folder.trim()),
  [snippets]
)
```

- [ ] **Step 3: Add folder filter to the `filtered` useMemo**

In the `filtered` useMemo, after the `if (filterTag)` block, add:

```tsx
// Filter by folder
if (filterFolder) {
  if (filterFolder === '__unfiled__') {
    list = list.filter((s) => !s.folder || !s.folder.trim())
  } else {
    list = list.filter((s) => s.folder === filterFolder)
  }
}
```

Also add `filterFolder` to the dependency array:

```tsx
}, [snippets, search, fuse, sortMode, filterTag, filterFolder])
```

- [ ] **Step 4: Render `FolderFilterBar` in pane 1**

In pane 1's JSX, add `FolderFilterBar` above the existing tag filter section (the `{allTags.length > 0 && <TagFilterBar ... />}` block):

```tsx
{(allFolders.length > 0 || hasUnfiled) && (
  <FolderFilterBar
    folders={allFolders}
    filterFolder={filterFolder}
    onFilterFolder={setFilterFolder}
    hasUnfiled={hasUnfiled}
  />
)}
```

- [ ] **Step 5: Add folder input to meta pane 3**

In pane 3, inside the `{selected ? ( ... ) : ...}` block, add a Folder section above the existing Language section. First add a `folderInputId` for the datalist:

```tsx
const folderDatalistId = 'snippet-folders-datalist'
```

Then in the pane 3 JSX, before the Language section:

```tsx
{/* Folder */}
<div>
  <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
    Folder
  </div>
  <input
    list={folderDatalistId}
    value={selected.folder ?? ''}
    onChange={(e) => updateSnippet(selected.id, { folder: e.target.value })}
    placeholder="No folder"
    className="w-full bg-transparent px-1 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none border-b border-transparent focus:border-[var(--color-accent)]"
  />
  <datalist id={folderDatalistId}>
    {allFolders.map((f) => (
      <option key={f} value={f} />
    ))}
  </datalist>
</div>
```

- [ ] **Step 6: Run tests**

```bash
cd apps/cockpit && bun run test
```

Expected: all tests pass. (No new tests required for UI-only changes — the data layer is covered by existing snippet tests.)

- [ ] **Step 7: Type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "feat(snippets): folder filter in sidebar and folder input in meta pane"
```

---

## Task 5: B2 — Markdown Editor PDF Export

**Files:**
- Modify: `apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx`

### Context
`MarkdownEditor.tsx` already has `handleExportHtml` which builds `fullHtml` — a complete standalone HTML doc with styles. It also has `handleDownload('html')` which downloads a similar doc. PDF export reuses this HTML, writes it into a hidden iframe, and calls `iframe.contentWindow.print()`. The iframe is removed after print via the `afterprint` event (with a fallback timeout). No new deps.

- [ ] **Step 1: Add `handleExportPdf` callback**

In `MarkdownEditor.tsx`, after the `handleDownload` callback definition, add:

```tsx
const handleExportPdf = useCallback(() => {
  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Export</title>
<style>
body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
th{background:#f8f8f8}
blockquote{border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666}
img{max-width:100%}
@media print{body{margin:0}}
</style>
</head><body>${html}</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-9999px'
  iframe.style.left = '-9999px'
  iframe.style.width = '0'
  iframe.style.height = '0'
  document.body.appendChild(iframe)

  const cleanup = () => {
    if (document.body.contains(iframe)) document.body.removeChild(iframe)
  }

  iframe.onload = () => {
    if (!iframe.contentWindow) {
      cleanup()
      return
    }
    iframe.contentWindow.addEventListener('afterprint', cleanup)
    // Fallback: remove iframe after 30s in case afterprint doesn't fire (some Tauri WebViews)
    setTimeout(cleanup, 30_000)
    iframe.contentWindow.print()
  }

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!doc) {
    cleanup()
    return
  }
  doc.open()
  doc.write(fullHtml)
  doc.close()

  setLastAction('Print dialog opened', 'info')
}, [html, setLastAction])
```

- [ ] **Step 2: Add the `↓ PDF` button to the toolbar**

In the header toolbar, the download buttons are currently:

```tsx
<button onClick={() => handleDownload('md')} ...>↓ MD</button>
<button onClick={() => handleDownload('html')} ...>↓ HTML</button>
```

Add the PDF button immediately after `↓ HTML`:

```tsx
<button
  onClick={handleExportPdf}
  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
  title="Print / Save as PDF"
>
  ↓ PDF
</button>
```

- [ ] **Step 3: Type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual verification**

- Open the app (`bun run tauri dev`)
- Go to Markdown Editor, write some content with headings, bold, a code block
- Click `↓ PDF` — the OS print dialog should appear
- On macOS: verify you can Save as PDF and the output renders the document content (not the app chrome)

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx
git commit -m "feat(markdown-editor): add PDF export via print dialog"
```

---

## Task 6: Final QA and Push

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/cockpit && bun run test
```

Expected: all tests pass.

- [ ] **Step 2: Full type-check**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Push the branch**

```bash
git push
```

---

## Self-Review Notes

**Spec coverage:**
- A1 (CSS variable preview) → Task 1 ✓
- A2 (CSV null %) → Task 2 ✓
- B1 (Snippets folders — migration + types + schema + db + store) → Task 3 ✓
- B1 (Snippets folders — UI) → Task 4 ✓
- B2 (Markdown PDF export) → Task 5 ✓
- Migration backfill for existing rows → Task 3 Step 1 ✓
- Export/import JSON for snippets automatically includes `folder` (it's on the `Snippet` type) ✓

**Type consistency:**
- `folder` added to `Snippet` type in Task 3 Step 2, used in store (Task 3 Step 5), schema (Task 3 Step 3), db (Task 3 Step 4), and UI (Task 4 Steps 1–5) — consistent throughout.
- `filterFolder` state introduced in Task 4 Step 1, referenced in Task 4 Steps 2–4 — consistent.
- `FolderFilterBar` props (`folders`, `filterFolder`, `onFilterFolder`, `hasUnfiled`) defined and used consistently.
- `__unfiled__` sentinel string used consistently in Task 4 Steps 1 and 3.
- `handleExportPdf` defined in Task 5 Step 1, referenced in Task 5 Step 2 — consistent.
