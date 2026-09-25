import { useEffect, useState } from 'react'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { PaneHeader } from '@/components/shared/PaneHeader'
import type { WorkerRpc } from '@/hooks/useWorker'
import { sendToTool } from '@/lib/tool-handoff'
import type { XmlWorker } from '@/workers/xml.worker'

export function JsonPane({
  input,
  worker,
  monacoTheme,
  monacoOptions,
  onApply,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  onApply: (json: string, rootName: string) => void
}) {
  const [json, setJson] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [rootName, setRootName] = useState('root')
  const [failure, setFailure] = useState<string | null>(null)

  // Recompute conversion as input changes so the open pane always reflects valid source text.
  useEffect(() => {
    if (!worker || !input.trim()) {
      setJson('')
      setFailure(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .toJson(input)
        .then((result) => {
          if (cancelled) return
          if (result.valid && result.json) {
            setJson(result.json)
            setDraft(null)
            setRootName(result.rootName ?? 'root')
            setFailure(null)
          } else {
            setJson('')
            setFailure(result.error ?? 'Conversion failed')
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setJson('')
          setFailure(e instanceof Error ? e.message : 'Conversion failed')
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  const value = draft ?? json

  return (
    <>
      <PaneHeader
        title="JSON"
        actions={
          value ? (
            <div className="flex items-center gap-2">
              <CopyButton text={value} label="Copy JSON" />
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  sendToTool(
                    'json-tools',
                    { input: value, view: 'source' },
                    { documentKeys: ['input'] }
                  )
                }
                title="Open this JSON in JSON Tools"
              >
                JSON Tools
              </Button>
              {draft !== null && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onApply(draft, rootName)
                    setDraft(null)
                  }}
                  title="Replace the XML document with this JSON"
                >
                  Apply to XML
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {failure ? (
          <EmptyState
            size="sm"
            icon={WarningCircleIcon}
            title="Cannot convert"
            description={failure}
          />
        ) : json ? (
          <Editor
            theme={monacoTheme}
            language="json"
            value={value}
            onChange={(next) => setDraft(next ?? '')}
            options={monacoOptions}
          />
        ) : (
          <EmptyState size="sm" title="Converting…" description="Reading the document." />
        )}
      </div>
    </>
  )
}
