# Developer Cockpit — Plan 4: System Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the final 3 tools (API Client, Docs Browser, Snippets Manager) and the cross-cutting system features: full Notes drawer with CRUD and search, History system with logging and replay, and the cross-tool "Send to" flow. After this plan, all 28 tools are functional and all system features from the PRD are operational.

**Quality standards (same as Plans 2-3, enforced throughout):**
- Typed state, no `any`, no unjustified `as` casts
- All actions report to status bar via `setLastAction()`
- Errors caught and displayed — never swallowed
- Design tokens only (`var(--color-*)`)
- SQLite parameterized queries only — no string interpolation
- `nanoid` for all new record IDs

**Base stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, Tauri 2

**No new npm dependencies needed.** All required packages are already installed:
- `@tauri-apps/plugin-http` — API Client HTTP requests (no CORS)
- `@monaco-editor/react` — Snippets editor, API Client body editor
- `fuse.js` — Fuzzy search for snippets, notes, command palette
- `nanoid` — ID generation for notes, snippets, history entries
- `@tauri-apps/plugin-fs` — File I/O (already in capabilities)

**Spec:** `/Users/tuxgeek/Dev/devdrivr/developer_cockpit_prd.md` (sections 6.8–6.12, 7.1–7.3)

**Plan series:**
- **Plan 1:** Foundation & Shell (complete)
- **Plan 2:** Editor-Based Tools (complete)
- **Plan 3:** Utility Tools (complete)
- **Plan 4 (this):** System Features

---

## Established Patterns (same as Plans 2-3)

Subagents: read the files referenced below before writing code to understand the actual API shapes.

- **Settings store** — flat shape: `useSettingsStore((s) => s.theme)`, NOT `s.settings.theme`. See `stores/settings.store.ts`.
- **Tool state** — `useToolState<T>(toolId, defaultState)` returns `[state, updateState]`. See `hooks/useToolState.ts`.
- **Status bar** — `useUiStore((s) => s.setLastAction)` then call `setLastAction(msg, type)`.
- **DB access** — `lib/db.ts` exports `getDb()`, `getSetting`, `setSetting`, `loadToolState`, `saveToolState`. New CRUD functions for notes/snippets/history go in this file.
- **Copy** — Use `CopyButton` component on all copyable outputs.
- **Monaco** — `useMonacoTheme()` + `EDITOR_OPTIONS` from `hooks/useMonaco.ts`.
- **CSS classes** — See Plan 3 header for button/input/surface conventions.

---

## File Structure (Plan 4 additions and modifications)

```
apps/cockpit/src/
├── lib/
│   └── db.ts                                  # MODIFY: add CRUD for notes, snippets, history
├── stores/
│   ├── notes.store.ts                         # CREATE: Zustand store for notes
│   ├── snippets.store.ts                      # CREATE: Zustand store for snippets
│   └── history.store.ts                       # CREATE: Zustand store for history
├── components/
│   └── shell/
│       └── NotesDrawer.tsx                    # MODIFY: full implementation with tabs (Notes/History)
├── tools/
│   ├── api-client/
│   │   └── ApiClient.tsx                      # CREATE
│   ├── docs-browser/
│   │   └── DocsBrowser.tsx                    # CREATE
│   └── snippets/
│       └── SnippetsManager.tsx                # CREATE
└── app/
    └── tool-registry.ts                       # MODIFY: wire up final 3 tools
```

---

## Task 1: Database CRUD Functions (Notes, Snippets, History)

**Files:**
- Modify: `apps/cockpit/src/lib/db.ts`

