import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import Editor from '@monaco-editor/react'
import Fuse from 'fuse.js'
import {
  ClipboardTextIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  PlusIcon,
  ScissorsIcon,
  SidebarIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input, Select } from '@/components/shared/Input'
import { InlineInput } from '@/components/shared/InlineInput'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { useMonaco } from '@/hooks/useMonaco'
import { useIsInstanceActive } from '@/app/tool-instance'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet } from '@/types/models'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { SearchInput } from '@/components/shared/SearchInput'
import { formatShortcut } from '@/lib/shortcut-label'

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
  xml: 'xml',
  toml: 'toml',
  dockerfile: 'dockerfile',
  graphql: 'gql',
  text: 'txt',
}

type LangTone = 'accent' | 'success' | 'warning' | 'info' | 'error' | 'muted'

const LANG_TONES: Record<string, LangTone> = {
  javascript: 'warning',
  typescript: 'info',
  python: 'success',
  rust: 'warning',
  go: 'info',
  sql: 'accent',
  bash: 'success',
  json: 'warning',
  css: 'warning',
  html: 'error',
  markdown: 'muted',
  yaml: 'warning',
  dockerfile: 'info',
  ruby: 'error',
  php: 'accent',
  java: 'warning',
  kotlin: 'accent',
  swift: 'warning',
  graphql: 'accent',
  cpp: 'info',
  csharp: 'accent',
  c: 'info',
  xml: 'muted',
  toml: 'warning',
}

const LANG_TONE_CLASSES: Record<LangTone, string> = {
  accent: 'bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-[var(--color-accent)]',
  success:
    'bg-[color-mix(in_oklab,var(--color-success)_18%,transparent)] text-[var(--color-success)]',
  warning:
    'bg-[color-mix(in_oklab,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]',
  info: 'bg-[color-mix(in_oklab,var(--color-info)_18%,transparent)] text-[var(--color-info)]',
  error: 'bg-[color-mix(in_oklab,var(--color-error)_18%,transparent)] text-[var(--color-error)]',
  muted: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]',
}

type SortMode = 'updated' | 'created' | 'title' | 'language'

interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function contentPreview(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim()) ?? ''
  return firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine
}

function visibleTags(tags: string[]): string[] {
  return tags.filter((tag) => tag !== FAVORITE_TAG)
}

