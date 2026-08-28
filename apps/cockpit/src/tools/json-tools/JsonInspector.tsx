/** The pane beside the source editor: tree or table, with the controls that switch between them. */
import { useState } from 'react'
import {
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { InspectorTree } from '@/components/shared/InspectorTree'
import {
  type JsonView,
  LARGE_DOCUMENT_KEYS,
  LARGE_TABLE_KEYS,
  type ParseResult,
  isTabularJsonArray,
} from '@/tools/json-tools/json-model'
import { JsonTable, NestedJsonValue, tableSummary } from '@/tools/json-tools/JsonTable'

// ---------------------------------------------------------------------------
// Inspector (tree / table)
// ---------------------------------------------------------------------------

export function InspectorPane({
  view,
  parsed,
  keyCount,
  data,
  onCopy,
  highlightedPath,
}: {
  view: Exclude<JsonView, 'source'>
  parsed: ParseResult
  keyCount: number
  data: unknown
  onCopy: CopyToClipboard
  highlightedPath?: string
}) {
  // A 5000-key document rendered fully expanded janks the pane on open, so the
  // default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = keyCount <= LARGE_DOCUMENT_KEYS
  const expanded = expandAll ?? autoExpanded

  // Deliberately not reset when the document changes: the key count moves on every
  // keystroke, so re-asking on each edit would put the prompt back in the way of
  // someone who has already said they want to see this document.
  const [tableConfirmed, setTableConfirmed] = useState(false)
  const tableTooLarge = keyCount > LARGE_TABLE_KEYS && !tableConfirmed

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  const tabular = isTabularJsonArray(data)

  return (
    <section
      aria-label={view === 'tree' ? 'Tree view' : 'Table view'}
      /* SplitPane owns the divider and the stacked border, so the pane itself carries neither. */
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <PaneHeader
        title={view === 'tree' ? 'Tree' : 'Table'}
        actions={
          <>
            {view === 'tree' && parsed.status === 'valid' && (
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
            )}
            {view === 'table' && parsed.status === 'valid' && tableSummary(data) && (
              <span className="text-2xs text-[var(--color-text-muted)]">{tableSummary(data)}</span>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {parsed.status === 'empty' && (
          <EmptyState
            size="sm"
            title="Nothing to inspect"
            description="Type or open JSON in the source pane."
          />
        )}
        {parsed.status === 'invalid' && (
          <EmptyState
            size="sm"
            icon={WarningCircleIcon}
            title="Invalid JSON"
            description={parsed.message}
          />
        )}
        {parsed.status === 'valid' &&
          (view === 'tree' ? (
            <InspectorTree
              key={treeKey}
              data={data}
              defaultExpanded={expanded}
              filterable
              {...(highlightedPath === undefined ? {} : { highlightedPath })}
            />
          ) : tableTooLarge ? (
            // The tree can open collapsed; a table cannot, so this is the equivalent
            // brake — every key would become a DOM node the moment the view opens.
            <EmptyState
              size="sm"
              icon={WarningCircleIcon}
              title="Large document"
              description={`${keyCount} keys will all render at once. Tree view opens this instantly.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setTableConfirmed(true)}>
                  Render anyway
                </Button>
              }
            />
          ) : tabular ? (
            <JsonTable data={data} onCopy={onCopy} />
          ) : (
            // Anything that is not a list of records still has a table shape:
            // objects become key/value rows and arrays become indexed rows,
            // nested the whole way down.
            <div className="p-3">
              <NestedJsonValue value={data} />
            </div>
          ))}
      </div>
    </section>
  )
}
