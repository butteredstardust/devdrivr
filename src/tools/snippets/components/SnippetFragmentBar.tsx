import { CaretLeftIcon, CaretRightIcon, PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { TextArea } from '@/components/shared/TextArea'
import { useSnippetsStore } from '@/stores/snippets.store'
import type { Snippet, SnippetFragment } from '@/types/models'

type SnippetFragmentBarProps = {
  selected: Snippet
  fragments: SnippetFragment[]
  activeFragment: SnippetFragment
  // Prefix for the tab ids. The editor tab panel carries this id itself.
  fragmentEditorId: string
  descriptionOpen: boolean
  onToggleDescription: () => void
  onSelectFragment: (fragmentId: string) => void
  onRenameFragment: (name: string) => void
  onAddFragment: () => void
  onMoveFragment: (direction: -1 | 1) => void
  onDuplicateFragment: () => void
  onRequestDeleteFragment: (fragment: SnippetFragment) => void
}

export function SnippetFragmentBar({
  selected,
  fragments,
  activeFragment,
  fragmentEditorId,
  descriptionOpen,
  onToggleDescription,
  onSelectFragment,
  onRenameFragment,
  onAddFragment,
  onMoveFragment,
  onDuplicateFragment,
  onRequestDeleteFragment,
}: SnippetFragmentBarProps) {
  const updateSnippet = useSnippetsStore((state) => state.update)

  return (
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
              onClick={() => onSelectFragment(fragment.id)}
              onKeyDown={(event) => {
                const index = fragments.findIndex((candidate) => candidate.id === fragment.id)
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
                onSelectFragment(next.id)
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
          onClick={onAddFragment}
          aria-label="Add fragment"
        >
          <PlusIcon size={12} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="icon"
          size="xs"
          onClick={() => onMoveFragment(-1)}
          disabled={activeFragment.sortOrder === 0}
          aria-label="Move fragment left"
        >
          <CaretLeftIcon size={12} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="icon"
          size="xs"
          onClick={() => onMoveFragment(1)}
          disabled={activeFragment.sortOrder === fragments.length - 1}
          aria-label="Move fragment right"
        >
          <CaretRightIcon size={12} aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onDuplicateFragment}>
          Duplicate fragment
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={fragments.length <= 1}
          onClick={() => onRequestDeleteFragment(activeFragment)}
        >
          Delete fragment
        </Button>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-1.5">
        <Input
          value={activeFragment.name}
          onChange={(event) => onRenameFragment(event.target.value)}
          aria-label="Fragment name"
          className="max-w-64"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={descriptionOpen}
          onClick={onToggleDescription}
        >
          {selected.description ? 'Description' : 'Add description'}
        </Button>
        <span className="text-2xs text-[var(--color-text-muted)]">
          {fragments.length} fragment{fragments.length === 1 ? '' : 's'}
        </span>
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-[var(--duration-panel)] ease-[var(--ease-in-out)] ${
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
  )
}
