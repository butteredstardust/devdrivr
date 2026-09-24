import { useCallback, useMemo, useRef, useState } from 'react'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet } from '@/types/models'
import { FAVORITE_TAG } from '@/tools/snippets/snippet-model'

// Own the tag combobox of the details panel. The state lives here, not in the panel, so a
// half-typed tag survives when the panel closes and opens again.
export function useSnippetTags(selected: Snippet | null, allTags: string[]) {
  const updateSnippet = useSnippetsStore((state) => state.update)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const [tagInput, setTagInput] = useState('')
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const tagSuggestions = useMemo(() => {
    if (!selected || !tagInput.trim()) return []
    const query = tagInput.trim().toLowerCase()
    return allTags.filter(
      (tag) => tag.toLowerCase().includes(query) && !selected.tags.includes(tag)
    )
  }, [allTags, selected, tagInput])

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

  return {
    tagInput,
    setTagInput,
    suggestionIndex,
    setSuggestionIndex,
    tagInputRef,
    tagSuggestions,
    handleAddTag,
    handleRemoveTag,
  }
}

export type SnippetTags = ReturnType<typeof useSnippetTags>
