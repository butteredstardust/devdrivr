import { useCallback, useMemo, useState } from 'react'
import { fragmentsForSnippet } from '@/lib/snippet-fragments'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet, SnippetFragment } from '@/types/models'
import type { SnippetsToolState } from '@/tools/snippets/snippet-model'

type SnippetFragmentsInput = {
  selected: Snippet | null
  activeFragmentIds: SnippetsToolState['activeFragmentIds']
  updateToolState: (patch: Partial<SnippetsToolState>) => void
}

// Own the fragment tabs of the selected snippet. The active fragment per snippet persists in
// tool state, so it survives a tab switch.
export function useSnippetFragments({
  selected,
  activeFragmentIds,
  updateToolState,
}: SnippetFragmentsInput) {
  const updateSnippet = useSnippetsStore((state) => state.update)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const [fragmentDeleteCandidate, setFragmentDeleteCandidate] = useState<SnippetFragment | null>(
    null
  )

  const fragments = useMemo(() => (selected ? fragmentsForSnippet(selected) : []), [selected])
  const activeFragment = useMemo(() => {
    if (!selected) return null
    const activeId = activeFragmentIds[selected.id]
    return fragments.find((fragment) => fragment.id === activeId) ?? fragments[0] ?? null
  }, [fragments, activeFragmentIds, selected])

  const selectFragment = useCallback(
    (fragmentId: string) => {
      if (!selected) return
      updateToolState({
        activeFragmentIds: {
          ...activeFragmentIds,
          [selected.id]: fragmentId,
        },
      })
    },
    [activeFragmentIds, selected, updateToolState]
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

  return {
    fragments,
    activeFragment,
    fragmentDeleteCandidate,
    setFragmentDeleteCandidate,
    selectFragment,
    updateActiveFragment,
    handleAddFragment,
    handleDuplicateFragment,
    handleMoveFragment,
    handleDeleteFragment,
  }
}
