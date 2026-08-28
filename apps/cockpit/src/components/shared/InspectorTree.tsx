import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretDownIcon, CaretRightIcon, DotOutlineIcon } from '@phosphor-icons/react'
import { Input } from '@/components/shared/Input'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type Entry = readonly [string, unknown]

/**
 * Inspector input is arbitrary parsed data — API responses, decoded tokens, worker output — so it
 * can be cyclic or nested far past anything readable. Rendering and filtering both stop here and
 * show a sentinel instead of recursing until the stack gives out.
 */
const MAX_INSPECTOR_DEPTH = 100

/** `JSON.stringify` that survives cycles, used for the value preview and the copy payload. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return (
      JSON.stringify(
        value,
        (_key, item: unknown) => {
          if (typeof item === 'object' && item !== null) {
            if (seen.has(item)) return '[Circular]'
            seen.add(item)
          }
          return item
        },
        2
      ) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

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
  if (typeof value === 'object') return safeStringify(value)
  return String(value)
}

function copyValueText(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return safeStringify(value)
  return String(value)
}

function containsFilter(
  key: string,
  value: unknown,
  filter: string,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): boolean {
  if (!filter) return true
  if (key.toLocaleLowerCase().includes(filter)) return true
  if (depth >= MAX_INSPECTOR_DEPTH) return false
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return false
    seen.add(value)
  }
  return entriesOf(value).some(([childKey, child]) =>
    containsFilter(childKey, child, filter, depth + 1, seen)
  )
}

function TreeNode({
  value,
  path,
  label,
  defaultExpanded,
  filter,
  highlightedPath,
  pathForChild,
  depth = 0,
  ancestors,
}: {
  value: unknown
  path: string
  label?: string
  defaultExpanded: boolean
  filter: string
  highlightedPath?: string
  pathForChild: (parent: string, key: string, array: boolean) => string
  depth?: number
  ancestors?: ReadonlySet<object>
}) {
  // A value that is already on its own path would expand forever; stop and say so.
  const circular = typeof value === 'object' && value !== null && !!ancestors?.has(value as object)
  const tooDeep = depth >= MAX_INSPECTOR_DEPTH
  const entries = circular || tooDeep ? [] : entriesOf(value)
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
    const text = circular ? '[Circular]' : tooDeep ? '[Too deeply nested]' : valueText(value)
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

  const childAncestors = new Set(ancestors ?? [])
  if (typeof value === 'object' && value !== null) childAncestors.add(value as object)

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
              depth={depth + 1}
              ancestors={childAncestors}
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