function isFavorite(tags: string[]): boolean {
  return tags.includes(FAVORITE_TAG)
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function highlightMatches(
  text: string,
  matches: ReadonlyArray<FuseMatchEntry> | undefined,
  key: string
): ReactNode {
  const match = matches?.find((entry) => entry.key === key)
  if (!match || match.indices.length === 0) return text

  const parts: ReactNode[] = []
  const sorted = [...match.indices].sort((a, b) => a[0] - b[0])
  let lastIndex = 0

  for (const [start, end] of sorted) {
    if (start > lastIndex) parts.push(text.slice(lastIndex, start))
    parts.push(
      <mark
        key={`${start}-${end}`}
        className="rounded bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
      >
        {text.slice(start, end + 1)}
      </mark>
    )
    lastIndex = end + 1
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <>{parts}</>
}

function importedSnippet(item: unknown): {
  title: string
  content: string
  language: string
  tags: string[]
  folder: string
} | null {
  if (!item || typeof item !== 'object') return null
  const candidate = item as Record<string, unknown>
  if (typeof candidate['title'] !== 'string' || typeof candidate['content'] !== 'string') {
    return null
  }

  return {
    title: candidate['title'],
    content: candidate['content'],
    language: typeof candidate['language'] === 'string' ? candidate['language'] : 'text',
    tags: Array.isArray(candidate['tags'])
      ? candidate['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [],
    folder: typeof candidate['folder'] === 'string' ? candidate['folder'] : '',
  }
}

export default function SnippetsManager() {
  const folderListId = useId()
  const tagSuggestionsId = useId()
  const snippetOptionsId = useId()
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const snippets = useSnippetsStore((state) => state.snippets)
  const saving = useSnippetsStore((state) => state.saving)
  const activeFolder = useSnippetsStore((state) => state.activeFolder)
  const setActiveFolder = useSnippetsStore((state) => state.setActiveFolder)
  const addSnippet = useSnippetsStore((state) => state.add)
  const updateSnippet = useSnippetsStore((state) => state.update)
  const removeSnippet = useSnippetsStore((state) => state.remove)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const copy = useCopyToClipboard()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [filterTag, setFilterTag] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [titleFocusRequest, setTitleFocusRequest] = useState(0)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const handledTitleFocusRequestRef = useRef(0)

  const setTitleInputRef = useCallback((element: HTMLInputElement | null) => {
    titleInputRef.current = element
  }, [])

  const fuse = useMemo(
    () =>
      new Fuse(snippets, {
        keys: ['title', 'content', 'language', 'folder', 'tags'],
        threshold: 0.32,
        includeMatches: true,
      }),
    [snippets]
  )

  const fuseResults = useMemo(
    () => (search.trim() ? fuse.search(search.trim()) : null),
    [fuse, search]
  )

  const matchMap = useMemo(() => {
    if (!fuseResults) return new Map<string, ReadonlyArray<FuseMatchEntry>>()
    return new Map(
      fuseResults.map((result) => [result.item.id, (result.matches ?? []) as FuseMatchEntry[]])
    )
  }, [fuseResults])

  const allFolders = useMemo(
    () => [...new Set(snippets.map((snippet) => snippet.folder).filter(Boolean))].sort(),
    [snippets]
  )

  const allTags = useMemo(
    () =>
      [
        ...new Set(
          snippets.flatMap((snippet) => visibleTags(snippet.tags)).filter((tag) => tag.trim())
        ),
      ].sort(),
    [snippets]
  )

  const filtered = useMemo(() => {
    const candidates = fuseResults ? fuseResults.map((result) => result.item) : [...snippets]
    const visible = candidates.filter((snippet) => {
      if (activeFolder && snippet.folder !== activeFolder) return false
      if (filterTag && !snippet.tags.includes(filterTag)) return false
      if (favoritesOnly && !isFavorite(snippet.tags)) return false
      return true
    })

    visible.sort((a, b) => {
      const favoriteOrder = Number(isFavorite(b.tags)) - Number(isFavorite(a.tags))
      if (favoriteOrder !== 0) return favoriteOrder
      if (sortMode === 'created') return b.createdAt - a.createdAt
      if (sortMode === 'title') return a.title.localeCompare(b.title)
      if (sortMode === 'language') {
        return a.language.localeCompare(b.language) || b.updatedAt - a.updatedAt
      }
      return b.updatedAt - a.updatedAt
    })

    return visible
  }, [activeFolder, favoritesOnly, filterTag, fuseResults, snippets, sortMode])

  const selected = useMemo(
    () => snippets.find((snippet) => snippet.id === selectedId) ?? null,
    [selectedId, snippets]
  )

  const editorStats = useMemo(() => {
    if (!selected) return null
    return {
      lines: selected.content.split('\n').length,
      characters: selected.content.length,
      bytes: new TextEncoder().encode(selected.content).length,
    }
  }, [selected])

  const tagSuggestions = useMemo(() => {
    if (!selected || !tagInput.trim()) return []
    const query = tagInput.trim().toLowerCase()
    return allTags.filter(
      (tag) => tag.toLowerCase().includes(query) && !selected.tags.includes(tag)
    )
  }, [allTags, selected, tagInput])

  const hasFilters = Boolean(search || activeFolder || filterTag || favoritesOnly)

  useEffect(() => {
    if (snippets.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !snippets.some((snippet) => snippet.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? snippets[0]?.id ?? null)
    }
  }, [filtered, selectedId, snippets])

  useEffect(() => {
    setTagInput('')
    setSuggestionIndex(-1)
    setDeleteDialogOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (
      !selected ||
      titleFocusRequest === 0 ||
      titleFocusRequest === handledTitleFocusRequestRef.current
    ) {
      return
    }
    handledTitleFocusRequestRef.current = titleFocusRequest
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
  }, [selected, titleFocusRequest])

  const handleNew = useCallback(async () => {
    try {
      const snippet = await addSnippet('Untitled snippet', '', 'javascript', [], activeFolder)
      setSelectedId(snippet.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet created', 'success')
    } catch {
      setLastAction('Failed to create snippet', 'error')
    }
  }, [activeFolder, addSnippet, setLastAction])

  const handleDuplicate = useCallback(async () => {
    if (!selected) return
    try {
      const duplicate = await addSnippet(
        `${selected.title || 'Untitled'} copy`,
        selected.content,
        selected.language,
        visibleTags(selected.tags),
        selected.folder
      )
      setSelectedId(duplicate.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet duplicated', 'success')
    } catch {
      setLastAction('Duplicate failed', 'error')
    }
  }, [addSnippet, selected, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!selected) return
    const currentIndex = filtered.findIndex((snippet) => snippet.id === selected.id)
    const nextSelection = filtered[currentIndex + 1] ?? filtered[currentIndex - 1] ?? null
    try {
      await removeSnippet(selected.id)
      setSelectedId(nextSelection?.id ?? null)
      setDeleteDialogOpen(false)
      setLastAction('Snippet deleted', 'info')
    } catch {
      setLastAction('Delete failed', 'error')
    }
  }, [filtered, removeSnippet, selected, setLastAction])

  const handleToggleFavorite = useCallback(async () => {
    if (!selected) return
    const tags = isFavorite(selected.tags)
      ? selected.tags.filter((tag) => tag !== FAVORITE_TAG)
      : [...selected.tags, FAVORITE_TAG]
    try {
      await updateSnippet(selected.id, { tags })
    } catch {
      setLastAction('Failed to update favorite', 'error')
    }
  }, [selected, setLastAction, updateSnippet])

  const handleAddTag = useCallback(
    async (requestedTag?: string) => {
      if (!selected) return
      const tag = (requestedTag ?? tagInput).trim()
      if (!tag || tag === FAVORITE_TAG || selected.tags.includes(tag)) {
        setTagInput('')
        return
      }
      try {
        await updateSnippet(selected.id, { tags: [...selected.tags, tag] })
        setTagInput('')
        setSuggestionIndex(-1)
        requestAnimationFrame(() => tagInputRef.current?.focus())
      } catch {
        setLastAction('Failed to add tag', 'error')
      }
    },
    [selected, setLastAction, tagInput, updateSnippet]
  )

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!selected) return
      try {
        await updateSnippet(selected.id, {
          tags: selected.tags.filter((existingTag) => existingTag !== tag),
        })
      } catch {
        setLastAction('Failed to remove tag', 'error')
      }
    },
    [selected, setLastAction, updateSnippet]
  )

  const handleExportAll = useCallback(async () => {
    try {
      const path = await exportFile(JSON.stringify(snippets, null, 2), 'snippets-backup.json')
      if (path) {
        setLastAction(
          `Exported ${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`,
          'success'
        )
      }
    } catch {
      setLastAction('Export failed', 'error')
    }
  }, [setLastAction, snippets])

  const handleImport = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      const parsed: unknown = JSON.parse(file.content)
      if (!Array.isArray(parsed)) throw new Error('Expected an array')

      const validSnippets = parsed
        .map((item) => importedSnippet(item))
        .filter((item): item is NonNullable<typeof item> => item !== null)
      if (validSnippets.length === 0) throw new Error('No valid snippets')

      const existing = new Set(
        snippets.map((snippet) => `${snippet.title}\u0000${snippet.content}`)
      )
      const uniqueSnippets = validSnippets.filter((item) => {
        const key = `${item.title}\u0000${item.content}`
        if (existing.has(key)) return false
        existing.add(key)
        return true
      })
      if (uniqueSnippets.length === 0) {
        setLastAction('No new snippets to import', 'info')
        return
      }

      let firstImported: Snippet | null = null
      for (const item of uniqueSnippets) {
        const created = await addSnippet(
          item.title,
          item.content,
          item.language,
          item.tags,
          item.folder
        )
        firstImported ??= created
      }
      setSelectedId(firstImported?.id ?? null)
      const skipped = validSnippets.length - uniqueSnippets.length
      setLastAction(
        `Imported ${uniqueSnippets.length} snippet${uniqueSnippets.length === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`,
        'success'
      )
    } catch {
      setLastAction('Import failed — choose a valid snippets JSON file', 'error')
    }
  }, [addSnippet, setLastAction, snippets])

  const handleDownload = useCallback(async () => {
    if (!selected) return
    const extension = LANG_EXTENSIONS[selected.language] ?? 'txt'
    const filename = buildExportFilename(selected.title || 'snippet', extension)
    try {
      const path = await exportFile(selected.content, filename)
      if (path) setLastAction(`Downloaded ${filename}`, 'success')
    } catch {
      setLastAction('Download failed', 'error')
    }
  }, [selected, setLastAction])

  const handleCopy = useCallback(async () => {
    if (!selected) return
    await copy(selected.content)
  }, [selected, copy])

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveFolder('')
    setFilterTag('')
    setFavoritesOnly(false)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [setActiveFolder])

  const handleListKeyDown = (event: KeyboardEvent<HTMLButtonElement>, snippetId: string) => {
    const index = filtered.findIndex((snippet) => snippet.id === snippetId)
    if (index < 0) return
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = Math.min(filtered.length - 1, index + 1)
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = filtered.length - 1
    if (nextIndex === null || nextIndex === index) return

    event.preventDefault()
    const next = filtered[nextIndex]
    if (!next) return
    setSelectedId(next.id)
    requestAnimationFrame(() =>
      document.getElementById(`${snippetOptionsId}-option-${next.id}`)?.focus()
    )
  }

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (!isInstanceActive) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void handleNew()
      }
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void handleDuplicate()
      }
      if (event.key === 'F5') {
        event.preventDefault()
        void handleNew()
      }
      if (event.key === 'F6') {
        event.preventDefault()
        void handleDuplicate()
      }
      if (event.key === 'F8' && selected) {
        event.preventDefault()
        setDeleteDialogOpen(true)
      }
      if (event.key === 'F9') {
        event.preventDefault()
        void handleExportAll()
      }
      if (event.key === 'F10') {
        event.preventDefault()
        void handleImport()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleDuplicate, handleExportAll, handleImport, handleNew, isInstanceActive, selected])

  return (
    <>
      <MasterDetailLayout
        title="Snippets"
        subtitle={`${snippets.length} saved locally`}
        sidebarActions={
          // Secondary for the same reason as prompt-templates: the sidebar heading never carries
          // the accent. Snippets saves as you type, so when one is selected the tool has no
          // primary at all — correct for a live-editing tool. The empty state's CTA covers the
          // one moment there's nothing to edit.
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleNew()}
            className="gap-1.5"
          >
            <PlusIcon size={12} aria-hidden="true" />
            New
          </Button>
        }
        sidebar={
          <>
            <div className="space-y-2 border-b border-[var(--color-border)] p-3">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onValueChange={setSearch}
                placeholder="Search snippets"
                aria-label="Search snippets"
              />

              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={activeFolder}
                  onChange={(event) => setActiveFolder(event.target.value)}
                  aria-label="Filter by folder"
                  title="Filter by folder"
                >
                  <option value="">All folders</option>
                  {allFolders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </Select>
                <Select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  aria-label="Sort snippets"
                  title="Sort snippets"
                >
                  <option value="updated">Recently edited</option>
                  <option value="created">Recently created</option>
                  <option value="title">Title A–Z</option>
                  <option value="language">Language</option>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((current) => !current)}
                  className={`gap-1.5 ${favoritesOnly ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''}`}
                >
                  <StarIcon
                    size={12}
                    weight={favoritesOnly ? 'fill' : 'regular'}
                    aria-hidden="true"
                  />
                  Favorites
                </Button>
                {allTags.length > 0 && (
                  <Select
                    value={filterTag}
                    onChange={(event) => setFilterTag(event.target.value)}
                    aria-label="Filter by tag"
                    title="Filter by tag"
                    className="min-w-0 flex-1"
                  >
                    <option value="">All tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        #{tag}
                      </option>
                    ))}
                  </Select>
                )}
                {hasFilters && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
              <span>
                {filtered.length === snippets.length ? 'Library' : `${filtered.length} results`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => void handleImport()}
                  title="Import snippets from JSON"
                  aria-label="Import snippets from JSON"
                >
                  <UploadSimpleIcon size={12} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => void handleExportAll()}
                  title="Export snippets as JSON"
                  aria-label="Export snippets as JSON"
                  disabled={snippets.length === 0}
                >
                  <DownloadSimpleIcon size={12} aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Snippets">
              {filtered.map((snippet) => {
                const isSelected = snippet.id === selectedId
                const matches = isSelected ? undefined : matchMap.get(snippet.id)
                const tone = LANG_TONES[snippet.language] ?? 'accent'
                return (
                  <Button
                    key={snippet.id}
                    id={`${snippetOptionsId}-option-${snippet.id}`}
                    type="button"
                    variant="ghost"
                    size="xs"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={
                      isSelected || (!selectedId && filtered[0]?.id === snippet.id) ? 0 : -1
                    }
                    onClick={() => setSelectedId(snippet.id)}
                    onKeyDown={(event) => handleListKeyDown(event, snippet.id)}
                    className={`group flex w-full justify-start rounded-none border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)] ${
                      isSelected
                        ? 'bg-[var(--color-accent-dim)]'
                        : 'hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold uppercase ${LANG_TONE_CLASSES[tone]}`}
                      >
                        {LANG_EXTENSIONS[snippet.language] ?? snippet.language}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text)]">
                            {highlightMatches(snippet.title || 'Untitled', matches, 'title')}
                          </span>
                          {isFavorite(snippet.tags) && (
                            <StarIcon
                              size={12}
                              weight="fill"
                              aria-label="Favorite"
                              className="shrink-0 text-[var(--color-warning)]"
                            />
                          )}
                          <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                            {relativeTime(snippet.updatedAt)}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-2xs text-[var(--color-text-muted)]">
                          {contentPreview(snippet.content) || 'Empty snippet'}
                        </span>
                        {(snippet.folder || visibleTags(snippet.tags).length > 0) && (
                          <span className="mt-1.5 flex items-center gap-2 overflow-hidden text-2xs text-[var(--color-text-muted)]">
                            {snippet.folder && (
                              <span className="flex min-w-0 items-center gap-1 truncate">
                                <FolderOpenIcon size={12} aria-hidden="true" />
                                {snippet.folder}
                              </span>
                            )}
                            {visibleTags(snippet.tags)
                              .slice(0, 2)
                              .map((tag) => (
                                <span key={tag} className="truncate">
                                  #{tag}
                                </span>
                              ))}
                          </span>
                        )}
                      </span>
                    </div>
                  </Button>
                )
              })}

              {filtered.length === 0 && (
                <EmptyState
                  icon={ScissorsIcon}
                  size="sm"
                  title={snippets.length === 0 ? 'No snippets yet' : 'No matches'}
                  description={
                    snippets.length === 0
                      ? 'Save reusable code and commands here.'
                      : 'Try a different search or clear the filters.'
                  }
                  action={
                    snippets.length === 0 ? null : (
                      <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </>
        }
      >
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex min-h-14 items-center gap-2 px-4 max-[1000px]:flex-wrap max-[1000px]:py-2">
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => void handleToggleFavorite()}
                    title={isFavorite(selected.tags) ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={
                      isFavorite(selected.tags) ? 'Remove from favorites' : 'Add to favorites'
                    }
                    className={isFavorite(selected.tags) ? 'text-[var(--color-warning)]' : ''}
                  >
                    <StarIcon
                      size={16}
                      weight={isFavorite(selected.tags) ? 'fill' : 'regular'}
                      aria-hidden="true"
                    />
                  </Button>
                  <div className="min-w-0 flex-1 max-[1000px]:basis-[calc(100%-2.5rem)]">
                    <InlineInput
                      ref={setTitleInputRef}
                      value={selected.title}
                      onChange={(event) =>
                        void updateSnippet(selected.id, { title: event.target.value })
                      }
                      placeholder="Snippet title"
                      aria-label="Snippet title"
                      className="w-full"
                    />
                    <p className="text-2xs text-[var(--color-text-muted)]" aria-live="polite">
                      {saving ? 'Saving changes…' : `Edited ${relativeTime(selected.updatedAt)}`}
                    </p>
                  </div>
                  <Select
                    value={selected.language}
                    onChange={(event) =>
                      void updateSnippet(selected.id, { language: event.target.value })
                    }
                    aria-label="Snippet language"
                    title="Snippet language"
                    className="w-32"
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => void handleCopy()}
                    title="Copy snippet"
                    aria-label="Copy snippet"
                  >
                    <ClipboardTextIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => void handleDuplicate()}
                    title={`Duplicate snippet (${formatShortcut('mod+shift+d')})`}
                    aria-label="Duplicate snippet"
                  >
                    <CopyIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => void handleDownload()}
                    title="Save snippet as file"
                    aria-label="Save snippet as file"
                  >
                    <DownloadSimpleIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => setDetailsOpen((current) => !current)}
                    title={detailsOpen ? 'Hide details' : 'Show details'}
                    aria-label={detailsOpen ? 'Hide snippet details' : 'Show snippet details'}
                    aria-expanded={detailsOpen}
                    className={
                      detailsOpen ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                    }
                  >
                    <SidebarIcon size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="icon"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                    title="Delete snippet"
                    aria-label="Delete snippet"
                    className="hover:text-[var(--color-error)]"
                  >
                    <TrashIcon size={14} aria-hidden="true" />
                  </Button>
                </div>
              </header>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
                  <Editor
                    theme={monacoTheme}
                    language={selected.language}
                    value={selected.content}
                    onChange={(value) => void updateSnippet(selected.id, { content: value ?? '' })}
                    options={{
                      ...monacoOptions,
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      padding: { top: 12, bottom: 12 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>

                {detailsOpen && (
                  <aside
                    aria-label="Snippet details"
                    className="absolute inset-y-0 right-0 z-10 w-60 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg max-[1000px]:w-52"
                  >
                    <h2 className="mb-4 text-xs font-semibold text-[var(--color-text)]">Details</h2>

                    <Field label="Folder">
                      <Input
                        value={selected.folder}
                        onChange={(event) =>
                          void updateSnippet(selected.id, { folder: event.target.value })
                        }
                        placeholder="No folder"
                        list={folderListId}
                        className="w-full"
                      />
                    </Field>
                    <datalist id={folderListId}>
                      {allFolders.map((folder) => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>

                    <div className="mt-5">
                      <SectionLabel as="div" className="mb-2">
                        <TagIcon size={12} aria-hidden="true" />
                        Tags
                      </SectionLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleTags(selected.tags).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-dim)] px-2 py-1 text-2xs text-[var(--color-accent)]"
                          >
                            {tag}
                            <Button
                              type="button"
                              variant="icon"
                              size="xs"
                              onClick={() => void handleRemoveTag(tag)}
                              aria-label={`Remove ${tag} tag`}
                              className="rounded-full p-0 hover:bg-transparent hover:text-[var(--color-error)]"
                            >
                              <XIcon size={12} aria-hidden="true" />
                            </Button>
                          </span>
                        ))}
                      </div>

                      <div className="relative mt-2">
                        <Input
                          ref={tagInputRef}
                          role="combobox"
                          aria-label="Add tag"
                          aria-autocomplete="list"
                          aria-expanded={tagSuggestions.length > 0}
                          aria-controls={tagSuggestions.length > 0 ? tagSuggestionsId : undefined}
                          aria-activedescendant={
                            suggestionIndex >= 0
                              ? `${tagSuggestionsId}-option-${suggestionIndex}`
                              : undefined
                          }
                          value={tagInput}
                          onChange={(event) => {
                            setTagInput(event.target.value)
                            setSuggestionIndex(-1)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                              event.preventDefault()
                              setSuggestionIndex((current) =>
                                Math.min(current + 1, tagSuggestions.length - 1)
                              )
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault()
                              setSuggestionIndex((current) => Math.max(current - 1, -1))
                            } else if (event.key === 'Enter') {
                              event.preventDefault()
                              const suggestion = tagSuggestions[suggestionIndex]
                              void handleAddTag(suggestion)
                            } else if (event.key === 'Escape') {
                              setTagInput('')
                              setSuggestionIndex(-1)
                            }
                          }}
                          placeholder="Add a tag"
                          className="w-full"
                        />
                        {tagSuggestions.length > 0 && (
                          <div
                            id={tagSuggestionsId}
                            role="listbox"
                            aria-label="Tag suggestions"
                            data-testid="tag-suggestions"
                            className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg"
                          >
                            {tagSuggestions.map((suggestion, index) => (
                              <Button
                                key={suggestion}
                                id={`${tagSuggestionsId}-option-${index}`}
                                type="button"
                                variant="ghost"
                                size="xs"
                                role="option"
                                aria-selected={index === suggestionIndex}
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  void handleAddTag(suggestion)
                                }}
                                className={`block w-full rounded-none px-2 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] ${
                                  index === suggestionIndex ? 'bg-[var(--color-surface-hover)]' : ''
                                }`}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {editorStats && (
                      <dl className="mt-6 space-y-2 border-t border-[var(--color-border)] pt-4 text-2xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--color-text-muted)]">Lines</dt>
                          <dd className="text-[var(--color-text)]">{editorStats.lines}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--color-text-muted)]">Characters</dt>
                          <dd className="text-[var(--color-text)]">{editorStats.characters}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--color-text-muted)]">Bytes</dt>
                          <dd className="text-[var(--color-text)]">{editorStats.bytes}</dd>
                        </div>
                      </dl>
                    )}

                    <dl className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4 text-2xs">
                      <div>
                        <dt className="text-[var(--color-text-muted)]">Created</dt>
                        <dd className="mt-0.5 text-[var(--color-text)]">
                          {formatTimestamp(selected.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-muted)]">Last edited</dt>
                        <dd className="mt-0.5 text-[var(--color-text)]">
                          {formatTimestamp(selected.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </aside>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={ScissorsIcon}
              title="Build your snippet library"
              description="Create a snippet or import an existing JSON backup to get started."
              className="h-full"
              action={
                <div className="flex items-center gap-2">
                  <Button type="button" variant="primary" onClick={() => void handleNew()}>
                    <PlusIcon size={12} aria-hidden="true" className="mr-1.5" />
                    New snippet
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handleImport()}>
                    <UploadSimpleIcon size={12} aria-hidden="true" className="mr-1.5" />
                    Import JSON
                  </Button>
                </div>
              }
            />
          )}
        </main>
      </MasterDetailLayout>

      {deleteDialogOpen && selected && (
        <Dialog
          title="Delete snippet?"
          onClose={() => setDeleteDialogOpen(false)}
          initialFocusRef={cancelDeleteRef}
          footer={
            <>
              <Button
                ref={cancelDeleteRef}
                type="button"
                variant="secondary"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void handleDelete()}>
                Delete snippet
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{selected.title || 'Untitled'}” will be permanently removed from this device.
          </p>
        </Dialog>
      )}
    </>
  )
}
