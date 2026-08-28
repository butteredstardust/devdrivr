/** The collapsible tree rendering of a parsed JSON document. */
import { useCallback, useState, type ReactNode } from 'react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { toText } from '@/tools/json-tools/json-model'

export function TreeValueButton({
  children,
  className,
  onClick,
  label,
}: {
  children: ReactNode
  className: string
  onClick: () => void
  label: string
}) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- inline click-to-copy token inside the syntax-highlighted tree; it must inherit the caller's value colour and monospace metrics, which every Button variant would override.
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Copy value"
      className={`cursor-pointer rounded hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
    >
      {children}
    </button>
  )
}

export function JsonTree({
  data,
  path,
  defaultExpanded = true,
}: {
  data: unknown
  path: string
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const copy = useCopyToClipboard()

  const copyPath = useCallback(
    () => void copy(path, { success: `Copied path ${path}` }),
    [copy, path]
  )
  const copyValue = useCallback(
    (val: unknown) => void copy(toText(val), { success: 'Copied value' }),
    [copy]
  )

  if (data === null)
    return (
      <TreeValueButton
        className="text-[var(--color-text-muted)]"
        onClick={() => copyValue(null)}
        label="Copy value null"
      >
        null
      </TreeValueButton>
    )
  if (typeof data === 'boolean')
    return (
      <TreeValueButton
        className="text-[var(--color-warning)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${String(data)}`}
      >
        {String(data)}
      </TreeValueButton>
    )
  if (typeof data === 'number')
    return (
      <TreeValueButton
        className="text-[var(--color-accent)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${data}`}
      >
        {data}
      </TreeValueButton>
    )
  if (typeof data === 'string')
    return (
      <TreeValueButton
        className="text-[var(--color-success)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${data}`}
      >
        &quot;{data}&quot;
      </TreeValueButton>
    )

  if (typeof data !== 'object') return <span>{String(data)}</span>

  const isArray = Array.isArray(data)
  const entries = isArray
    ? (data as unknown[]).map((value, i) => [String(i), value] as const)
    : Object.entries(data as Record<string, unknown>)
  const hasChildren = entries.length > 0

  return (
    <div className="ml-4">
      <div className="flex items-center gap-1">
        {/* eslint-disable-next-line no-restricted-syntax -- tree disclosure row: a bare
            ▼/▶/• glyph aligned to the monospace indent grid, not an action button. */}
        <button
          type="button"
          onClick={() => hasChildren && setExpanded(!expanded)}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${path}`}
          disabled={!hasChildren}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '•'}
        </button>
        {/* eslint-disable-next-line no-restricted-syntax -- inline copy-path affordance
            rendered as part of the tree row's monospace text ([n] / {n}), not a control. */}
        <button
          type="button"
          className="text-xs text-[var(--color-text-muted)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          onClick={copyPath}
          aria-label={`Copy path ${path}`}
          title="Copy path"
        >
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </button>
      </div>
      {expanded &&
        entries.map(([key, value]) => (
          <div key={key} className="ml-4">
            {isArray ? (
              <span className="text-[var(--color-text-muted)]">{key}: </span>
            ) : (
              <>
                <span className="text-[var(--color-accent)]">&quot;{key}&quot;</span>
                <span className="text-[var(--color-text-muted)]">: </span>
              </>
            )}
            <JsonTree
              data={value}
              path={isArray ? `${path}[${key}]` : `${path}.${key}`}
              defaultExpanded={defaultExpanded}
            />
          </div>
        ))}
    </div>
  )
}
