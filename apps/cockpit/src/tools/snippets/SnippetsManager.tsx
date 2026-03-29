import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import Fuse from 'fuse.js'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { Input, Select } from '@/components/shared/Input'
import { useUiStore } from '@/stores/ui.store'

// ─── Constants ───────────────────────────────────────────────────────

const FAVORITE_TAG = '⭐'

const LANGUAGES = [
  'javascript',
  'typescript',
  'json',
  'css',
  'html',
  'markdown',
  'sql',
  'python',
  'yaml',
  'xml',
  'bash',
  'go',
  'rust',
  'ruby',
  'php',
  'java',
  'c',
  'cpp',
  'csharp',
  'swift',
  'kotlin',
  'dockerfile',
  'graphql',
  'toml',
  'text',
]

const LANG_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  css: 'css',
  html: 'html',
  markdown: 'md',
  sql: 'sql',
  python: 'py',
  bash: 'sh',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  swift: 'swift',
  kotlin: 'kt',
  yaml: 'yml',
  toml: 'toml',
  dockerfile: 'dockerfile',
  graphql: 'gql',
  text: 'txt',
}

type SortMode = 'updated' | 'created' | 'title' | 'language'

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'updated', label: 'Recent' },
  { id: 'created', label: 'Created' },
  { id: 'title', label: 'A → Z' },
  { id: 'language', label: 'Lang' },
]

// ─── Helpers ─────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function contentPreview(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim()) ?? ''
  return firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine
}

function visibleTags(tags: string[]): string[] {
  return tags.filter((t) => t !== FAVORITE_TAG)
}

function isFavorite(tags: string[]): boolean {
  return tags.includes(FAVORITE_TAG)
}

// ─── Component ───────────────────────────────────────────────────────

