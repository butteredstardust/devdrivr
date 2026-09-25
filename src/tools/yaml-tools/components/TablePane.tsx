import { EmptyState } from '@/components/shared/EmptyState'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { JsonTable, isTabularJsonArray } from '@/tools/json-tools/JsonTools'

export function TablePane({ documents }: { documents: unknown[] }) {
  const copy = useCopyToClipboard()
  const rows: Record<string, unknown>[] | null =
    documents.length === 1 && isTabularJsonArray(documents[0])
      ? documents[0]
      : documents.length > 1 && documents.every(isTabularJsonArray)
        ? documents.flatMap((document) => document)
        : null
  if (!rows) {
    return (
      <EmptyState
        size="sm"
        title="No record table"
        description="Use Table view with YAML objects or a stream of object arrays."
      />
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <JsonTable data={rows} onCopy={copy} />
    </div>
  )
}
