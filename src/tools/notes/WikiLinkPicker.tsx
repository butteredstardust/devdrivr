import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { LinkIcon } from '@phosphor-icons/react'
import { Input } from '@/components/shared/Input'
import type { WikiResource } from '@/lib/wiki-links'

type WikiLinkPickerProps = {
  query: string
  resources: WikiResource[]
  onQueryChange: (query: string) => void
  onSelect: (resource: WikiResource) => void
  onClose: () => void
}

function resourceTypeLabel(resource: WikiResource): string {
  if (resource.kind === 'api-request') return 'API request'
  return resource.kind === 'note' ? 'Note' : 'Snippet'
}

export function WikiLinkPicker({
  query,
  resources,
  onQueryChange,
  onSelect,
  onClose,
}: WikiLinkPickerProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return resources
      .filter((resource) => {
        if (!normalized) return true
        return `${resource.title} ${resource.label} ${resource.location} ${resourceTypeLabel(resource)}`
          .toLocaleLowerCase()
          .includes(normalized)
      })
      .slice(0, 8)
  }, [query, resources])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => setActiveIndex(0), [query])

  const active = suggestions[activeIndex]

  return (
    <div className="absolute left-3 top-3 z-30 w-[min(24rem,calc(100%-1.5rem))] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2 shadow-lg shadow-[var(--color-shadow)]">
      <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-[var(--color-text-muted)]">
        <LinkIcon size={13} aria-hidden="true" />
        Link a resource
      </div>
      <Input
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={active ? `${listboxId}-${active.kind}-${active.id}` : undefined}
        aria-label="Find a note, snippet, or API request"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && active) {
            event.preventDefault()
            onSelect(active)
          }
        }}
        placeholder="Search resources"
        className="w-full"
      />
      <div id={listboxId} role="listbox" aria-label="Wiki link suggestions" className="mt-1">
        {suggestions.map((resource, index) => (
          <button
            key={`${resource.kind}:${resource.id}`}
            id={`${listboxId}-${resource.kind}-${resource.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(resource)
            }}
            className={`block w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
              index === activeIndex
                ? 'bg-[var(--color-accent-dim)]'
                : 'hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="block truncate text-xs text-[var(--color-text)]">
              {resource.label}
            </span>
            <span className="block truncate text-2xs text-[var(--color-text-muted)]">
              {resourceTypeLabel(resource)}
              {resource.location ? ` · ${resource.location}` : ''}
            </span>
          </button>
        ))}
        {suggestions.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">
            No matching live resources
          </p>
        )}
      </div>
      <p className="mt-1 text-2xs text-[var(--color-text-muted)]">
        Arrow keys choose, Enter inserts, Escape keeps the typed text.
      </p>
    </div>
  )
}
