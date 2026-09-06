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
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import Fuse from 'fuse.js'
import {
  ArrowRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
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
import { TextArea } from '@/components/shared/TextArea'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
import { TrashDialog, type TrashEntry } from '@/components/shared/TrashDialog'
import { useMonaco } from '@/hooks/useMonaco'
import { useIsInstanceActive } from '@/app/tool-instance'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useFoldersStore } from '@/stores/folders.store'
import { useUiStore } from '@/stores/ui.store'
import type { ResourceFolder, Snippet, SnippetFragment } from '@/types/models'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { sendToTool } from '@/lib/tool-handoff'
import { useToolState } from '@/hooks/useToolState'
import { SearchInput } from '@/components/shared/SearchInput'
import { formatShortcut } from '@/lib/shortcut-label'
import { formatBytes } from '@/lib/format'
import { descendantFolderIds, folderPath, foldersForKind } from '@/lib/resource-folders'
import { fragmentsForSnippet } from '@/lib/snippet-fragments'

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

function isFavorite(tags: string[], favorite = false): boolean {
  return favorite || tags.includes(FAVORITE_TAG)
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

/**
 * Import budgets. A backup is arbitrary local JSON parsed whole into renderer memory, so both
 * the byte size and the item count are checked before any work happens.
 */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_SNIPPETS = 5000
/** Per-field caps, applied while mapping so one huge string cannot dominate the import. */
const MAX_SNIPPET_TITLE_CHARS = 2_000
const MAX_SNIPPET_CONTENT_CHARS = 500_000
const MAX_SNIPPET_DESCRIPTION_CHARS = 100_000
const MAX_SNIPPET_FRAGMENT_NAME_CHARS = 500
const MAX_SNIPPET_FRAGMENTS = 100
const MAX_SNIPPET_TAGS = 50

function importedSnippet(item: unknown): {
  title: string
  content: string
  language: string
  tags: string[]
  folder: string
  favorite: boolean
  folderId: string | null
  description: string
  fragments: SnippetFragment[]
} | null {
  if (!item || typeof item !== 'object') return null
  const candidate = item as Record<string, unknown>
  if (typeof candidate['title'] !== 'string' || typeof candidate['content'] !== 'string') {
    return null
  }

  const now = Date.now()
  const fragments = Array.isArray(candidate['fragments'])
    ? candidate['fragments'].slice(0, MAX_SNIPPET_FRAGMENTS).flatMap((value, index) => {
        if (!value || typeof value !== 'object') return []
        const fragment = value as Record<string, unknown>
        if (typeof fragment['content'] !== 'string') return []
        return [
          {
            id: crypto.randomUUID(),
            name:
              typeof fragment['name'] === 'string'
                ? fragment['name'].slice(0, MAX_SNIPPET_FRAGMENT_NAME_CHARS)
                : 'fragment',
            content: fragment['content'].slice(0, MAX_SNIPPET_CONTENT_CHARS),
            language: typeof fragment['language'] === 'string' ? fragment['language'] : 'text',
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
          },
        ]
      })
    : []

  return {
    title: candidate['title'].slice(0, MAX_SNIPPET_TITLE_CHARS),
    content: candidate['content'].slice(0, MAX_SNIPPET_CONTENT_CHARS),
    language: typeof candidate['language'] === 'string' ? candidate['language'] : 'text',
    tags: Array.isArray(candidate['tags'])
      ? candidate['tags']
          .filter((tag): tag is string => typeof tag === 'string')
          .slice(0, MAX_SNIPPET_TAGS)
      : [],
    folder: typeof candidate['folder'] === 'string' ? candidate['folder'] : '',
    folderId: typeof candidate['folderId'] === 'string' ? candidate['folderId'] : null,
    favorite:
      candidate['favorite'] === true ||
      candidate['favorite'] === 1 ||
      (Array.isArray(candidate['tags']) && candidate['tags'].includes('⭐')),
    description:
      typeof candidate['description'] === 'string'
        ? candidate['description'].slice(0, MAX_SNIPPET_DESCRIPTION_CHARS)
        : '',
    fragments:
      fragments.length > 0
        ? fragments
        : [
            {
              id: crypto.randomUUID(),
              name: 'main',
              content: candidate['content'].slice(0, MAX_SNIPPET_CONTENT_CHARS),
              language: typeof candidate['language'] === 'string' ? candidate['language'] : 'text',
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
  }
}

export default function SnippetsManager() {
  const tagSuggestionsId = useId()
  const snippetOptionsId = useId()
  const fragmentEditorId = useId()
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const snippets = useSnippetsStore((state) => state.snippets)
  const trashedSnippets = useSnippetsStore((state) => state.trashedSnippets)
  const [handoffState, updateHandoffState] = useToolState<{
    handoff: { title: string; content: string; language: string } | null
    wikiTargetId: string | null
    backlinkNoteId: string | null
    activeFragmentIds: Record<string, string>
  }>('snippets', {
    handoff: null,
    wikiTargetId: null,
    backlinkNoteId: null,
    activeFragmentIds: {},
  })
  const saving = useSnippetsStore((state) => state.saving)
  const activeFolder = useSnippetsStore((state) => state.activeFolder)
  const setActiveFolder = useSnippetsStore((state) => state.setActiveFolder)
  const addSnippet = useSnippetsStore((state) => state.add)
  const updateSnippet = useSnippetsStore((state) => state.update)
  const flushPendingSnippet = useSnippetsStore((state) => state.flushPending)
  const removeSnippet = useSnippetsStore((state) => state.remove)
  const restoreSnippet = useSnippetsStore((state) => state.restore)
  const permanentlyDeleteSnippet = useSnippetsStore((state) => state.permanentlyDelete)
  const refreshSnippets = useSnippetsStore((state) => state.refresh)
  const folders = useFoldersStore((state) => state.folders)
  const trashedFolders = useFoldersStore((state) => state.trashedFolders)
  const createFolder = useFoldersStore((state) => state.create)
  const updateFolder = useFoldersStore((state) => state.update)
  const moveFolder = useFoldersStore((state) => state.move)
  const trashFolder = useFoldersStore((state) => state.trash)
  const restoreFolder = useFoldersStore((state) => state.restore)
  const permanentlyDeleteFolder = useFoldersStore((state) => state.permanentlyDelete)
  const emptyFolderTrash = useFoldersStore((state) => state.emptyTrash)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const copy = useCopyToClipboard()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [filterTag, setFilterTag] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fragmentDeleteCandidate, setFragmentDeleteCandidate] = useState<SnippetFragment | null>(
    null
  )
  const [tagInput, setTagInput] = useState('')
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const [titleFocusRequest, setTitleFocusRequest] = useState(0)
  const [recentlyDeleted, setRecentlyDeleted] = useState<Snippet | null>(null)
  const [folderTrashCandidate, setFolderTrashCandidate] = useState<ResourceFolder | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const handledTitleFocusRequestRef = useRef(0)
  const previousSelectedIdRef = useRef<string | null>(null)
  const linkedSnippetIdRef = useRef<string | null>(null)
  const deleteUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handoffInFlightRef = useRef<string | null>(null)

  useEffect(() => {
    const handoff = handoffState.handoff
    if (!handoff) return
    const handoffKey = `${handoff.title}\u0000${handoff.language}\u0000${handoff.content}`
    if (handoffInFlightRef.current === handoffKey) return
    handoffInFlightRef.current = handoffKey
    // Consume before awaiting so React Strict Mode cannot replay the effect
    // into a duplicate persisted snippet.
    updateHandoffState({ handoff: null })
    void addSnippet(handoff.title, handoff.content, handoff.language)
      .then((snippet) => {
        setSelectedId(snippet.id)
        setLastAction(`Added ${handoff.title} from another tool`, 'success')
      })
      .catch(() => {
        setLastAction('Could not add handed-off snippet', 'error')
      })
      .finally(() => {
        if (handoffInFlightRef.current === handoffKey) handoffInFlightRef.current = null
      })
  }, [addSnippet, handoffState.handoff, setLastAction, updateHandoffState])

  useEffect(() => {
    const previousId = previousSelectedIdRef.current
    if (previousId && previousId !== selectedId) void flushPendingSnippet(previousId)
    previousSelectedIdRef.current = selectedId
  }, [flushPendingSnippet, selectedId])

  useEffect(
    () => () => {
      void flushPendingSnippet()
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
    },
    [flushPendingSnippet]
  )

  const setTitleInputRef = useCallback((element: HTMLInputElement | null) => {
    titleInputRef.current = element
  }, [])

  const fuse = useMemo(
    () =>
      new Fuse(snippets, {
        keys: [
          'title',
          'description',
          'content',
          'language',
          'fragments.name',
          'fragments.content',
          'fragments.language',
          'folder',
          'tags',
        ],
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

  const snippetFolders = useMemo(() => foldersForKind(folders, 'snippets'), [folders])
  const trashedSnippetFolders = useMemo(
    () => foldersForKind(trashedFolders, 'snippets'),
    [trashedFolders]
  )
  const trashEntries = useMemo<TrashEntry[]>(() => {
    const trashedFolderIds = new Set(trashedSnippetFolders.map((folder) => folder.id))
    const folderEntries = trashedSnippetFolders
      .filter((folder) => !folder.parentId || !trashedFolderIds.has(folder.parentId))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        detail: 'Folder and its contents',
        type: 'folder' as const,
      }))
    const snippetEntries = trashedSnippets
      .filter((snippet) => !snippet.folderId || !trashedFolderIds.has(snippet.folderId))
      .map((snippet) => ({
        id: snippet.id,
        name: snippet.title || 'Untitled snippet',
        detail: snippet.language,
        type: 'item' as const,
      }))
    return [...folderEntries, ...snippetEntries]
  }, [trashedSnippetFolders, trashedSnippets])
  const selectedFolderIds = useMemo(
    () => (activeFolder ? descendantFolderIds(snippetFolders, activeFolder) : null),
    [activeFolder, snippetFolders]
  )
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const snippet of snippets) {
      if (snippet.folderId) {
        counts.set(snippet.folderId, (counts.get(snippet.folderId) ?? 0) + 1)
      }
    }
    return counts
  }, [snippets])

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
      if (selectedFolderIds && (!snippet.folderId || !selectedFolderIds.has(snippet.folderId)))
        return false
      if (filterTag && !snippet.tags.includes(filterTag)) return false
      if (favoritesOnly && !isFavorite(snippet.tags, snippet.favorite)) return false
      return true
    })

    visible.sort((a, b) => {
      const favoriteOrder =
        Number(isFavorite(b.tags, b.favorite)) - Number(isFavorite(a.tags, a.favorite))
      if (favoriteOrder !== 0) return favoriteOrder
      if (sortMode === 'created') return b.createdAt - a.createdAt
      if (sortMode === 'title') return a.title.localeCompare(b.title)
      if (sortMode === 'language') {
        return a.language.localeCompare(b.language) || b.updatedAt - a.updatedAt
      }
      return b.updatedAt - a.updatedAt
    })

    return visible
  }, [favoritesOnly, filterTag, fuseResults, selectedFolderIds, snippets, sortMode])

  const selected = useMemo(
    () => snippets.find((snippet) => snippet.id === selectedId) ?? null,
    [selectedId, snippets]
  )

  const fragments = useMemo(() => (selected ? fragmentsForSnippet(selected) : []), [selected])
  const activeFragment = useMemo(() => {
    if (!selected) return null
    const activeId = handoffState.activeFragmentIds[selected.id]
    return fragments.find((fragment) => fragment.id === activeId) ?? fragments[0] ?? null
  }, [fragments, handoffState.activeFragmentIds, selected])

  const editorStats = useMemo(() => {
    if (!activeFragment) return null
    return {
      lines: activeFragment.content.split('\n').length,
      characters: activeFragment.content.length,
      bytes: new TextEncoder().encode(activeFragment.content).length,
    }
  }, [activeFragment])

  const tagSuggestions = useMemo(() => {
    if (!selected || !tagInput.trim()) return []
    const query = tagInput.trim().toLowerCase()
    return allTags.filter(
      (tag) => tag.toLowerCase().includes(query) && !selected.tags.includes(tag)
    )
  }, [allTags, selected, tagInput])

  const hasFilters = Boolean(search || activeFolder || filterTag || favoritesOnly)

  useEffect(() => {
    if (!handoffState.wikiTargetId) return
    if (!snippets.some((snippet) => snippet.id === handoffState.wikiTargetId)) return
    linkedSnippetIdRef.current = handoffState.wikiTargetId
    setSelectedId(handoffState.wikiTargetId)
    updateHandoffState({ wikiTargetId: null })
  }, [handoffState.wikiTargetId, snippets, updateHandoffState])

  useEffect(() => {
    if (
      handoffState.backlinkNoteId &&
      !handoffState.wikiTargetId &&
      linkedSnippetIdRef.current &&
      selectedId !== linkedSnippetIdRef.current
    ) {
      linkedSnippetIdRef.current = null
      updateHandoffState({ backlinkNoteId: null })
    }
  }, [handoffState.backlinkNoteId, handoffState.wikiTargetId, selectedId, updateHandoffState])

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
    setFragmentDeleteCandidate(null)
    const current = useSnippetsStore
      .getState()
      .snippets.find((snippet) => snippet.id === selectedId)
    setDescriptionOpen(Boolean(current?.description))
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
      const folder = snippetFolders.find((candidate) => candidate.id === activeFolder)
      const snippet = await addSnippet(
        'Untitled snippet',
        '',
        folder?.defaultLanguage ?? 'javascript',
        [],
        folder?.name ?? '',
        false,
        folder?.id ?? 'snippets-inbox'
      )
      setSelectedId(snippet.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet created', 'success')
    } catch {
      setLastAction('Failed to create snippet', 'error')
    }
  }, [activeFolder, addSnippet, setLastAction, snippetFolders])

  const handleDuplicate = useCallback(async () => {
    if (!selected) return
    try {
      const duplicate = await addSnippet(
        `${selected.title || 'Untitled'} copy`,
        selected.content,
        selected.language,
        visibleTags(selected.tags),
        selected.folder,
        // Without this the copy defaults to unfavorited and vanishes under the Favorites filter.
        !!selected.favorite,
        selected.folderId,
        selected.description ?? '',
        fragments
      )
      setSelectedId(duplicate.id)
      setTitleFocusRequest((request) => request + 1)
      setLastAction('Snippet duplicated', 'success')
    } catch {
      setLastAction('Duplicate failed', 'error')
    }
  }, [addSnippet, fragments, selected, setLastAction])

  const selectFragment = useCallback(
    (fragmentId: string) => {
      if (!selected) return
      updateHandoffState({
        activeFragmentIds: {
          ...handoffState.activeFragmentIds,
          [selected.id]: fragmentId,
        },
      })
    },
    [handoffState.activeFragmentIds, selected, updateHandoffState]
  )

  const updateActiveFragment = useCallback(
    (patch: Partial<Pick<SnippetFragment, 'name' | 'content' | 'language'>>) => {
      if (!selected || !activeFragment) return
      const now = Date.now()
      void updateSnippet(selected.id, {
        fragments: fragments.map((fragment) =>
          fragment.id === activeFragment.id ? { ...fragment, ...patch, updatedAt: now } : fragment
        ),
      })
    },
    [activeFragment, fragments, selected, updateSnippet]
  )

  const handleAddFragment = useCallback(() => {
    if (!selected || !activeFragment) return
    const now = Date.now()
    const fragment: SnippetFragment = {
      id: crypto.randomUUID(),
      name: `fragment ${fragments.length + 1}`,
      content: '',
      language: activeFragment.language,
      sortOrder: fragments.length,
      createdAt: now,
      updatedAt: now,
    }
    void updateSnippet(selected.id, { fragments: [...fragments, fragment] })
    selectFragment(fragment.id)
  }, [activeFragment, fragments, selectFragment, selected, updateSnippet])

  const handleDuplicateFragment = useCallback(() => {
    if (!selected || !activeFragment) return
    const index = fragments.findIndex((fragment) => fragment.id === activeFragment.id)
    if (index < 0) return
    const now = Date.now()
    const duplicate: SnippetFragment = {
      ...activeFragment,
      id: crypto.randomUUID(),
      name: `${activeFragment.name || 'fragment'} copy`,
      sortOrder: index + 1,
      createdAt: now,
      updatedAt: now,
    }
    const next = [...fragments]
    next.splice(index + 1, 0, duplicate)
    void updateSnippet(selected.id, { fragments: next })
    selectFragment(duplicate.id)
  }, [activeFragment, fragments, selectFragment, selected, updateSnippet])

  const handleMoveFragment = useCallback(
    (direction: -1 | 1) => {
      if (!selected || !activeFragment) return
      const index = fragments.findIndex((fragment) => fragment.id === activeFragment.id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= fragments.length) return
      const next = [...fragments]
      const [moved] = next.splice(index, 1)
      if (!moved) return
      next.splice(nextIndex, 0, moved)
      void updateSnippet(selected.id, { fragments: next })
    },
    [activeFragment, fragments, selected, updateSnippet]
  )

  const handleDeleteFragment = useCallback(() => {
    if (!selected || !fragmentDeleteCandidate || fragments.length <= 1) return
    const index = fragments.findIndex((fragment) => fragment.id === fragmentDeleteCandidate.id)
    const next = fragments.filter((fragment) => fragment.id !== fragmentDeleteCandidate.id)
    const replacement = next[Math.min(index, next.length - 1)] ?? next[0]
    void updateSnippet(selected.id, { fragments: next })
    if (replacement) selectFragment(replacement.id)
    setFragmentDeleteCandidate(null)
    setLastAction('Fragment deleted', 'info')
  }, [fragmentDeleteCandidate, fragments, selectFragment, selected, setLastAction, updateSnippet])

  const handleDelete = useCallback(async () => {
    if (!selected) return
    const currentIndex = filtered.findIndex((snippet) => snippet.id === selected.id)
    const nextSelection = filtered[currentIndex + 1] ?? filtered[currentIndex - 1] ?? null
    try {
      await removeSnippet(selected.id)
      setRecentlyDeleted(selected)
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
      deleteUndoTimerRef.current = setTimeout(() => setRecentlyDeleted(null), 8_000)
      setSelectedId(nextSelection?.id ?? null)
      setDeleteDialogOpen(false)
      setLastAction('Snippet moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move snippet to Trash', 'error')
    }
  }, [filtered, removeSnippet, selected, setLastAction])

  const handleUndoDelete = useCallback(async () => {
    if (!recentlyDeleted) return
    try {
      await restoreSnippet(recentlyDeleted.id)
      setSelectedId(recentlyDeleted.id)
      setRecentlyDeleted(null)
      if (deleteUndoTimerRef.current) clearTimeout(deleteUndoTimerRef.current)
      setLastAction('Snippet restored', 'success')
    } catch {
      setLastAction('Restore failed', 'error')
    }
  }, [recentlyDeleted, restoreSnippet, setLastAction])

  const handleTrashFolder = useCallback(async () => {
    if (!folderTrashCandidate) return
    try {
      await flushPendingSnippet()
      await trashFolder(folderTrashCandidate.id)
      await refreshSnippets()
      setActiveFolder('')
      setFolderTrashCandidate(null)
      setLastAction('Folder moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move folder to Trash', 'error')
    }
  }, [
    flushPendingSnippet,
    folderTrashCandidate,
    refreshSnippets,
    setActiveFolder,
    setLastAction,
    trashFolder,
  ])

  const handleRestoreTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await restoreFolder(entry.id)
        await refreshSnippets()
      } else {
        await restoreSnippet(entry.id)
      }
      setLastAction(`${entry.name} restored`, 'success')
    },
    [refreshSnippets, restoreFolder, restoreSnippet, setLastAction]
  )

  const handleDeleteTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await permanentlyDeleteFolder(entry.id)
        await refreshSnippets()
      } else {
        await permanentlyDeleteSnippet(entry.id)
      }
      setLastAction(`${entry.name} permanently deleted`, 'info')
    },
    [permanentlyDeleteFolder, permanentlyDeleteSnippet, refreshSnippets, setLastAction]
  )

  const handleEmptyTrash = useCallback(async () => {
    await emptyFolderTrash('snippets')
    await refreshSnippets()
    setLastAction('Snippets Trash emptied', 'info')
  }, [emptyFolderTrash, refreshSnippets, setLastAction])

  const handleToggleFavorite = useCallback(async () => {
    if (!selected) return
    const wasFavorite = isFavorite(selected.tags, selected.favorite)
    const tags = selected.tags.filter((tag) => tag !== FAVORITE_TAG)
    try {
      await updateSnippet(selected.id, { tags, favorite: !wasFavorite })
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
      const backup = { version: 3, folders: snippetFolders, snippets }
      const path = await exportFile(JSON.stringify(backup, null, 2), 'snippets-backup.json')
      if (path) {
        setLastAction(
          `Exported ${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`,
          'success'
        )
      }
    } catch {
      setLastAction('Export failed', 'error')
    }
  }, [setLastAction, snippetFolders, snippets])

  const handleImport = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return

      // Budgets come first: the whole backup is parsed and mapped in renderer memory before a
      // single row is written, so an unbounded file fails after the expensive part.
      const bytes = new TextEncoder().encode(file.content).length
      if (bytes > MAX_IMPORT_BYTES) {
        setLastAction(
          `Import failed — file is ${formatBytes(bytes)}, above the ${formatBytes(MAX_IMPORT_BYTES)} limit`,
          'error'
        )
        return
      }

      const parsed: unknown = JSON.parse(file.content)
      const envelope =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null
      const parsedItems = Array.isArray(parsed)
        ? parsed
        : (envelope?.['version'] === 2 || envelope?.['version'] === 3) &&
            Array.isArray(envelope['snippets'])
          ? envelope['snippets']
          : null
      if (!parsedItems) throw new Error('Expected a snippets array or version 2 library')
      if (parsedItems.length > MAX_IMPORT_SNIPPETS) {
        setLastAction(
          `Import failed — ${parsedItems.length} snippets exceeds the ${MAX_IMPORT_SNIPPETS} snippet limit`,
          'error'
        )
        return
      }

      const validSnippets = parsedItems
        .map((item) => importedSnippet(item))
        .filter((item): item is NonNullable<typeof item> => item !== null)
      if (validSnippets.length === 0) throw new Error('No valid snippets')

      const signature = (snippet: {
        title: string
        content: string
        fragments?: Array<{ content: string }>
      }) =>
        `${snippet.title}\u0000${(snippet.fragments ?? [{ content: snippet.content }])
          .map((fragment) => fragment.content)
          .join('\u0001')}`
      const existing = new Set(snippets.map(signature))
      const uniqueSnippets = validSnippets.filter((item) => {
        const key = signature(item)
        if (existing.has(key)) return false
        existing.add(key)
        return true
      })
      if (uniqueSnippets.length === 0) {
        setLastAction('No new snippets to import', 'info')
        return
      }

      // Writes are not atomic, so a failure part-way leaves earlier snippets committed.
      // Report what actually landed instead of a bare "failed".
      let firstImported: Snippet | null = null
      let imported = 0
      let writeError: unknown = null
      const folderIdMap = new Map<string, string>()
      const availableFolders = foldersForKind(useFoldersStore.getState().folders, 'snippets')
      const folderDrafts = Array.isArray(envelope?.['folders'])
        ? envelope['folders']
            .map((value) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>) : null
            )
            .filter((value): value is Record<string, unknown> => value !== null)
        : []
      // Walk the exported tree order (parents before children) while still splicing safely.
      const unresolved = [...folderDrafts].reverse()
      while (unresolved.length > 0) {
        const before = unresolved.length
        for (let index = unresolved.length - 1; index >= 0; index--) {
          const draft = unresolved[index]
          if (!draft) continue
          const oldId = typeof draft['id'] === 'string' ? draft['id'] : null
          const name = typeof draft['name'] === 'string' ? draft['name'].trim() : ''
          const oldParentId = typeof draft['parentId'] === 'string' ? draft['parentId'] : null
          if (!oldId || !name || (oldParentId && !folderIdMap.has(oldParentId))) continue
          const parentId = oldParentId ? (folderIdMap.get(oldParentId) ?? null) : null
          const existing = availableFolders.find(
            (folder) => folder.name === name && folder.parentId === parentId
          )
          const resolved =
            existing ??
            (await createFolder({
              name,
              kind: 'snippets',
              parentId,
              ...(typeof draft['defaultLanguage'] === 'string'
                ? { defaultLanguage: draft['defaultLanguage'] }
                : {}),
            }))
          if (!existing) availableFolders.push(resolved)
          folderIdMap.set(oldId, resolved.id)
          unresolved.splice(index, 1)
        }
        if (unresolved.length === before) break
      }
      for (const item of uniqueSnippets) {
        try {
          let folderId = item.folderId ? folderIdMap.get(item.folderId) : undefined
          if (!folderId && item.folder) {
            let folder = availableFolders.find(
              (candidate) => candidate.parentId === null && candidate.name === item.folder
            )
            if (!folder) {
              folder = await createFolder({
                name: item.folder,
                kind: 'snippets',
                parentId: null,
              })
              availableFolders.push(folder)
            }
            folderId = folder.id
          }
          const created = await addSnippet(
            item.title,
            item.content,
            item.language,
            item.tags,
            item.folder,
            item.favorite,
            folderId ?? 'snippets-inbox',
            item.description,
            item.fragments
          )
          firstImported ??= created
          imported += 1
        } catch (err) {
          writeError = err
          break
        }
      }
      setSelectedId(firstImported?.id ?? null)

      if (writeError) {
        setLastAction(
          `Import stopped after ${imported} of ${uniqueSnippets.length} snippet${uniqueSnippets.length === 1 ? '' : 's'} — the rest were not saved`,
          'error'
        )
        return
      }

      const skipped = validSnippets.length - uniqueSnippets.length
      setLastAction(
        `Imported ${imported} snippet${imported === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`,
        'success'
      )
    } catch {
      setLastAction('Import failed — choose a valid snippets JSON file', 'error')
    }
  }, [addSnippet, createFolder, setLastAction, snippets])

  const handleDownload = useCallback(async () => {
    if (!selected || !activeFragment) return
    const extension = LANG_EXTENSIONS[activeFragment.language] ?? 'txt'
    const baseName =
      fragments.length > 1 ? `${selected.title}-${activeFragment.name}` : selected.title
    const filename = buildExportFilename(baseName || 'snippet', extension)
    try {
      const path = await exportFile(activeFragment.content, filename)
      if (path) setLastAction(`Downloaded ${filename}`, 'success')
    } catch {
      setLastAction('Download failed', 'error')
    }
  }, [activeFragment, fragments.length, selected, setLastAction])

  const handleCopy = useCallback(async () => {
    if (!activeFragment) return
    await copy(activeFragment.content)
  }, [activeFragment, copy])

  const handleSendToPromptTemplate = useCallback(() => {
    if (!selected || !activeFragment) return
    sendToTool('prompt-templates', {
      handoffContent: activeFragment.content,
      handoffLanguage: activeFragment.language,
    })
    setLastAction('Snippet sent to Prompt Templates', 'success')
  }, [activeFragment, selected, setLastAction])

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
          <div className="flex items-center gap-1">
            {recentlyDeleted && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleUndoDelete()}
              >
                Undo delete
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTrashOpen(true)}
              aria-label={`Open Snippets Trash, ${trashEntries.length} items`}
            >
              <TrashIcon size={12} aria-hidden="true" />
              Trash{trashEntries.length > 0 ? ` (${trashEntries.length})` : ''}
            </Button>
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
          </div>
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

              <div className="grid grid-cols-1 gap-2">
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
            <ResourceFolderTree
              folders={snippetFolders}
              selectedFolderId={activeFolder || null}
              onSelect={(folderId) => setActiveFolder(folderId ?? '')}
              onCreate={(parentId) =>
                createFolder({ name: 'New folder', kind: 'snippets', parentId })
              }
              onUpdate={updateFolder}
              onMove={moveFolder}
              onTrash={setFolderTrashCandidate}
              itemCounts={folderCounts}
              languageOptions={LANGUAGES}
              label="Snippet folders"
            />

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
                          {isFavorite(snippet.tags, snippet.favorite) && (
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
                    title={
                      isFavorite(selected.tags, selected.favorite)
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                    }
                    aria-label={
                      isFavorite(selected.tags, selected.favorite)
                        ? 'Remove from favorites'
                        : 'Add to favorites'
                    }
                    className={
                      isFavorite(selected.tags, selected.favorite)
                        ? 'text-[var(--color-warning)]'
                        : ''
                    }
                  >
                    <StarIcon
                      size={16}
                      weight={isFavorite(selected.tags, selected.favorite) ? 'fill' : 'regular'}
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
                  {handoffState.backlinkNoteId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        sendToTool('notes', {
                          selectedId: handoffState.backlinkNoteId,
                          selectedFolderId: null,
                          taskView: 'notes',
                        })
                      }
                    >
                      Back to note
                    </Button>
                  )}
                  <Select
                    value={activeFragment?.language ?? 'text'}
                    onChange={(event) => updateActiveFragment({ language: event.target.value })}
                    aria-label="Snippet language"
                    title="Snippet language"
                    className="w-32"
                    disabled={!activeFragment}
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
                    onClick={handleSendToPromptTemplate}
                    title="Send snippet to Prompt Templates"
                    aria-label="Send snippet to Prompt Templates"
                  >
                    <ArrowRightIcon size={14} aria-hidden="true" />
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
                    title="Move snippet to Trash"
                    aria-label="Move snippet to Trash"
                    className="hover:text-[var(--color-error)]"
                  >
                    <TrashIcon size={14} aria-hidden="true" />
                  </Button>
                </div>
              </header>

              {activeFragment && (
                <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="flex min-w-0 items-center gap-1.5 px-3 py-1.5">
                    <div
                      role="tablist"
                      aria-label="Snippet fragments"
                      className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
                    >
                      {fragments.map((fragment) => (
                        <Button
                          key={fragment.id}
                          id={`${fragmentEditorId}-tab-${fragment.id}`}
                          type="button"
                          role="tab"
                          variant="ghost"
                          size="sm"
                          aria-selected={fragment.id === activeFragment.id}
                          aria-controls={fragmentEditorId}
                          tabIndex={fragment.id === activeFragment.id ? 0 : -1}
                          onClick={() => selectFragment(fragment.id)}
                          onKeyDown={(event) => {
                            const index = fragments.findIndex(
                              (candidate) => candidate.id === fragment.id
                            )
                            let nextIndex: number | null = null
                            if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1)
                            if (event.key === 'ArrowRight') {
                              nextIndex = Math.min(fragments.length - 1, index + 1)
                            }
                            if (event.key === 'Home') nextIndex = 0
                            if (event.key === 'End') nextIndex = fragments.length - 1
                            const next = nextIndex === null ? null : fragments[nextIndex]
                            if (!next || next.id === fragment.id) return
                            event.preventDefault()
                            selectFragment(next.id)
                            requestAnimationFrame(() =>
                              document.getElementById(`${fragmentEditorId}-tab-${next.id}`)?.focus()
                            )
                          }}
                          className={
                            fragment.id === activeFragment.id
                              ? 'shrink-0 bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                              : 'shrink-0'
                          }
                        >
                          {fragment.name || 'Untitled fragment'}
                        </Button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={handleAddFragment}
                      aria-label="Add fragment"
                    >
                      <PlusIcon size={13} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => handleMoveFragment(-1)}
                      disabled={activeFragment.sortOrder === 0}
                      aria-label="Move fragment left"
                    >
                      <CaretLeftIcon size={13} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => handleMoveFragment(1)}
                      disabled={activeFragment.sortOrder === fragments.length - 1}
                      aria-label="Move fragment right"
                    >
                      <CaretRightIcon size={13} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleDuplicateFragment}
                    >
                      Duplicate fragment
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={fragments.length <= 1}
                      onClick={() => setFragmentDeleteCandidate(activeFragment)}
                    >
                      Delete fragment
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-1.5">
                    <Input
                      value={activeFragment.name}
                      onChange={(event) => updateActiveFragment({ name: event.target.value })}
                      aria-label="Fragment name"
                      className="max-w-64"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-expanded={descriptionOpen}
                      onClick={() => setDescriptionOpen((open) => !open)}
                    >
                      {selected.description ? 'Description' : 'Add description'}
                    </Button>
                    <span className="text-2xs text-[var(--color-text-muted)]">
                      {fragments.length} fragment{fragments.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ${
                      descriptionOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-[var(--color-border)] p-3">
                        <TextArea
                          value={selected.description ?? ''}
                          onChange={(event) =>
                            void updateSnippet(selected.id, { description: event.target.value })
                          }
                          aria-label="Snippet description"
                          placeholder="Markdown usage notes, constraints, or examples"
                          rows={4}
                          className="resize-y"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
                id={fragmentEditorId}
                role="tabpanel"
                aria-labelledby={
                  activeFragment ? `${fragmentEditorId}-tab-${activeFragment.id}` : undefined
                }
                className="relative min-h-0 flex-1 overflow-hidden"
              >
                <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
                  <Editor
                    theme={monacoTheme}
                    language={activeFragment?.language ?? 'text'}
                    value={activeFragment?.content ?? ''}
                    onChange={(value) => updateActiveFragment({ content: value ?? '' })}
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
                      <Select
                        value={selected.folderId ?? 'snippets-inbox'}
                        onChange={(event) => {
                          const folder = snippetFolders.find(
                            (candidate) => candidate.id === event.target.value
                          )
                          if (!folder) return
                          void updateSnippet(selected.id, {
                            folderId: folder.id,
                            folder: folderPath(snippetFolders, folder.id).join(' / '),
                          })
                        }}
                        aria-label="Snippet folder"
                        className="w-full"
                      >
                        {snippetFolders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folderPath(snippetFolders, folder.id).join(' / ')}
                          </option>
                        ))}
                      </Select>
                    </Field>

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
          title="Move snippet to Trash?"
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
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{selected.title || 'Untitled'}” can be restored from Trash at any time.
          </p>
        </Dialog>
      )}
      {fragmentDeleteCandidate && (
        <Dialog
          title="Delete fragment?"
          onClose={() => setFragmentDeleteCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFragmentDeleteCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteFragment}>
                Delete fragment
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{fragmentDeleteCandidate.name || 'Untitled fragment'}” will be removed from this
            snippet. The rest of the snippet is unchanged.
          </p>
        </Dialog>
      )}
      {folderTrashCandidate && (
        <Dialog
          title="Move folder to Trash?"
          onClose={() => setFolderTrashCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFolderTrashCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleTrashFolder()}>
                Move folder to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{folderTrashCandidate.name}” and everything nested inside it will move to Trash
            together.
          </p>
        </Dialog>
      )}
      {trashOpen && (
        <TrashDialog
          title="Snippets Trash"
          entries={trashEntries}
          onClose={() => setTrashOpen(false)}
          onRestore={handleRestoreTrashEntry}
          onDeletePermanently={handleDeleteTrashEntry}
          onEmpty={handleEmptyTrash}
        />
      )}
    </>
  )
}
