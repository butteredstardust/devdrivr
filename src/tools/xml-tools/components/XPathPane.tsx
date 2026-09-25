import { useEffect, useState } from 'react'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/shared/Input'
import { PaneHeader } from '@/components/shared/PaneHeader'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { WorkerRpc } from '@/hooks/useWorker'
import type { XmlWorker } from '@/workers/xml.worker'

export function XPathPane({
  input,
  worker,
  xpath,
  onXPathChange,
  onCopy,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  xpath: string
  onXPathChange: (next: string) => void
  onCopy: CopyToClipboard
}) {
  const [matches, setMatches] = useState<string[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [predicatesIgnored, setPredicatesIgnored] = useState(false)
  const [queried, setQueried] = useState(false)

  // Queries run as you type: pressing a Query button to re-check a one-character
  // change was the slowest part of using this pane.
  useEffect(() => {
    if (!worker || !input.trim() || !xpath.trim()) {
      setMatches([])
      setFailure(null)
      setPredicatesIgnored(false)
      setQueried(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .queryXPath(input, xpath)
        .then((result) => {
          if (cancelled) return
          setMatches(result.matches)
          setFailure(result.error ?? null)
          setPredicatesIgnored(result.predicatesIgnored ?? false)
          setQueried(true)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setMatches([])
          setFailure(e instanceof Error ? e.message : 'XPath query failed')
          setQueried(true)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input, xpath])

  return (
    <>
      <PaneHeader
        title="XPath"
        actions={
          <>
            <output className="text-2xs text-[var(--color-text-muted)]">
              {queried && !failure
                ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
                : ''}
            </output>
          </>
        }
      />
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <Input
          aria-label="XPath expression"
          value={xpath}
          onChange={(e) => onXPathChange(e.target.value)}
          placeholder="/catalog/book or //title"
          monospace
          className="w-full"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        {/* Above the results, not inside them: a predicate is just as ignored
            when the path happens to match nothing. */}
        {predicatesIgnored && !failure && (
          <Alert variant="warning" className="text-2xs">
            Predicates are ignored — every node matching the path is listed.
          </Alert>
        )}
        {failure ? (
          // Present expression failures as errors, not matches.
          <Alert variant="error" className="text-xs">
            {failure}
          </Alert>
        ) : !xpath.trim() ? (
          <EmptyState
            size="sm"
            title="Query the document"
            description="Child steps (/catalog/book) and descendant steps (//title) are supported."
          />
        ) : !queried ? (
          <EmptyState size="sm" title="Searching…" description="Running the expression." />
        ) : matches.length === 0 ? (
          <EmptyState size="sm" title="No matches" description="Nothing in the document matches." />
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((match, i) => (
              <div key={i} className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text)]">
                  {match}
                </pre>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void onCopy(match, { success: 'Copied match' })}
                  aria-label={`Copy match ${i + 1}`}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
