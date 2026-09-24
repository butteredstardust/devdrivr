import type { Dispatch, SetStateAction } from 'react'
import type { EditorProps, OnMount } from '@monaco-editor/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Spinner } from '@/components/shared/Spinner'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TabBar } from '@/components/shared/TabBar'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { formatBytes } from '@/lib/format'
import { formatShortcut } from '@/lib/shortcut-label'
import { RESPONSE_TABS, type ResponseData } from '@/tools/api-client/request-model'
import { DownloadSimpleIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'

type ResponsePanelProps = {
  id: string
  response: ResponseData | null
  error: string | null
  loading: boolean
  responseTab: string
  setResponseTab: Dispatch<SetStateAction<string>>
  imagePreviewUrl: string | null
  prettyBody: string
  responseLanguage: string
  monacoTheme: string
  monacoOptions: NonNullable<EditorProps['options']>
  handleResponseEditorMount: OnMount
  handleSaveResponse: () => Promise<void>
}

export function ResponsePanel({
  id,
  response,
  error,
  loading,
  responseTab,
  setResponseTab,
  imagePreviewUrl,
  prettyBody,
  responseLanguage,
  monacoTheme,
  monacoOptions,
  handleResponseEditorMount,
  handleSaveResponse,
}: ResponsePanelProps) {
  return (
    // ── Response panel ──────────────────────────────────
    <section
      id={id}
      aria-label="Response"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {error && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {error}
        </Alert>
      )}
      {response && (
        <>
          <Toolbar aria-label="Response summary and actions">
            <StatusBadge
              variant={response.status < 400 ? 'success' : 'error'}
              className="font-mono"
            >
              {response.status} {response.statusText}
            </StatusBadge>
            <span className="text-2xs text-[var(--color-text-muted)]">{response.time}ms</span>
            <span className="text-2xs text-[var(--color-text-muted)]">
              {formatBytes(response.size)}
            </span>
            <ToolbarSpacer />
            <ToolbarGroup>
              {!response.isBinary && <CopyButton text={prettyBody} />}
              <Button
                type="button"
                variant="icon"
                size="xs"
                onClick={() => void handleSaveResponse()}
                title={`Save response to a file (${formatShortcut('mod+s')})`}
                aria-label="Save response to a file"
              >
                <DownloadSimpleIcon size={14} aria-hidden="true" />
              </Button>
            </ToolbarGroup>
          </Toolbar>
          <TabBar tabs={RESPONSE_TABS} activeTab={responseTab} onTabChange={setResponseTab} />
          <div className="min-h-0 flex-1 overflow-hidden">
            {responseTab === 'body' ? (
              response.mimeType.startsWith('image/') && imagePreviewUrl ? (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  <img
                    src={imagePreviewUrl}
                    alt="Response preview"
                    className="max-h-full max-w-full rounded border border-[var(--color-border)]"
                  />
                </div>
              ) : response.isBinary ? (
                <EmptyState
                  icon={DownloadSimpleIcon}
                  title="Binary response"
                  description={`${response.mimeType} · ${formatBytes(response.size)}. Save the response to inspect the original bytes.`}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  {response.displayTruncated && (
                    <Alert
                      variant="warning"
                      className="rounded-none border-b border-[var(--color-border)] px-3 py-2"
                    >
                      Response truncated for display — save to file for the full body.
                    </Alert>
                  )}
                  <div className="min-h-0 flex-1">
                    <Editor
                      theme={monacoTheme}
                      language={responseLanguage}
                      value={prettyBody}
                      onMount={handleResponseEditorMount}
                      options={{ ...monacoOptions, readOnly: true }}
                    />
                  </div>
                </div>
              )
            ) : (
              <div className="h-full overflow-auto p-3">
                {Object.entries(response.headers).map(([key, value]) => (
                  // Response headers are what the server sent, not chrome — the
                  // whole row is mono so the name, colon and value share metrics.
                  <div key={key} className="mb-1 flex items-start gap-1 font-mono text-xs">
                    <span className="shrink-0 font-bold text-[var(--color-accent)]">{key}</span>
                    <span className="text-[var(--color-text-muted)]">: </span>
                    <span className="break-all text-[var(--color-text)]">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {!response && !error && !loading && (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={PaperPlaneTiltIcon}
            title="Send a request to see the response"
            description={`${formatShortcut('mod+enter')} sends the current request.`}
          />
        </div>
      )}
      {loading && (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]"
          role="status"
        >
          <Spinner size="md" label="Sending request" />
          Sending request…
        </div>
      )}
    </section>
  )
}