**Context:** The SQLite tables already exist (created in Plan 1's `001_initial.sql`). We need typed CRUD functions for notes, snippets, and history. All queries use parameterized bindings.

**Add these functions to the end of `db.ts`:**

```typescript
import type { Note, NoteColor, Snippet, HistoryEntry } from '@/types/models'

// --- Notes ---

type NoteRow = {
  id: string
  title: string
  content: string
  color: string
  pinned: number
  popped_out: number
  window_x: number | null
  window_y: number | null
  window_width: number | null
  window_height: number | null
  created_at: number
  updated_at: number
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    color: row.color as NoteColor,
    pinned: row.pinned === 1,
    poppedOut: row.popped_out === 1,
    windowBounds:
      row.window_x != null && row.window_y != null && row.window_width != null && row.window_height != null
        ? { x: row.window_x, y: row.window_y, width: row.window_width, height: row.window_height }
        : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadNotes(): Promise<Note[]> {
  const conn = await getDb()
  const rows = await conn.select<NoteRow[]>('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC')
  return rows.map(rowToNote)
}

export async function saveNote(note: Note): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO notes (id, title, content, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, color=$4, pinned=$5, popped_out=$6, window_x=$7, window_y=$8, window_width=$9, window_height=$10, updated_at=$12`,
    [
      note.id, note.title, note.content, note.color,
      note.pinned ? 1 : 0, note.poppedOut ? 1 : 0,
      note.windowBounds?.x ?? null, note.windowBounds?.y ?? null,
      note.windowBounds?.width ?? null, note.windowBounds?.height ?? null,
      note.createdAt, note.updatedAt,
    ]
  )
}

export async function deleteNote(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM notes WHERE id = $1', [id])
}

// --- Snippets ---

type SnippetRow = {
  id: string
  title: string
  content: string
  language: string
  tags: string
  created_at: number
  updated_at: number
}

function rowToSnippet(row: SnippetRow): Snippet {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadSnippets(): Promise<Snippet[]> {
  const conn = await getDb()
  const rows = await conn.select<SnippetRow[]>('SELECT * FROM snippets ORDER BY updated_at DESC')
  return rows.map(rowToSnippet)
}

export async function saveSnippet(snippet: Snippet): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `INSERT INTO snippets (id, title, content, language, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, language=$4, tags=$5, updated_at=$7`,
    [snippet.id, snippet.title, snippet.content, snippet.language, JSON.stringify(snippet.tags), snippet.createdAt, snippet.updatedAt]
  )
}

export async function deleteSnippet(id: string): Promise<void> {
  const conn = await getDb()
  await conn.execute('DELETE FROM snippets WHERE id = $1', [id])
}

// --- History ---

type HistoryRow = {
  id: string
  tool: string
  sub_tab: string | null
  input: string
  output: string
  timestamp: number
}

function rowToHistory(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    tool: row.tool,
    subTab: row.sub_tab ?? undefined,
    input: row.input,
    output: row.output,
    timestamp: row.timestamp,
  }
}

export async function loadHistory(tool?: string, limit: number = 100): Promise<HistoryEntry[]> {
  const conn = await getDb()
  if (tool) {
    return (await conn.select<HistoryRow[]>(
      'SELECT * FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2',
      [tool, limit]
    )).map(rowToHistory)
  }
  return (await conn.select<HistoryRow[]>(
    'SELECT * FROM history ORDER BY timestamp DESC LIMIT $1',
    [limit]
  )).map(rowToHistory)
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO history (id, tool, sub_tab, input, output, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
    [entry.id, entry.tool, entry.subTab ?? null, entry.input, entry.output, entry.timestamp]
  )
}

export async function pruneHistory(tool: string, keepCount: number): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    `DELETE FROM history WHERE tool = $1 AND id NOT IN (
       SELECT id FROM history WHERE tool = $1 ORDER BY timestamp DESC LIMIT $2
     )`,
    [tool, keepCount]
  )
}
```

**Verification:** TypeScript compiles. Functions match the SQLite schema from `001_initial.sql`.

---

## Task 2: Notes Store + Snippets Store + History Store

**Files:**
- Create: `apps/cockpit/src/stores/notes.store.ts`
- Create: `apps/cockpit/src/stores/snippets.store.ts`
- Create: `apps/cockpit/src/stores/history.store.ts`

**Context:** Zustand stores with SQLite persistence. Each store loads from DB on `init()`, then writes through on mutations.

### notes.store.ts

```typescript
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteColor } from '@/types/models'
import { loadNotes, saveNote, deleteNote } from '@/lib/db'