export default function SnippetsManager() {
  const monacoTheme = useMonacoTheme()
  const snippets = useSnippetsStore((s) => s.snippets)
  const saving = useSnippetsStore((s) => s.saving)
  const addSnippet = useSnippetsStore((s) => s.add)
  const updateSnippet = useSnippetsStore((s) => s.update)
  const removeSnippet = useSnippetsStore((s) => s.remove)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Clear confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    }
  }, [])

  // ─── Handlers (defined early for shortcuts) ───────────────────────

  const handleNew = useCallback(async () => {
    const snippet = await addSnippet('Untitled', '', 'javascript')
    setSelectedId(snippet.id)
    setLastAction('Snippet created', 'success')
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }, [addSnippet, setLastAction])

  // ─── Fuse search ─────────────────────────────────────────────────

  const fuse = useMemo(
    () => new Fuse(snippets, { keys: ['title', 'content', 'tags'], threshold: 0.3 }),
    [snippets]
  )

  // ─── All unique tags (excluding favorite marker) ─────────────────

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const s of snippets) {
      for (const t of s.tags) {
        if (t !== FAVORITE_TAG) tagSet.add(t)
      }
    }
    return [...tagSet].sort()
  }, [snippets])

  // ─── Filtered + sorted list ──────────────────────────────────────

  const filtered = useMemo(() => {
    let list = search.trim() ? fuse.search(search).map((r) => r.item) : [...snippets]

    // Filter by tag
    if (filterTag) {
      list = list.filter((s) => s.tags.includes(filterTag))
    }

    // Sort
    list.sort((a, b) => {
      // Favorites always first
      const aFav = isFavorite(a.tags) ? 0 : 1
      const bFav = isFavorite(b.tags) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav

      switch (sortMode) {
        case 'updated':
          return b.updatedAt - a.updatedAt
        case 'created':
          return b.createdAt - a.createdAt
        case 'title':
          return a.title.localeCompare(b.title)
        case 'language':
          return a.language.localeCompare(b.language) || b.updatedAt - a.updatedAt
      }
    })

    return list
  }, [snippets, search, fuse, sortMode, filterTag])

  const selected = useMemo(
    () => snippets.find((s) => s.id === selectedId) ?? null,
    [snippets, selectedId]
  )

  // ─── Stats for selected snippet ──────────────────────────────────

  const editorStats = useMemo(() => {
    if (!selected) return null
    const lines = selected.content.split('\n').length
    const chars = selected.content.length
    const bytes = new TextEncoder().encode(selected.content).length
    return { lines, chars, bytes }
  }, [selected])

  // ─── Handlers ────────────────────────────────────────────────────

  const handleDuplicate = useCallback(async () => {
    if (!selected) return
    const snippet = await addSnippet(
      selected.title + ' (copy)',
      selected.content,
      selected.language,
      visibleTags(selected.tags)
    )
    setSelectedId(snippet.id)
    setLastAction('Snippet duplicated', 'success')
  }, [selected, addSnippet, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    await removeSnippet(selectedId)
    setSelectedId(null)
    setLastAction('Snippet deleted', 'info')
  }, [selectedId, removeSnippet, setLastAction])

  const handleDeleteClick = useCallback(() => {
    if (!selectedId) return
    if (confirmDeleteId === selectedId) {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      setConfirmDeleteId(null)
      handleDelete().catch(() => {})
    } else {
      setConfirmDeleteId(selectedId)
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = setTimeout(() => setConfirmDeleteId(null), 2500)
    }
  }, [selectedId, confirmDeleteId, handleDelete])

  const handleToggleFavorite = useCallback(async () => {
    if (!selected) return
    if (isFavorite(selected.tags)) {
      await updateSnippet(selected.id, { tags: selected.tags.filter((t) => t !== FAVORITE_TAG) })
    } else {
      await updateSnippet(selected.id, { tags: [...selected.tags, FAVORITE_TAG] })
    }
  }, [selected, updateSnippet])

  const handleAddTag = useCallback(async () => {
    if (!selected || !tagInput.trim()) return
    const tag = tagInput.trim()
    if (tag === FAVORITE_TAG) {
      setTagInput('')
      return
    }
    if (selected.tags.includes(tag)) {
      setTagInput('')
      return
    }
    await updateSnippet(selected.id, { tags: [...selected.tags, tag] })
    setTagInput('')
  }, [selected, tagInput, updateSnippet])

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!selected) return
      await updateSnippet(selected.id, { tags: selected.tags.filter((t) => t !== tag) })
    },
    [selected, updateSnippet]
  )

  const handleExport = useCallback(async () => {
    try {
      const data = JSON.stringify(snippets, null, 2)
      await navigator.clipboard.writeText(data)
      setLastAction(`Exported ${snippets.length} snippets to clipboard`, 'success')
    } catch {
      setLastAction('Export failed — clipboard unavailable', 'error')
    }
  }, [snippets, setLastAction])

  const handleImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        setLastAction('Import failed — paste valid JSON array', 'error')
        return
      }
      const imported = parsed as Array<Record<string, unknown>>
      let count = 0
      for (const item of imported) {
        if (typeof item['title'] === 'string' && typeof item['content'] === 'string') {
          await addSnippet(
            item['title'],
            item['content'],
            typeof item['language'] === 'string' ? item['language'] : 'text',
            Array.isArray(item['tags']) ? (item['tags'] as string[]) : []
          )
          count++
        }
      }
      setLastAction(`Imported ${count} snippets`, 'success')
    } catch {
      setLastAction('Import failed — paste valid JSON array', 'error')
    }
  }, [addSnippet, setLastAction])

  const handleDownload = useCallback(() => {
    if (!selected) return
    const ext = LANG_EXTENSIONS[selected.language] ?? selected.language
    const filename = (selected.title || 'snippet').replace(/[^a-zA-Z0-9_-]/g, '_') + '.' + ext
    const blob = new Blob([selected.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setLastAction(`Downloaded ${filename}`, 'success')
  }, [selected, setLastAction])

  // ─── Shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘N: New
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleNew()
      }
      // ⌘F: Search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // F-Keys
      if (e.key === 'F5') {
        e.preventDefault()
        handleNew()
      }
      if (e.key === 'F6') {
        e.preventDefault()
        handleDuplicate()
      }
      if (e.key === 'F8') {
        e.preventDefault()
        handleDeleteClick()
      }
      if (e.key === 'F9') {
        e.preventDefault()
        handleExport()
      }
      if (e.key === 'F10') {
        e.preventDefault()
        handleImport()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNew, handleDuplicate, handleDeleteClick, handleExport, handleImport])

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="grid h-full grid-cols-[16rem_1fr_13rem] grid-rows-[1fr_2.5rem] bg-[var(--color-bg)]">
      {/* ─── Pane 1: Selection ────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-pixel text-[10px] text-[var(--color-text-muted)]">
          [ 01-SELECT ]
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search... (⌘F)"
            className="flex-1"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-3 py-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSortMode(opt.id)}
              className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                sortMode === opt.id
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] px-3 py-1.5">
            {filterTag && (
              <button
                onClick={() => setFilterTag(null)}
                className="rounded bg-[var(--color-error)]/20 px-1.5 py-0.5 text-[10px] text-[var(--color-error)]"
              >
                ✕ Clear
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                  filterTag === tag
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Snippet list */}
        <div className="flex-1 overflow-auto">
          {filtered.map((snippet) => (
            <button
              key={snippet.id}
              onClick={() => setSelectedId(snippet.id)}
              className={`flex w-full flex-col border-b border-[var(--color-border)] px-3 py-2 text-left transition-colors ${
                selectedId === snippet.id
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                  : 'hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <div className="flex items-center gap-1">
                {isFavorite(snippet.tags) && (
                  <span className="text-[10px]" title="Favorite">
                    [*]
                  </span>
                )}
                <span
                  className={`flex-1 truncate text-xs font-bold ${selectedId === snippet.id ? 'text-[var(--color-bg)]' : 'text-[var(--color-text)]'}`}
                >
                  {snippet.title || 'Untitled'}
                </span>
                <span
                  className={`shrink-0 text-[10px] ${selectedId === snippet.id ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-text-muted)]'}`}
                >
                  {relativeTime(snippet.updatedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold ${selectedId === snippet.id ? 'text-[var(--color-bg)]' : 'text-[var(--color-accent)]'}`}
                >
                  [{ (LANG_EXTENSIONS[snippet.language] || snippet.language).toUpperCase() }]
                </span>
                {snippet.content && (
                  <span
                    className={`truncate text-[10px] ${selectedId === snippet.id ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-text-muted)]'}`}
                  >
                    {contentPreview(snippet.content)}
                  </span>
                )}
              </div>
              {visibleTags(snippet.tags).length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {visibleTags(snippet.tags).map((tag) => (
                    <span
                      key={tag}
                      className={`rounded px-1 text-[10px] ${
                        selectedId === snippet.id
                          ? 'bg-[var(--color-bg)]/20 text-[var(--color-bg)]'
                          : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              {search || filterTag ? 'No matching snippets' : 'No snippets yet'}
            </div>
          )}
        </div>

        {/* Snippet count */}
        <div className="border-t border-[var(--color-border)] px-3 py-1 text-[10px] text-[var(--color-text-muted)]">
          {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
          {filterTag ? ` · ${filtered.length} shown` : ''}
        </div>
      </div>

      {/* ─── Pane 2: Editor ───────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-[var(--color-border)]">
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-pixel text-[10px] text-[var(--color-text-muted)]">
          [ 02-EDIT: {selected ? `${selected.title || 'untitled'}.${LANG_EXTENSIONS[selected.language] || 'txt'}` : '---'} ]
        </div>
        {selected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Title + controls */}
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleToggleFavorite}
                className={`text-sm transition-opacity ${isFavorite(selected.tags) ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                title={isFavorite(selected.tags) ? 'Remove favorite' : 'Add to favorites'}
              >
                ⭐
              </button>
              <input
                ref={titleInputRef}
                value={selected.title}
                onChange={(e) => updateSnippet(selected.id, { title: e.target.value })}
                placeholder="Snippet title"
                className="flex-1 bg-transparent text-sm font-bold text-[var(--color-text)] outline-none"
              />
              <CopyButton text={selected.content} />
              <button
                onClick={handleDownload}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                title="Download as file"
              >
                ↓
              </button>
            </div>

            {/* Monaco editor */}
            <div className="flex-1">
              <Editor
                theme={monacoTheme}
                language={selected.language}
                value={selected.content}
                onChange={(v) => updateSnippet(selected.id, { content: v ?? '' })}
                options={{
                  ...EDITOR_OPTIONS,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
            Select a snippet or create a new one
          </div>
        )}
      </div>

      {/* ─── Pane 3: Meta ─────────────────────────────────────── */}
      <div className="flex w-52 flex-col overflow-hidden bg-[var(--color-surface)]">
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-pixel text-[10px] text-[var(--color-text-muted)]">
          [ 03-META ]
        </div>
        {selected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Language */}
              <div>
                <div className="font-pixel text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                  Language
                </div>
                <Select
                  value={selected.language}
                  onChange={(e) => updateSnippet(selected.id, { language: e.target.value })}
                  className="w-full"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Tags */}
              <div>
                <div className="font-pixel text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                  Tags
                </div>
                <div className="space-y-1">
                  {visibleTags(selected.tags).map((tag) => (
                    <div
                      key={tag}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
                    >
                      <span className="truncate">{tag}</span>
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                      >
                        [X]
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag()
                  }}
                  placeholder="+ Add tag..."
                  className="mt-2 w-full bg-transparent px-1 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none border-b border-transparent focus:border-[var(--color-accent)]"
                />
              </div>
            </div>

            {/* Stats Block */}
            {editorStats && (
              <div className="mt-auto border-t border-[var(--color-border)] p-3 font-pixel text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg)]/30">
                L:{editorStats.lines} C:{editorStats.chars} B:{editorStats.bytes}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 p-4 text-center text-xs text-[var(--color-text-muted)] italic">
            No snippet selected
          </div>
        )}
      </div>

      {/* ─── Bottom Bar: Command Bar ──────────────────────────── */}
      <div className="col-span-3 flex h-10 items-center border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-pixel text-[10px]">
        <div className="flex items-center gap-4">
          <button onClick={handleNew} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
            [F5: NEW]
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!selected}
            className={`text-[var(--color-text-muted)] ${selected ? 'hover:text-[var(--color-accent)]' : 'opacity-30 cursor-not-allowed'}`}
          >
            [F6: DUP]
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={!selected}
            className={`transition-colors ${
              selectedId && confirmDeleteId === selectedId
                ? 'font-bold text-[var(--color-error)]'
                : `text-[var(--color-text-muted)] ${selected ? 'hover:text-[var(--color-error)]' : 'opacity-30 cursor-not-allowed'}`
            }`}
          >
            {selectedId && confirmDeleteId === selectedId ? '[CONFIRM?]' : '[F8: DEL]'}
          </button>
          <button onClick={handleExport} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
            [F9: EXP]
          </button>
          <button onClick={handleImport} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
            [F10: IMP]
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {saving && <span className="text-[var(--color-accent)] animate-pulse">[SAVING...]</span>}
          {selected && isFavorite(selected.tags) && <span className="text-[var(--color-accent)]">[FAV]</span>}
          <div className="text-[var(--color-text-muted)] uppercase">
            {snippets.length} SNIPPETS
          </div>
        </div>
      </div>
    </div>
  )
}
