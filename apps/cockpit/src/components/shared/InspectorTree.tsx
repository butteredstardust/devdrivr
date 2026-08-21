import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDownIcon, CaretRightIcon, DotOutlineIcon } from '@phosphor-icons/react'
import { Input } from '@/components/shared/Input'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type Entry = readonly [string, unknown]

export function InspectorDisclosure({
  expanded,
  hasChildren,
  label,
  onToggle,
  className = '',
}: {
  expanded: boolean
  hasChildren: boolean
  label: string
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => hasChildren && onToggle()}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      disabled={!hasChildren}
      className={`text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
    >
      {hasChildren ? (
        expanded ? (
          <CaretDownIcon size={12} aria-hidden="true" />
        ) : (
          <CaretRightIcon size={12} aria-hidden="true" />
        )
      ) : (
        <DotOutlineIcon size={12} aria-hidden="true" />
      )}
    </button>
  )
}

function entriesOf(value: unknown): Entry[] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item] as const)
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    return Object.entries(value)
  }
  return []
}

function valueText(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return `"${value}"`
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') return JSON.stringify(value, null, 2) ?? String(value)
  return String(value)
}

function copyValueText(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value, null, 2) ?? String(value)
  return String(value)
}

function containsFilter(key: string, value: unknown, filter: string): boolean {
  if (!filter) return true
  if (key.toLocaleLowerCase().includes(filter)) return true
  return entriesOf(value).some(([childKey, child]) => containsFilter(childKey, child, filter))
}

function TreeNode({
  value,
  path,
  label,
  defaultExpanded,
  filter,
  highlightedPath,
  pathForChild,
}: {
  value: unknown
  path: string
  label?: string
  defaultExpanded: boolean
  filter: string
  highlightedPath?: string
  pathForChild: (parent: string, key: string, array: boolean) => string
}) {
  const entries = entriesOf(value)
  const hasChildren = entries.length > 0
  const shouldReveal = !!filter || (!!highlightedPath && highlightedPath.startsWith(path))
  const [expanded, setExpanded] = useState(defaultExpanded || shouldReveal)
  const rowRef = useRef<HTMLDivElement>(null)
  const copy = useCopyToClipboard()
  const isArray = Array.isArray(value)
  const highlighted = highlightedPath === path

  useEffect(() => {
    if (shouldReveal) setExpanded(true)
  }, [shouldReveal])

  useEffect(() => {
    if (!highlighted) return
    if (typeof rowRef.current?.scrollIntoView === 'function') {
      rowRef.current.scrollIntoView({ block: 'center' })
    }
  }, [highlighted])

  const copyPath = useCallback(() => {
    void copy(path, { success: `Copied path ${path}` })
  }, [copy, path])

  if (!hasChildren) {
    const text = valueText(value)
    const color =
      typeof value === 'string' || value instanceof Date
        ? 'text-[var(--color-success)]'
        : typeof value === 'number'
          ? 'text-[var(--color-accent)]'
          : typeof value === 'boolean'
            ? 'text-[var(--color-warning)]'
            : 'text-[var(--color-text-muted)]'
    return (
      <div
        ref={rowRef}
        className={`${label ? 'ml-4' : ''} ${highlighted ? 'rounded bg-[var(--color-accent-dim)]' : ''}`}
      >
        {label && <span className="text-[var(--color-accent)]">{label}: </span>}
        <button
          type="button"
          onClick={() => void copy(copyValueText(value), { success: 'Copied value' })}
          title="Copy value"
          aria-label={`Copy value ${text}`}
          className={`rounded hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${color}`}
        >
          {text}
        </button>
      </div>
    )
  }

  return (
    <div className="ml-4">
      <div
        ref={rowRef}
        className={`flex items-center gap-1 rounded ${highlighted ? 'bg-[var(--color-accent-dim)]' : ''}`}
      >
        <InspectorDisclosure
          expanded={expanded}
          hasChildren
          label={path}
          onToggle={() => setExpanded((current) => !current)}
        />
        {label && <span className="text-[var(--color-accent)]">{label}: </span>}
        <button
          type="button"
          onClick={copyPath}
          aria-label={`Copy path ${path}`}
          title="Copy path"
          className="text-[var(--color-text-muted)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </button>
      </div>
      {expanded &&
        entries.map(([key, child]) =>
          containsFilter(key, child, filter) ? (
            <TreeNode
              key={key}
              value={child}
              label={isArray ? key : key}
              path={pathForChild(path, key, isArray)}
              defaultExpanded={defaultExpanded}
              filter={filter}
              {...(highlightedPath === undefined ? {} : { highlightedPath })}
              pathForChild={pathForChild}
            />
          ) : null
        )}
    </div>
  )
}

export function InspectorTree({
  data,
  rootPath = '$',
  defaultExpanded = true,
  filterable = false,
  highlightedPath,
  pathForChild = (parent, key, array) => (array ? `${parent}[${key}]` : `${parent}.${key}`),
}: {
  data: unknown
  rootPath?: string
  defaultExpanded?: boolean
  filterable?: boolean
  highlightedPath?: string
  pathForChild?: (parent: string, key: string, array: boolean) => string
}) {
  const [filter, setFilter] = useState('')
  const normalizedFilter = useMemo(() => filter.trim().toLocaleLowerCase(), [filter])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {filterable && (
        <div className="border-b border-[var(--color-border)] p-2">
          <Input
            aria-label="Filter tree keys"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter keys…"
            className="w-full"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
        {containsFilter('', data, normalizedFilter) ? (
          <TreeNode
            value={data}
            path={rootPath}
            defaultExpanded={defaultExpanded}
            filter={normalizedFilter}
            {...(highlightedPath === undefined ? {} : { highlightedPath })}
            pathForChild={pathForChild}
          />
        ) : (
          <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
            <DotOutlineIcon size={14} aria-hidden="true" /> No matching keys
          </div>
        )}
      </div>
    </div>
  )
}
