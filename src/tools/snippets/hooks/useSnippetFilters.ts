import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { descendantFolderIds } from '@/lib/resource-folders'
import type { ResourceFolder, Snippet } from '@/types/models'
import {
  isFavorite,
  visibleTags,
  type FuseMatchEntry,
  type SortMode,
} from '@/tools/snippets/snippet-model'

type SnippetFiltersInput = {
  snippets: Snippet[]
  snippetFolders: ResourceFolder[]
  activeFolder: string
  setActiveFolder: (folderId: string) => void
}

// Own the sidebar search, tag, favorite and folder filters, and the sorted result list.
export function useSnippetFilters({
  snippets,
  snippetFolders,
  activeFolder,
  setActiveFolder,
}: SnippetFiltersInput) {
  const deferredSnippets = useDeferredValue(snippets)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [filterTag, setFilterTag] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Building the index reads every snippet's content and every fragment's content. It depends
  // on whether a search is active, not on what the search says — keying it on `search` itself
  // rebuilt the whole corpus on each keystroke, so typing got slower as the library grew.
  const searching = search.trim().length > 0
  const fuse = useMemo(() => {
    if (!searching) return null
    return new Fuse(deferredSnippets, {
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
    })
  }, [deferredSnippets, searching])

  const fuseResults = useMemo(() => (fuse ? fuse.search(search.trim()) : null), [fuse, search])

  const matchMap = useMemo(() => {
    if (!fuseResults) return new Map<string, ReadonlyArray<FuseMatchEntry>>()
    return new Map(
      fuseResults.map((result) => [result.item.id, (result.matches ?? []) as FuseMatchEntry[]])
    )
  }, [fuseResults])

  const selectedFolderIds = useMemo(
    () => (activeFolder ? descendantFolderIds(snippetFolders, activeFolder) : null),
    [activeFolder, snippetFolders]
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
    const candidates = fuseResults
      ? fuseResults.map((result) => result.item)
      : [...deferredSnippets]
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
  }, [deferredSnippets, favoritesOnly, filterTag, fuseResults, selectedFolderIds, sortMode])

  const hasFilters = Boolean(search || activeFolder || filterTag || favoritesOnly)

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveFolder('')
    setFilterTag('')
    setFavoritesOnly(false)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [setActiveFolder])

  return {
    search,
    setSearch,
    sortMode,
    setSortMode,
    filterTag,
    setFilterTag,
    favoritesOnly,
    setFavoritesOnly,
    searchInputRef,
    matchMap,
    allTags,
    filtered,
    hasFilters,
    clearFilters,
  }
}