type NotesStore = {
  notes: Note[]
  initialized: boolean
  init: () => Promise<void>
  add: (title?: string, content?: string, color?: NoteColor) => Promise<Note>
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'poppedOut' | 'windowBounds'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useNotesStore = create<NotesStore>()((set, get) => ({
  notes: [],
  initialized: false,

  init: async () => {
    const notes = await loadNotes()
    set({ notes, initialized: true })
  },

  add: async (title = '', content = '', color: NoteColor = 'yellow') => {
    const now = Date.now()
    const note: Note = {
      id: nanoid(),
      title,
      content,
      color,
      pinned: false,
      poppedOut: false,
      createdAt: now,
      updatedAt: now,
    }
    await saveNote(note)
    set((s) => ({ notes: [note, ...s.notes] }))
    return note
  },

  update: async (id, patch) => {
    const notes = get().notes
    const idx = notes.findIndex((n) => n.id === id)
    if (idx < 0) return
    const updated = { ...notes[idx]!, ...patch, updatedAt: Date.now() }
    await saveNote(updated)
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? updated : n)),
    }))
  },

  remove: async (id) => {
    await deleteNote(id)
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },
}))
```

### snippets.store.ts

```typescript
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Snippet } from '@/types/models'
import { loadSnippets, saveSnippet, deleteSnippet } from '@/lib/db'

type SnippetsStore = {
  snippets: Snippet[]
  initialized: boolean
  init: () => Promise<void>
  add: (title: string, content: string, language: string, tags?: string[]) => Promise<Snippet>
  update: (id: string, patch: Partial<Pick<Snippet, 'title' | 'content' | 'language' | 'tags'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useSnippetsStore = create<SnippetsStore>()((set, get) => ({
  snippets: [],
  initialized: false,

  init: async () => {
    const snippets = await loadSnippets()
    set({ snippets, initialized: true })
  },

  add: async (title, content, language, tags = []) => {
    const now = Date.now()
    const snippet: Snippet = {
      id: nanoid(),
      title,
      content,
      language,
      tags,
      createdAt: now,
      updatedAt: now,
    }
    await saveSnippet(snippet)
    set((s) => ({ snippets: [snippet, ...s.snippets] }))
    return snippet
  },

  update: async (id, patch) => {
    const snippets = get().snippets
    const idx = snippets.findIndex((s) => s.id === id)
    if (idx < 0) return
    const updated = { ...snippets[idx]!, ...patch, updatedAt: Date.now() }
    await saveSnippet(updated)
    set((s) => ({
      snippets: s.snippets.map((sn) => (sn.id === id ? updated : sn)),
    }))
  },

  remove: async (id) => {
    await deleteSnippet(id)
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }))
  },
}))
```

### history.store.ts

```typescript
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { HistoryEntry } from '@/types/models'
import { loadHistory, addHistoryEntry, pruneHistory } from '@/lib/db'

type HistoryStore = {
  entries: HistoryEntry[]
  initialized: boolean
  init: () => Promise<void>
  add: (tool: string, input: string, output: string, subTab?: string) => Promise<void>
  loadForTool: (tool: string) => Promise<HistoryEntry[]>
  reload: () => Promise<void>
}

