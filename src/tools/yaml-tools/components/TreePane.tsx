import { useCallback, useState, type ReactNode } from 'react'
import { ArrowsInLineVerticalIcon, ArrowsOutLineVerticalIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { InspectorTree } from '@/components/shared/InspectorTree'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { type CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { LARGE_DOCUMENT_KEYS, toLabel, toText } from '@/tools/yaml-tools/yaml-helpers'

export function TreePane({
  documents,
  keyCount,
  highlightedPath,
}: {
  documents: unknown[]
  keyCount: number
  highlightedPath?: string
}) {
  // A 5000-key document rendered fully expanded janks the pane on open, so the
  // default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = keyCount <= LARGE_DOCUMENT_KEYS
  const expanded = expandAll ?? autoExpanded

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  return (
    <>
      <PaneHeader
        title="Tree"
        actions={
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(true)}
              className="gap-1"
              title="Expand every node"
            >
              <ArrowsOutLineVerticalIcon size={12} aria-hidden="true" />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(false)}
              className="gap-1"
              title="Collapse every node"
            >
              <ArrowsInLineVerticalIcon size={12} aria-hidden="true" />
              Collapse all
            </Button>
            {expandAll === null && !autoExpanded && (
              <span className="text-2xs text-[var(--color-text-muted)]">
                Collapsed — {keyCount} keys
              </span>
            )}
          </>
        }
      />
      <div
        className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs"
        // Remount when the default changes. Otherwise, crossing the threshold preserves an
        // expansion state that conflicts with the new default.
        key={`${treeKey}-${String(expanded)}`}
      >
        {documents.map((document, i) => (
          <div key={i}>
            {documents.length > 1 && (
              <SectionLabel as="div" className="mt-2">
                Document {i + 1}
              </SectionLabel>
            )}
            <InspectorTree
              data={document}
              rootPath={documents.length > 1 ? `$[${i}]` : '$'}
              defaultExpanded={expanded}
              {...(highlightedPath === undefined ? {} : { highlightedPath })}
            />
          </div>
        ))}
      </div>
    </>
  )
}

function TreeValueButton({
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

export function YamlTree({
  data,
  path,
  defaultExpanded,
  onCopy,
}: {
  data: unknown
  path: string
  defaultExpanded: boolean
  onCopy: CopyToClipboard
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const copyValue = useCallback(
    (value: unknown) => void onCopy(toText(value), { success: 'Copied value' }),
    [onCopy]
  )
  const copyPath = useCallback(
    () => void onCopy(path, { success: `Copied path ${path}` }),
    [onCopy, path]
  )

  if (data === null || data === undefined)
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
        label={`Copy value ${toLabel(data)}`}
      >
        {String(data)}
      </TreeValueButton>
    )
  if (typeof data === 'number')
    return (
      <TreeValueButton
        className="text-[var(--color-accent)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${toLabel(data)}`}
      >
        {data}
      </TreeValueButton>
    )
  if (typeof data === 'string')
    return (
      <TreeValueButton
        className="text-[var(--color-success)]"
        onClick={() => copyValue(data)}
        label={`Copy value ${toLabel(data)}`}
      >
        {/* Quoted like the JSON tree: without it a quoted "30" and the number
            30 are the same row, which is exactly the YAML trap worth seeing. */}
        &quot;{data}&quot;
      </TreeValueButton>
    )
  if (data instanceof Date)
    return (
      <TreeValueButton
        className="text-[var(--color-info)]"
        onClick={() => copyValue(data.toISOString())}
        label={`Copy value ${toLabel(data.toISOString())}`}
      >
        {data.toISOString()}
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
          className="text-[var(--color-text-muted)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
                <span className="text-[var(--color-accent)]">{key}</span>
                <span className="text-[var(--color-text-muted)]">: </span>
              </>
            )}
            <YamlTree
              data={value}
              path={isArray ? `${path}[${key}]` : `${path}.${key}`}
              defaultExpanded={defaultExpanded}
              onCopy={onCopy}
            />
          </div>
        ))}
    </div>
  )
}
