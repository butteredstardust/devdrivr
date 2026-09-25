import { WarningCircleIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components/shared/EmptyState'
import { queryJsonPath } from '@/lib/json-path'
import { JsonPane } from '@/tools/yaml-tools/components/JsonPane'
import { TablePane } from '@/tools/yaml-tools/components/TablePane'
import { TreePane } from '@/tools/yaml-tools/components/TreePane'
import type { YamlParse, YamlView } from '@/tools/yaml-tools/yaml-helpers'

// ---------------------------------------------------------------------------
// Inspector (tree / json)
// ---------------------------------------------------------------------------

const PANE_LABELS: Record<Exclude<YamlView, 'source'>, string> = {
  tree: 'Tree view',
  table: 'Table view',
  json: 'JSON view',
}

export function InspectorPane({
  view,
  parsed,
  keyCount,
  monacoTheme,
  monacoOptions,
  jsonDraft,
  onJsonDraftChange,
  onApplyJson,
  queryResult,
  query,
}: {
  view: Exclude<YamlView, 'source'>
  parsed: YamlParse
  keyCount: number
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  jsonDraft: string | null
  onJsonDraftChange: (draft: string | null) => void
  onApplyJson: (json: string) => void
  queryResult: ReturnType<typeof queryJsonPath> | null
  query: string
}) {
  return (
    <section
      aria-label={PANE_LABELS[view]}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-[var(--color-border)] max-[900px]:border-l-0 max-[900px]:border-t"
    >
      {/* Keep JSON editable because this pane also accepts JSON-to-YAML input. */}
      {view === 'json' ? (
        <JsonPane
          parsed={parsed}
          monacoTheme={monacoTheme}
          monacoOptions={monacoOptions}
          draft={jsonDraft}
          onDraftChange={onJsonDraftChange}
          onApply={onApplyJson}
        />
      ) : parsed.status === 'empty' ? (
        <EmptyState size="sm" title="Nothing to inspect" description="Add a document first." />
      ) : parsed.status === 'invalid' ? (
        // Show parse errors explicitly so users do not mistake invalid input for missing data.
        <EmptyState
          size="sm"
          icon={WarningCircleIcon}
          title="Invalid YAML"
          description={
            parsed.location
              ? `${parsed.message} — line ${parsed.location.line}, column ${parsed.location.column}`
              : parsed.message
          }
        />
      ) : view === 'table' ? (
        <TablePane documents={parsed.documents} />
      ) : (
        <TreePane
          documents={parsed.documents}
          keyCount={keyCount}
          {...(queryResult?.found ? { highlightedPath: query } : {})}
        />
      )}
    </section>
  )
}
