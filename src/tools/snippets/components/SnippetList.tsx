import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { FolderOpenIcon, ScissorsIcon, StarIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import type { Snippet } from '@/types/models'
import {
  contentPreview,
  isFavorite,
  LANG_EXTENSIONS,
  LANG_TONE_CLASSES,
  LANG_TONES,
  relativeTime,
  visibleTags,
  type FuseMatchEntry,
} from '@/tools/snippets/snippet-model'

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

type SnippetListProps = {
  filtered: Snippet[]
  totalCount: number
  selectedId: string | null
  matchMap: Map<string, ReadonlyArray<FuseMatchEntry>>
  onSelect: (snippetId: string) => void
  onClearFilters: () => void
}

export function SnippetList({
  filtered,
  totalCount,
  selectedId,
  matchMap,
  onSelect,
  onClearFilters,
}: SnippetListProps) {
  const snippetOptionsId = useId()

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
    onSelect(next.id)
    requestAnimationFrame(() =>
      document.getElementById(`${snippetOptionsId}-option-${next.id}`)?.focus()
    )
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      role="listbox"
      aria-label="Snippets"
    >
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
            tabIndex={isSelected || (!selectedId && filtered[0]?.id === snippet.id) ? 0 : -1}
            onClick={() => onSelect(snippet.id)}
            onKeyDown={(event) => handleListKeyDown(event, snippet.id)}
            className={`group flex w-full justify-start rounded-none border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)] ${
              isSelected ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <div className="flex w-full min-w-0 items-start gap-2">
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
                <span className="mt-1 line-clamp-2 break-all text-2xs text-[var(--color-text-muted)]">
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
          title={totalCount === 0 ? 'No snippets yet' : 'No matches'}
          description={
            totalCount === 0
              ? 'Save reusable code and commands here.'
              : 'Try a different search or clear the filters.'
          }
          action={
            totalCount === 0 ? null : (
              <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )
          }
        />
      )}
    </div>
  )
}
