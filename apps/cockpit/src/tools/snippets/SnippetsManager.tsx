import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Editor from '@monaco-editor/react'
import Fuse from 'fuse.js'
import {
  CaretDownIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  StarIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
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

// Per-language badge colours (bg + text as CSS colour values)
type LangStyle = { bg: string; color: string }
const LANG_STYLES: Record<string, LangStyle> = {
  javascript: { bg: 'rgba(234,179,8,0.15)', color: '#ca8a04' },
  typescript: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  python: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  rust: { bg: 'rgba(251,146,60,0.15)', color: '#fb923c' },
  go: { bg: 'rgba(34,211,238,0.15)', color: '#22d3ee' },
  sql: { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  bash: { bg: 'rgba(74,222,128,0.18)', color: '#86efac' },
  json: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  css: { bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  html: { bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
  markdown: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  yaml: { bg: 'rgba(250,204,21,0.15)', color: '#facc15' },
  dockerfile: { bg: 'rgba(56,189,248,0.15)', color: '#38bdf8' },
  ruby: { bg: 'rgba(239,68,68,0.18)', color: '#fca5a5' },
  php: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
  java: { bg: 'rgba(249,115,22,0.18)', color: '#fdba74' },
  kotlin: { bg: 'rgba(139,92,246,0.18)', color: '#c4b5fd' },
  swift: { bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  graphql: { bg: 'rgba(236,72,153,0.15)', color: '#ec4899' },
  cpp: { bg: 'rgba(96,165,250,0.18)', color: '#93c5fd' },
  csharp: { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  c: { bg: 'rgba(96,165,250,0.12)', color: '#7dd3fc' },
  xml: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  toml: { bg: 'rgba(251,191,36,0.12)', color: '#d97706' },
}
const DEFAULT_LANG_STYLE: LangStyle = {
  bg: 'var(--color-accent-dim)',
  color: 'var(--color-accent)',
}

type SortMode = 'updated' | 'created' | 'title' | 'language'

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'updated', label: 'Recent' },
  { id: 'created', label: 'Created' },
  { id: 'title', label: 'A → Z' },
  { id: 'language', label: 'Lang' },
]

// ─── Types ───────────────────────────────────────────────────────────

// Subset of FuseResultMatch we actually need
interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}

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

/** Wraps matched character ranges in a <mark> element. */
function highlightMatches(
  text: string,
  matches: ReadonlyArray<FuseMatchEntry> | undefined,
  key: string
): ReactNode {
  if (!matches) return text
  const match = matches.find((m) => m.key === key)
  if (!match || match.indices.length === 0) return text
  const sorted = [...match.indices].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
  const parts: ReactNode[] = []
  let last = 0
  for (const pair of sorted) {
    const start = pair[0] ?? 0
    const end = pair[1] ?? 0
    if (start > last) parts.push(text.slice(last, start))
    parts.push(
      <mark
        key={`${start}-${end}`}
        className="rounded bg-[var(--color-accent)]/25 text-[var(--color-accent)] not-italic"
      >
        {text.slice(start, end + 1)}
      </mark>
    )
    last = end + 1
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ─── Tag Filter Bar ──────────────────────────────────────────────────

const TAG_BAR_COLLAPSED_HEIGHT = 28 // ~1 row of chips

function TagFilterBar({
  tags,
  filterTag,
  onFilterTag,
}: {
  tags: string[]
  filterTag: string | null
  onFilterTag: (tag: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setOverflows(el.scrollHeight > TAG_BAR_COLLAPSED_HEIGHT + 4)
  }, [tags])

  return (
    <div className="px-3 py-1.5">
      <div
        ref={containerRef}
        className="flex flex-wrap gap-1 overflow-hidden transition-[max-height] duration-150"
        style={{ maxHeight: expanded || !overflows ? 'none' : TAG_BAR_COLLAPSED_HEIGHT }}
      >
        {filterTag && (
          <button
            onClick={() => onFilterTag(null)}
            className="rounded bg-[var(--color-error)]/20 px-1.5 py-0.5 text-xs text-[var(--color-error)]"
          >
            ✕ Clear
          </button>
        )}
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onFilterTag(filterTag === tag ? null : tag)}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
              filterTag === tag
                ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      {overflows && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          {expanded ? '▲ Show less' : `▼ ${tags.length} tags…`}
        </button>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────

export default function SnippetsManager() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const snippets = useSnippetsStore((s) => s.snippets)
  const saving = useSnippetsStore((s) => s.saving)
  const activeFolder = useSnippetsStore((s) => s.activeFolder)
  const setActiveFolder = useSnippetsStore((s) => s.setActiveFolder)
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
  const [foldersCollapsed, setFoldersCollapsed] = useState(false)
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Clear confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    }
  }, [])

  // ─── Handlers (defined early for shortcuts) ───────────────────────

  const handleNew = useCallback(async () => {
    const snippet = await addSnippet('Untitled', '', 'javascript', [], activeFolder)
    setSelectedId(snippet.id)
    setLastAction('Snippet created', 'success')
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }, [addSnippet, setLastAction, activeFolder])

  // ─── Fuse search ─────────────────────────────────────────────────

  const fuse = useMemo(
    () =>
      new Fuse(snippets, {
        keys: ['title', 'content', 'tags'],
        threshold: 0.3,
        includeMatches: true,
      }),
    [snippets]
  )

  // ─── Fuse results + match map ────────────────────────────────────

  const fuseResults = useMemo(() => (search.trim() ? fuse.search(search) : null), [fuse, search])

  const matchMap = useMemo(() => {
    if (!fuseResults) return new Map<string, ReadonlyArray<FuseMatchEntry>>()
    return new Map(fuseResults.map((r) => [r.item.id, (r.matches ?? []) as FuseMatchEntry[]]))
  }, [fuseResults])

  // ─── All unique folders ──────────────────────────────────────────

  const allFolders = useMemo(() => {
    const folderSet = new Set<string>()
    for (const s of snippets) {
      if (s.folder) folderSet.add(s.folder)
    }
    return [...folderSet].sort()
  }, [snippets])

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
    let list = fuseResults ? fuseResults.map((r) => r.item) : [...snippets]

    // Filter by folder
    if (activeFolder) {
      list = list.filter((s) => s.folder === activeFolder)
    }

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
  }, [snippets, fuseResults, sortMode, filterTag, activeFolder])

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

  // ─── Tag autocomplete suggestions ───────────────────────────────

  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim() || !selected) return []
    const query = tagInput.trim().toLowerCase()
    return allTags.filter((t) => t.toLowerCase().includes(query) && !selected.tags.includes(t))
  }, [tagInput, allTags, selected])

  // ─── Handlers ────────────────────────────────────────────────────

  const handleDuplicate = useCallback(async () => {
    if (!selected) return
    const snippet = await addSnippet(
      selected.title + ' (copy)',
      selected.content,
      selected.language,
      visibleTags(selected.tags),
      selected.folder
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

  const handleAddTagFromSuggestion = useCallback(
    async (tag: string) => {
      if (!selected) return
      if (selected.tags.includes(tag)) return
      await updateSnippet(selected.id, { tags: [...selected.tags, tag] })
      setTagInput('')
      tagInputRef.current?.focus()
    },
    [selected, updateSnippet]
  )

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
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
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
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                sortMode === opt.id
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Folder filter — collapsible */}
        {allFolders.length > 0 && (
          <div className="border-b border-[var(--color-border)]">
            <button
              onClick={() => setFoldersCollapsed(!foldersCollapsed)}
              className="flex w-full items-center gap-1.5 px-3 py-1 font-mono text-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              aria-expanded={!foldersCollapsed}
            >
              {foldersCollapsed ? (
                <CaretRightIcon size={9} weight="bold" />
              ) : (
                <CaretDownIcon size={9} weight="bold" />
              )}
              FOLDERS
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-150 ${foldersCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-wrap gap-1 px-3 pb-1.5">
                  <button
                    onClick={() => setActiveFolder('')}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                      activeFolder === ''
                        ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    All
                  </button>
                  {allFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => setActiveFolder(activeFolder === folder ? '' : folder)}
                      className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                        activeFolder === folder
                          ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                          : 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30'
                      }`}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tag filter — collapsible */}
        {allTags.length > 0 && (
          <div className="border-b border-[var(--color-border)]">
            <button
              onClick={() => setTagsCollapsed(!tagsCollapsed)}
              className="flex w-full items-center gap-1.5 px-3 py-1 font-mono text-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              aria-expanded={!tagsCollapsed}
            >
              {tagsCollapsed ? (
                <CaretRightIcon size={9} weight="bold" />
              ) : (
                <CaretDownIcon size={9} weight="bold" />
              )}
              TAGS
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-150 ${tagsCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
            >
              <div className="overflow-hidden">
                <TagFilterBar tags={allTags} filterTag={filterTag} onFilterTag={setFilterTag} />
              </div>
            </div>
          </div>
        )}

        {/* Snippet list */}
        <div className="flex-1 overflow-auto">
          {filtered.map((snippet) => {
            const isSelected = selectedId === snippet.id
            const matches = isSelected ? undefined : matchMap.get(snippet.id)
            const langStyle = LANG_STYLES[snippet.language] ?? DEFAULT_LANG_STYLE
            return (
              <button
                key={snippet.id}
                onClick={() => setSelectedId(snippet.id)}
                className={`flex w-full flex-col border-b border-[var(--color-border)] px-3 py-2 text-left transition-colors ${
                  isSelected
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
                    className={`flex-1 truncate text-xs font-bold ${isSelected ? 'text-[var(--color-bg)]' : 'text-[var(--color-text)]'}`}
                  >
                    {highlightMatches(snippet.title || 'Untitled', matches, 'title')}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] ${isSelected ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-text-muted)]'}`}
                  >
                    {relativeTime(snippet.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Language pill */}
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={
                      isSelected
                        ? { backgroundColor: 'rgba(255,255,255,0.2)', color: 'var(--color-bg)' }
                        : { backgroundColor: langStyle.bg, color: langStyle.color }
                    }
                  >
                    {LANG_EXTENSIONS[snippet.language] ?? snippet.language}
                  </span>
                  {snippet.content && (
                    <span
                      className={`truncate text-[10px] ${isSelected ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-text-muted)]'}`}
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
                          isSelected
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
            )
          })}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              {search || filterTag || activeFolder ? 'No matching snippets' : 'No snippets yet'}
            </div>
          )}
        </div>

        {/* Snippet count */}
        <div className="border-t border-[var(--color-border)] px-3 py-1 text-[10px] text-[var(--color-text-muted)]">
          {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
          {filterTag || activeFolder ? ` · ${filtered.length} shown` : ''}
        </div>
      </div>

      {/* ─── Pane 2: Editor ───────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-[var(--color-border)]">
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
          [ 02-EDIT:{' '}
          {selected
            ? `${selected.title || 'untitled'}.${LANG_EXTENSIONS[selected.language] || 'txt'}`
            : '---'}{' '}
          ]
        </div>
        {selected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Title + controls */}
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleToggleFavorite}
                className={`rounded p-1 transition-colors ${isFavorite(selected.tags) ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-warning)]'}`}
                title={isFavorite(selected.tags) ? 'Remove favorite' : 'Add to favorites'}
              >
                <StarIcon size={14} weight={isFavorite(selected.tags) ? 'fill' : 'regular'} />
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
                className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                title="Download as file"
              >
                <DownloadSimpleIcon size={14} />
              </button>
            </div>

            {/* Monaco editor */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <Editor
                theme={monacoTheme}
                language={selected.language}
                value={selected.content}
                onChange={(v) => updateSnippet(selected.id, { content: v ?? '' })}
                options={{
                  ...monacoOptions,
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
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
          [ 03-META ]
        </div>
        {selected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Folder */}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                  Folder
                </div>
                <input
                  value={selected.folder}
                  onChange={(e) => updateSnippet(selected.id, { folder: e.target.value })}
                  placeholder="e.g. work, personal"
                  list="snippet-folders"
                  className="w-full bg-transparent px-1 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none border-b border-transparent focus:border-[var(--color-accent)]"
                />
                <datalist id="snippet-folders">
                  {allFolders.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              {/* Language */}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
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
                <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
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
                        className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-error)]"
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Tag input with autocomplete */}
                <div className="relative mt-2">
                  <input
                    ref={tagInputRef}
                    id="tag-input"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={tagSuggestions.length > 0}
                    aria-controls="tag-suggestions"
                    aria-activedescendant={
                      suggestionIndex >= 0 ? `tag-suggestion-${suggestionIndex}` : undefined
                    }
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value)
                      setSuggestionIndex(-1)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setSuggestionIndex((i) => Math.min(i + 1, tagSuggestions.length - 1))
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setSuggestionIndex((i) => Math.max(i - 1, -1))
                        return
                      }
                      if (e.key === 'Enter') {
                        if (suggestionIndex >= 0) {
                          e.preventDefault()
                          const chosen = tagSuggestions[suggestionIndex]
                          if (chosen) void handleAddTagFromSuggestion(chosen)
                          setSuggestionIndex(-1)
                          return
                        }
                        handleAddTag()
                        return
                      }
                      if (e.key === 'Escape') {
                        setSuggestionIndex(-1)
                        setTagInput('')
                      }
                    }}
                    placeholder="+ Add tag..."
                    className="w-full bg-transparent px-1 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none border-b border-transparent focus:border-[var(--color-accent)]"
                  />
                  {tagSuggestions.length > 0 && (
                    <div
                      id="tag-suggestions"
                      role="listbox"
                      aria-label="Tag suggestions"
                      className="absolute left-0 right-0 top-full z-10 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
                      data-testid="tag-suggestions"
                    >
                      {tagSuggestions.map((suggestion, i) => (
                        <button
                          key={suggestion}
                          id={`tag-suggestion-${i}`}
                          role="option"
                          aria-selected={i === suggestionIndex}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            void handleAddTagFromSuggestion(suggestion)
                          }}
                          className={`flex w-full items-center px-2 py-1 text-left text-xs text-[var(--color-text)] transition-colors ${
                            i === suggestionIndex
                              ? 'bg-[var(--color-surface-hover)]'
                              : 'hover:bg-[var(--color-surface-hover)]'
                          }`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Block */}
            {editorStats && (
              <div className="mt-auto border-t border-[var(--color-border)] p-3 font-mono text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg)]/30">
                L:{editorStats.lines} C:{editorStats.chars} B:{editorStats.bytes}
              </div>
            )}
          </div>
        ) : (
          /* Empty meta pane: keyboard shortcuts hint card */
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
              No snippet selected
            </div>
            <div className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-3">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[var(--color-text-muted)]">
                Shortcuts
              </div>
              {(
                [
                  ['F5 / ⌘N', 'New snippet'],
                  ['F6', 'Duplicate'],
                  ['F8', 'Delete'],
                  ['⌘F', 'Search'],
                  ['F9', 'Export'],
                  ['F10', 'Import'],
                ] as [string, string][]
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-0.5">
                  <span className="font-mono text-[9px] text-[var(--color-accent)]">{key}</span>
                  <span className="text-[9px] text-[var(--color-text-muted)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Bar: Command Bar ──────────────────────────── */}
      <div className="col-span-3 flex h-10 items-center border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-mono text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={handleNew}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [F5: NEW]
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!selected}
            className={`rounded px-2 py-0.5 transition-colors ${selected ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]' : 'cursor-not-allowed opacity-30'}`}
          >
            [F6: DUP]
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={!selected}
            className={`rounded px-2 py-0.5 transition-colors ${
              selectedId && confirmDeleteId === selectedId
                ? 'bg-[var(--color-error)]/10 font-bold text-[var(--color-error)]'
                : selected
                  ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)]'
                  : 'cursor-not-allowed opacity-30'
            }`}
          >
            {selectedId && confirmDeleteId === selectedId ? '[CONFIRM?]' : '[F8: DEL]'}
          </button>
          <button
            onClick={handleExport}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [F9: EXP]
          </button>
          <button
            onClick={handleImport}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [F10: IMP]
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {saving && <span className="text-[var(--color-accent)] animate-pulse">[SAVING...]</span>}
          {selected && isFavorite(selected.tags) && (
            <span className="text-[var(--color-accent)]">[FAV]</span>
          )}
          <div className="text-[var(--color-text-muted)] uppercase">{snippets.length} SNIPPETS</div>
        </div>
      </div>
    </div>
  )
}