export const useHistoryStore = create<HistoryStore>()((set) => ({
  entries: [],
  initialized: false,

  init: async () => {
    const entries = await loadHistory(undefined, 200)
    set({ entries, initialized: true })
  },

  add: async (tool, input, output, subTab) => {
    const entry: HistoryEntry = {
      id: nanoid(),
      tool,
      subTab,
      input,
      output,
      timestamp: Date.now(),
    }
    await addHistoryEntry(entry)
    // Prune to keep max 500 per tool
    await pruneHistory(tool, 500)
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) }))
  },

  loadForTool: async (tool) => {
    return loadHistory(tool, 100)
  },

  reload: async () => {
    const entries = await loadHistory(undefined, 200)
    set({ entries })
  },
}))
```

**Verification:** TypeScript compiles. Stores use correct DB function signatures from Task 1.

---

## Task 3: Full Notes Drawer Implementation

**Files:**
- Modify: `apps/cockpit/src/components/shell/NotesDrawer.tsx`
- Modify: `apps/cockpit/src/app/providers.tsx` (init notes + snippets + history stores)

**Context:** PRD 6.11 + 6.12. The drawer has two tabs: Notes and History. Notes tab shows note cards with color labels, pin toggle, inline editing. History tab shows recent operations.

### NotesDrawer.tsx (full rewrite)

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { TabBar } from '@/components/shared/TabBar'
import type { NoteColor } from '@/types/models'

const DRAWER_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'History' },
]

const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray']

const COLOR_MAP: Record<NoteColor, string> = {
  yellow: 'bg-yellow-500/20 border-yellow-500/30',
  green: 'bg-green-500/20 border-green-500/30',
  blue: 'bg-blue-500/20 border-blue-500/30',
  pink: 'bg-pink-500/20 border-pink-500/30',
  purple: 'bg-purple-500/20 border-purple-500/30',
  orange: 'bg-orange-500/20 border-orange-500/30',
  red: 'bg-red-500/20 border-red-500/30',
  gray: 'bg-gray-500/20 border-gray-500/30',
}

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const notes = useNotesStore((s) => s.notes)
  const addNote = useNotesStore((s) => s.add)
  const updateNote = useNotesStore((s) => s.update)
  const removeNote = useNotesStore((s) => s.remove)
  const historyEntries = useHistoryStore((s) => s.entries)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [activeTab, setActiveTab] = useState('notes')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')

  const fuse = useMemo(
    () => new Fuse(notes, { keys: ['title', 'content'], threshold: 0.4 }),
    [notes]
  )

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes
    return fuse.search(search).map((r) => r.item)
  }, [notes, search, fuse])

  const filteredHistory = useMemo(() => {
    if (!historyFilter) return historyEntries
    return historyEntries.filter((e) => e.tool === historyFilter)
  }, [historyEntries, historyFilter])

  const handleAddNote = useCallback(async () => {
    const note = await addNote('New note', '', 'yellow')
    setEditingId(note.id)
    setLastAction('Note created', 'success')
  }, [addNote, setLastAction])

  const handleDelete = useCallback(async (id: string) => {
    await removeNote(id)
    setLastAction('Note deleted', 'info')
  }, [removeNote, setLastAction])

  const handleHistoryReplay = useCallback((tool: string, input: string) => {
    setActiveTool(tool)
    // The tool will load its state from useToolState — we can't inject input directly
    // But we can navigate to it; user can use history to remember what they did
    setLastAction(`Switched to ${tool}`, 'info')
  }, [setActiveTool, setLastAction])

  if (!drawerOpen) return null

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)]">
        <TabBar tabs={DRAWER_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {activeTab === 'notes' && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={handleAddNote}
              className="rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
            >
              +
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredNotes.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                {search ? 'No matching notes' : 'No notes yet — click + to create one'}
              </div>
            )}
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`mb-2 rounded border p-2 ${COLOR_MAP[note.color] ?? 'bg-[var(--color-surface)] border-[var(--color-border)]'}`}
              >
                {editingId === note.id ? (
                  <div className="flex flex-col gap-1">
                    <input
                      value={note.title}
                      onChange={(e) => updateNote(note.id, { title: e.target.value })}
                      placeholder="Title"
                      className="bg-transparent text-xs font-bold text-[var(--color-text)] outline-none"
                      autoFocus
                    />
                    <textarea
                      value={note.content}
                      onChange={(e) => updateNote(note.id, { content: e.target.value })}
                      placeholder="Write something..."
                      rows={4}
                      className="resize-none bg-transparent text-xs text-[var(--color-text)] outline-none"
                    />
                    <div className="flex items-center gap-1">
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateNote(note.id, { color: c })}
                          className={`h-4 w-4 rounded-full border ${note.color === c ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
                          style={{ backgroundColor: `var(--note-${c}, ${c})` }}
                          title={c}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setEditingId(null)}
                      className="mt-1 self-end text-xs text-[var(--color-accent)] hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <span
                        className="cursor-pointer text-xs font-bold text-[var(--color-text)] hover:underline"
                        onClick={() => setEditingId(note.id)}
                      >
                        {note.title || 'Untitled'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateNote(note.id, { pinned: !note.pinned })}
                          className={`text-xs ${note.pinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                          title={note.pinned ? 'Unpin' : 'Pin'}
                        >
                          {note.pinned ? '★' : '☆'}
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {note.content && (
                      <p className="mt-1 line-clamp-3 text-xs text-[var(--color-text-muted)]">{note.content}</p>
                    )}
                    <div className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            >
              <option value="">All tools</option>
              {Array.from(new Set(historyEntries.map((e) => e.tool))).map((tool) => (
                <option key={tool} value={tool}>{tool}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {filteredHistory.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                No history yet
              </div>
            )}
            {filteredHistory.map((entry) => (
              <div
                key={entry.id}
                className="mb-2 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleHistoryReplay(entry.tool, entry.input)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-accent)]">{entry.tool}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                  {entry.input.slice(0, 100)}{entry.input.length > 100 ? '...' : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
```

### providers.tsx update

The `providers.tsx` currently initializes the settings store. Add initialization for notes, snippets, and history stores alongside it.

Read the current `providers.tsx` first, then add these store inits to the existing `useEffect`:

```typescript
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'

// Inside the provider component's useEffect where settings.init() is called:
useNotesStore.getState().init()
useSnippetsStore.getState().init()
useHistoryStore.getState().init()
```

**Verification:** Notes drawer opens with Cmd/Ctrl+Shift+N. Can create/edit/delete notes. Color picker works. Pin toggle works. History tab shows entries. Search filters notes.

---

## Task 4: Snippets Manager Tool

**Files:**
- Create: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

**Context:** PRD 6.10. Create/edit/delete snippets. Monaco editor for content. Fuzzy search. Import/export JSON.

```typescript
import { useCallback, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import Fuse from 'fuse.js'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

const LANGUAGES = [
  'javascript', 'typescript', 'json', 'css', 'html', 'markdown',
  'sql', 'python', 'yaml', 'xml', 'bash', 'text',
]

export default function SnippetsManager() {
  useMonacoTheme()
  const snippets = useSnippetsStore((s) => s.snippets)
  const addSnippet = useSnippetsStore((s) => s.add)
  const updateSnippet = useSnippetsStore((s) => s.update)
  const removeSnippet = useSnippetsStore((s) => s.remove)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  const fuse = useMemo(
    () => new Fuse(snippets, { keys: ['title', 'content', 'tags'], threshold: 0.4 }),
    [snippets]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return snippets
    return fuse.search(search).map((r) => r.item)
  }, [snippets, search, fuse])

  const selected = useMemo(
    () => snippets.find((s) => s.id === selectedId) ?? null,
    [snippets, selectedId]
  )

  const handleNew = useCallback(async () => {
    const snippet = await addSnippet('Untitled', '', 'javascript')
    setSelectedId(snippet.id)
    setLastAction('Snippet created', 'success')
  }, [addSnippet, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    await removeSnippet(selectedId)
    setSelectedId(null)
    setLastAction('Snippet deleted', 'info')
  }, [selectedId, removeSnippet, setLastAction])

  const handleAddTag = useCallback(() => {
    if (!selected || !tagInput.trim()) return
    const newTags = [...selected.tags, tagInput.trim()]
    updateSnippet(selected.id, { tags: newTags })
    setTagInput('')
  }, [selected, tagInput, updateSnippet])

  const handleRemoveTag = useCallback((tag: string) => {
    if (!selected) return
    updateSnippet(selected.id, { tags: selected.tags.filter((t) => t !== tag) })
  }, [selected, updateSnippet])

  const handleExport = useCallback(() => {
    const data = JSON.stringify(snippets, null, 2)
    navigator.clipboard.writeText(data)
    setLastAction(`Exported ${snippets.length} snippets to clipboard`, 'success')
  }, [snippets, setLastAction])

  const handleImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const imported = JSON.parse(text) as Array<Record<string, unknown>>
      for (const item of imported) {
        if (typeof item['title'] === 'string' && typeof item['content'] === 'string') {
          await addSnippet(
            item['title'],
            item['content'],
            typeof item['language'] === 'string' ? item['language'] : 'text',
            Array.isArray(item['tags']) ? item['tags'] as string[] : []
          )
        }
      }
      setLastAction(`Imported ${imported.length} snippets`, 'success')
    } catch (e) {
      setLastAction('Import failed — paste valid JSON array', 'error')
    }
  }, [addSnippet, setLastAction])

  return (
    <div className="flex h-full">
      {/* Sidebar: snippet list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={handleNew}
            className="rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1">
          <button onClick={handleExport} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Export</button>
          <button onClick={handleImport} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Import</button>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.map((snippet) => (
            <button
              key={snippet.id}
              onClick={() => setSelectedId(snippet.id)}
              className={`flex w-full flex-col border-b border-[var(--color-border)] px-3 py-2 text-left ${
                selectedId === snippet.id ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <span className="text-xs font-bold text-[var(--color-text)]">{snippet.title || 'Untitled'}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{snippet.language}</span>
              {snippet.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {snippet.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[var(--color-accent-dim)] px-1 text-[10px] text-[var(--color-accent)]">{tag}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              {search ? 'No matching snippets' : 'No snippets yet'}
            </div>
          )}
        </div>
      </div>

      {/* Main: editor */}
      {selected ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
            <input
              value={selected.title}
              onChange={(e) => updateSnippet(selected.id, { title: e.target.value })}
              placeholder="Snippet title"
              className="flex-1 bg-transparent text-sm font-bold text-[var(--color-text)] outline-none"
            />
            <select
              value={selected.language}
              onChange={(e) => updateSnippet(selected.id, { language: e.target.value })}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <CopyButton text={selected.content} />
            <button
              onClick={handleDelete}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
            >
              Delete
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1">
            {selected.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-xs text-[var(--color-accent)]"
              >
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="hover:text-[var(--color-error)]">×</button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
              placeholder="Add tag..."
              className="bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
          <div className="flex-1">
            <Editor
              language={selected.language}
              value={selected.content}
              onChange={(v) => updateSnippet(selected.id, { content: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Select a snippet or create a new one
        </div>
      )}
    </div>
  )
}
```

**Verification:** Create snippet → edit title, content, language, tags. Search filters list. Copy content. Export/Import via clipboard JSON.

---

## Task 5: API Client Tool

**Files:**
- Create: `apps/cockpit/src/tools/api-client/ApiClient.tsx`

**Context:** PRD 6.8. Method selector, URL input, headers key-value editor, body editor (Monaco), send via `@tauri-apps/plugin-http`, response panel with status/headers/body/timing.

```typescript
import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

type Header = { key: string; value: string; enabled: boolean }

type ApiClientState = {
  method: string
  url: string
  headers: Header[]
  body: string
  bodyMode: string
}

type ResponseData = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  time: number
}

const RESPONSE_TABS = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
]

export default function ApiClient() {
  useMonacoTheme()
  const [state, updateState] = useToolState<ApiClientState>('api-client', {
    method: 'GET',
    url: '',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    body: '',
    bodyMode: 'json',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responseTab, setResponseTab] = useState('body')

  const handleSend = useCallback(async () => {
    if (!state.url.trim()) {
      setLastAction('Enter a URL', 'error')
      return
    }

    setLoading(true)
    setError(null)
    const start = performance.now()

    try {
      const headers: Record<string, string> = {}
      for (const h of state.headers) {
        if (h.enabled && h.key.trim()) {
          headers[h.key] = h.value
        }
      }

      const opts: RequestInit = {
        method: state.method,
        headers,
      }
      if (state.method !== 'GET' && state.method !== 'HEAD' && state.body.trim()) {
        opts.body = state.body
      }

      const res = await tauriFetch(state.url, opts)
      const time = Math.round(performance.now() - start)
      const body = await res.text()

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })

      setResponse({ status: res.status, statusText: res.statusText, headers: resHeaders, body, time })
      setLastAction(`${res.status} ${res.statusText} (${time}ms)`, res.ok ? 'success' : 'error')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Request failed', 'error')
    } finally {
      setLoading(false)
    }
  }, [state, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSend)

  const addHeader = useCallback(() => {
    updateState({ headers: [...state.headers, { key: '', value: '', enabled: true }] })
  }, [state.headers, updateState])

  const updateHeader = useCallback((index: number, patch: Partial<Header>) => {
    const headers = state.headers.map((h, i) => (i === index ? { ...h, ...patch } : h))
    updateState({ headers })
  }, [state.headers, updateState])

  const removeHeader = useCallback((index: number) => {
    updateState({ headers: state.headers.filter((_, i) => i !== index) })
  }, [state.headers, updateState])

  // Try to prettify JSON response
  const prettyBody = (() => {
    if (!response?.body) return ''
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2)
    } catch {
      return response.body
    }
  })()

  return (
    <div className="flex h-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <select
          value={state.method}
          onChange={(e) => updateState({ method: e.target.value })}
          className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 font-pixel text-xs text-[var(--color-accent)] outline-none"
        >
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={state.url}
          onChange={(e) => updateState({ url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="rounded border border-[var(--color-accent)] px-4 py-1.5 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50"
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Request panel */}
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          {/* Headers */}
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-pixel text-xs text-[var(--color-text-muted)]">Headers</span>
              <button onClick={addHeader} className="text-xs text-[var(--color-accent)] hover:underline">+ Add</button>
            </div>
            <div className="max-h-32 overflow-auto">
              {state.headers.map((h, i) => (
                <div key={i} className="mb-1 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                    className="accent-[var(--color-accent)]"
                  />
                  <input
                    value={h.key}
                    onChange={(e) => updateHeader(i, { key: e.target.value })}
                    placeholder="Key"
                    className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none"
                  />
                  <input
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    placeholder="Value"
                    className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none"
                  />
                  <button onClick={() => removeHeader(i)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]">×</button>
                </div>
              ))}
            </div>
          </div>
          {/* Body */}
          <div className="flex-1">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Body
            </div>
            <Editor
              language="json"
              value={state.body}
              onChange={(v) => updateState({ body: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>

        {/* Response panel */}
        <div className="flex w-1/2 flex-col">
          {error && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
              {error}
            </div>
          )}
          {response && (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-1">
                <span className={`font-mono text-sm font-bold ${response.status < 400 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{response.time}ms</span>
                <div className="ml-auto">
                  <CopyButton text={prettyBody} />
                </div>
              </div>
              <TabBar tabs={RESPONSE_TABS} activeTab={responseTab} onTabChange={setResponseTab} />
              <div className="flex-1 overflow-auto">
                {responseTab === 'body' ? (
                  <Editor
                    language="json"
                    value={prettyBody}
                    options={{ ...EDITOR_OPTIONS, readOnly: true }}
                  />
                ) : (
                  <div className="p-3">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="mb-1 text-xs">
                        <span className="text-[var(--color-accent)]">{key}</span>
                        <span className="text-[var(--color-text-muted)]">: </span>
                        <span className="text-[var(--color-text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {!response && !error && (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
              Send a request to see the response
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Verification:** Enter URL → Send → response shows with status code, timing, headers, prettified body. Cmd/Ctrl+Enter sends. Headers editor works. No CORS errors (uses Tauri HTTP).

---

## Task 6: Docs Browser Tool

**Files:**
- Create: `apps/cockpit/src/tools/docs-browser/DocsBrowser.tsx`

**Context:** PRD 6.9. Embedded iframe loading devdocs.io. Simple — just an iframe.

```typescript
import { useUiStore } from '@/stores/ui.store'

export default function DocsBrowser() {
  const setLastAction = useUiStore((s) => s.setLastAction)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">DevDocs.io</span>
        <a
          href="https://devdocs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-accent)] hover:underline"
          onClick={() => setLastAction('Opened in browser', 'info')}
        >
          Open externally
        </a>
      </div>
      <iframe
        src="https://devdocs.io"
        className="flex-1 border-none"
        title="DevDocs"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  )
}
```

**Note:** If Tauri's CSP blocks the iframe, add `"frame-src": "https://devdocs.io"` to `tauri.conf.json` security section, or set CSP to `null` (already the case in current config).

**Verification:** Navigate to Docs Browser → devdocs.io loads in embedded frame. Can search and browse docs.

---

## Task 7: Update Tool Registry + Store Initialization

**Files:**
- Modify: `apps/cockpit/src/app/tool-registry.ts` (wire up final 3 tools)
- Modify: `apps/cockpit/src/app/providers.tsx` (init notes/snippets/history stores)

### tool-registry.ts additions

```typescript
// Add lazy imports:
const ApiClient = lazy(() => import('@/tools/api-client/ApiClient'))
const DocsBrowser = lazy(() => import('@/tools/docs-browser/DocsBrowser'))
const SnippetsManager = lazy(() => import('@/tools/snippets/SnippetsManager'))

// Update entries:
{ id: 'api-client', ..., component: ApiClient },
{ id: 'docs-browser', ..., component: DocsBrowser },
{ id: 'snippets', ..., component: SnippetsManager },
```

### providers.tsx

Read the current file first. Add store imports and init calls alongside the existing settings store init. The notes, snippets, and history stores can initialize in parallel (fire-and-forget after settings).

**Verification:** No Placeholder references remain in tool-registry.ts. All 28 tools load. Stores initialize on app start.

---

## Task 8: Build Verification + Final Smoke Test

**Files:** None (testing only)

**Steps:**
- [ ] Run `cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit && npx tsc --noEmit` — zero errors
- [ ] Run `bunx vite build` — succeeds
- [ ] Verify zero `Placeholder` references in tool-registry.ts
- [ ] Verify all 28 tools render from sidebar without crashing
- [ ] Notes: create a note, edit title/content, change color, pin it, delete it
- [ ] Snippets: create snippet, edit in Monaco, add tags, search, export, import
- [ ] API Client: GET https://httpbin.org/get → 200 response with JSON body
- [ ] Docs Browser: iframe loads devdocs.io
- [ ] History tab in drawer: shows recent entries (if any tool operations logged)
- [ ] Command palette (Cmd/Ctrl+K): all 28 tools appear in search
- [ ] Theme toggle: all tools respect dark/light

**Verification:** All checks pass. All 4 plans complete. devdrivr cockpit is fully functional.

---

## Execution Notes

### Task Dependencies
```
Task 1 (DB functions) → Tasks 2, 3, 4 (stores and UI use CRUD functions)
Task 2 (stores) → Tasks 3, 4 (drawer and snippets use stores)
Task 3 (drawer) needs Task 2
Task 4 (snippets) needs Task 2
Task 5 (API client) — independent
Task 6 (docs browser) — independent
Task 7 (registry + providers) needs Tasks 3-6
Task 8 (smoke test) needs all
```

### Parallelization Opportunities
```
Sequential: Task 1 → Task 2
Then parallel:
  - Batch A: Tasks 3+4 (drawer + snippets — both use stores from Task 2)
  - Batch B: Tasks 5+6 (API client + docs browser — independent)
Then: Task 7 → Task 8
```

### Model Selection for Subagents
- **Tasks 1+2:** sonnet — DB functions and stores with exact code, but need to read existing db.ts and adapt
- **Tasks 3+4 (Batch A):** sonnet — full drawer rewrite and snippets tool, moderate complexity
- **Tasks 5+6 (Batch B):** sonnet — API client has HTTP/Monaco integration; docs browser is trivial but bundled for efficiency
- **Task 7:** sonnet — registry update + providers modification (needs to read existing code)
- **Task 8:** haiku — run commands and verify output
