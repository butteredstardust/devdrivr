import { useId, useMemo } from 'react'
import { TagIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { Input, Select } from '@/components/shared/Input'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { folderPath } from '@/lib/resource-folders'
import { useSnippetsStore } from '@/stores/snippets.store'
import type { ResourceFolder, Snippet, SnippetFragment } from '@/types/models'
import type { SnippetTags } from '@/tools/snippets/hooks/useSnippetTags'
import { formatTimestamp, visibleTags } from '@/tools/snippets/snippet-model'

type SnippetDetailsPanelProps = {
  selected: Snippet
  activeFragment: SnippetFragment | null
  snippetFolders: ResourceFolder[]
  tags: SnippetTags
}

export function SnippetDetailsPanel({
  selected,
  activeFragment,
  snippetFolders,
  tags,
}: SnippetDetailsPanelProps) {
  const tagSuggestionsId = useId()
  const updateSnippet = useSnippetsStore((state) => state.update)
  const {
    tagInput,
    setTagInput,
    suggestionIndex,
    setSuggestionIndex,
    tagInputRef,
    tagSuggestions,
    handleAddTag,
    handleRemoveTag,
  } = tags

  const editorStats = useMemo(() => {
    if (!activeFragment) return null
    return {
      lines: activeFragment.content.split('\n').length,
      characters: activeFragment.content.length,
      bytes: new TextEncoder().encode(activeFragment.content).length,
    }
  }, [activeFragment])

  return (
    <aside
      aria-label="Snippet details"
      className="absolute inset-y-0 right-0 z-10 w-60 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg max-[1000px]:w-52"
    >
      <h2 className="mb-4 text-xs font-semibold text-[var(--color-text)]">Details</h2>

      <Field label="Folder">
        <Select
          value={selected.folderId ?? 'snippets-inbox'}
          onChange={(event) => {
            const folder = snippetFolders.find((candidate) => candidate.id === event.target.value)
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
              suggestionIndex >= 0 ? `${tagSuggestionsId}-option-${suggestionIndex}` : undefined
            }
            value={tagInput}
            onChange={(event) => {
              setTagInput(event.target.value)
              setSuggestionIndex(-1)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSuggestionIndex((current) => Math.min(current + 1, tagSuggestions.length - 1))
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
          <dd className="mt-0.5 text-[var(--color-text)]">{formatTimestamp(selected.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-text-muted)]">Last edited</dt>
          <dd className="mt-0.5 text-[var(--color-text)]">{formatTimestamp(selected.updatedAt)}</dd>
        </div>
      </dl>
    </aside>
  )
}
