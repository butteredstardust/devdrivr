import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { openFileDialog } from '@/lib/file-io'
import { importApiSpec } from '@/lib/api-import'
import type { ApiImportFormat, ApiImportResult } from '@/types/models'

type Props = {
  onImport: (data: ApiImportResult) => Promise<void>
  onClose: () => void
}

const FORMAT_LABELS: Record<ApiImportFormat, string> = {
  postman: 'Postman Collection',
  openapi: 'OpenAPI',
  asyncapi: 'AsyncAPI',
  protobuf: 'Protobuf',
  graphql: 'GraphQL',
  'cockpit-json': 'Cockpit JSON',
}

export function ImportSpecModal({ onImport, onClose }: Props) {
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState<ApiImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const parseContent = useCallback((nextContent: string, nextFilename?: string) => {
    try {
      const result = importApiSpec({
        content: nextContent,
        ...(nextFilename !== undefined ? { filename: nextFilename } : {}),
      })
      setPreview(result)
      setError(null)
    } catch (err) {
      setPreview(null)
      setError((err as Error).message)
    }
  }, [])

  const handleOpenFile = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      setContent(file.content)
      setFilename(file.filename)
      parseContent(file.content, file.filename)
    } catch (err) {
      setPreview(null)
      setError(`Could not read file: ${(err as Error).message}`)
    }
  }, [parseContent])

  const handlePreview = useCallback(() => {
    parseContent(content, filename)
  }, [content, filename, parseContent])

  const handleImport = useCallback(async () => {
    if (!preview || preview.requests.length === 0) return
    setImporting(true)
    setError(null)
    try {
      await onImport(preview)
      onClose()
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`)
      setImporting(false)
    }
  }, [onClose, onImport, preview])

  return (
    <Dialog
      title="Import API Spec"
      onClose={onClose}
      closeLabel="Close import dialog"
      initialFocusRef={textareaRef}
      className="w-[680px] max-w-[calc(100vw-2rem)]"
      bodyClassName="p-0"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePreview} disabled={!content.trim()}>
            Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void handleImport()
            }}
            disabled={!preview || preview.requests.length === 0 || importing}
          >
            {importing ? 'Importing...' : `Import ${preview?.requests.length ?? 0} Requests`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-[var(--color-text-muted)]">Source</div>
            <div className="text-sm text-[var(--color-text)]">
              {filename ??
                'Paste a Postman, OpenAPI, AsyncAPI, protobuf, GraphQL, or cockpit JSON spec'}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void handleOpenFile()
            }}
          >
            Open File
          </Button>
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            setPreview(null)
            setError(null)
          }}
          placeholder="Paste API specification content here..."
          className="min-h-56 resize-y rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />

        {error && (
          <div className="rounded border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-error)]">
            {error}
          </div>
        )}

        {preview && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-[var(--color-text-muted)]">Detected:</span>
              <span className="font-bold text-[var(--color-accent)]">
                {FORMAT_LABELS[preview.format]}
              </span>
              <span className="text-[var(--color-text-muted)]">from</span>
              <span className="font-bold text-[var(--color-text)]">{preview.sourceTitle}</span>
            </div>
            <div className="text-xs text-[var(--color-text)]">
              {preview.collections.length} collections, {preview.requests.length} requests ready to
              import
            </div>
            {preview.warnings.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded border border-[var(--color-border)] p-2">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                  Warnings
                </div>
                <ul className="flex flex-col gap-1 text-xs text-[var(--color-warning)]">
                  {preview.warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
