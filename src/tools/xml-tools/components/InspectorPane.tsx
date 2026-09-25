import { WarningCircleIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components/shared/EmptyState'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { WorkerRpc } from '@/hooks/useWorker'
import { JsonPane } from '@/tools/xml-tools/components/JsonPane'
import { TreePane } from '@/tools/xml-tools/components/TreePane'
import { XPathPane } from '@/tools/xml-tools/components/XPathPane'
import { describeIssue, type XmlView } from '@/tools/xml-tools/xml-tools-helpers'
import type { XmlIssue } from '@/workers/xml.api'
import type { XmlWorker } from '@/workers/xml.worker'

const PANE_LABELS: Record<Exclude<XmlView, 'source'>, string> = {
  tree: 'Tree view',
  json: 'JSON view',
  xpath: 'XPath results',
}

export function InspectorPane({
  view,
  input,
  worker,
  isValid,
  pending,
  elementCount,
  blockingIssue,
  xpath,
  onXPathChange,
  monacoTheme,
  monacoOptions,
  onCopy,
  onApplyJson,
}: {
  view: Exclude<XmlView, 'source'>
  input: string
  worker: WorkerRpc<XmlWorker> | null
  isValid: boolean
  pending: boolean
  elementCount: number
  blockingIssue: XmlIssue | undefined
  xpath: string
  onXPathChange: (next: string) => void
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  onCopy: CopyToClipboard
  onApplyJson: (json: string, rootName: string) => void
}) {
  const hasInput = input.trim().length > 0

  return (
    <section
      aria-label={PANE_LABELS[view]}
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--color-border)] max-[900px]:max-h-[45%] max-[900px]:border-l-0 max-[900px]:border-t"
    >
      {!hasInput ? (
        <EmptyState
          size="sm"
          title="Nothing to inspect"
          description="Type or open XML in the source pane."
        />
      ) : pending ? (
        // The first parse is debounced; calling a document invalid before it has
        // been read once is just wrong.
        <EmptyState size="sm" title="Checking…" description="Reading the document." />
      ) : !isValid ? (
        <EmptyState
          size="sm"
          icon={WarningCircleIcon}
          title="Invalid XML"
          description={
            blockingIssue ? describeIssue(blockingIssue) : 'The document does not parse.'
          }
        />
      ) : view === 'tree' ? (
        <TreePane input={input} worker={worker} elementCount={elementCount} onCopy={onCopy} />
      ) : view === 'json' ? (
        <JsonPane
          input={input}
          worker={worker}
          monacoTheme={monacoTheme}
          monacoOptions={monacoOptions}
          onApply={onApplyJson}
        />
      ) : (
        <XPathPane
          input={input}
          worker={worker}
          xpath={xpath}
          onXPathChange={onXPathChange}
          onCopy={onCopy}
        />
      )}
    </section>
  )
}
