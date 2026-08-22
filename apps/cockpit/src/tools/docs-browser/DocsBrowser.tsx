import { useCallback, useEffect, useState } from 'react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Alert } from '@/components/shared/Alert'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import { Select } from '@/components/shared/Input'
import { sendToTool } from '@/lib/tool-handoff'

type DocsBrowserProps = {
  defaultLoadError?: boolean
  frameSrc?: string
}

const DEFAULT_DOCS_SOURCE = 'https://devdocs.io'
const DOCS_SOURCES = [
  { value: DEFAULT_DOCS_SOURCE, label: 'DevDocs home' },
  { value: 'https://devdocs.io/javascript', label: 'JavaScript' },
  { value: 'https://devdocs.io/python~3.12', label: 'Python 3.12' },
  { value: 'https://devdocs.io/rust', label: 'Rust' },
] as const

/**
 * What to call the embedded site in the chrome and in error copy.
 *
 * `frameSrc` is a prop, but the label, the external link and the iframe title all used to say
 * "DevDocs" regardless — so pointing the tool at anything else produced a UI that named the wrong
 * site. Falls back to the raw string for non-http sources like `about:blank`, which is at least
 * true.
 */
export function siteLabel(frameSrc: string): string {
  try {
    const { hostname } = new URL(frameSrc)
    return hostname.replace(/^www\./, '') || frameSrc
  } catch {
    return frameSrc
  }
}

export default function DocsBrowser({ defaultLoadError = false, frameSrc }: DocsBrowserProps) {
  const [selectedSource, setSelectedSource] = useState(DEFAULT_DOCS_SOURCE)
  const effectiveSrc = frameSrc ?? selectedSource
  const label = siteLabel(effectiveSrc)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [loading, setLoading] = useState(!defaultLoadError)
  const [loadError, setLoadError] = useState(defaultLoadError)
  const [showSlowFallback, setShowSlowFallback] = useState(false)
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    if (frameSrc) return
    const controller = new AbortController()
    void tauriFetch(effectiveSrc, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        // HEAD is an advisory probe: CDNs commonly reject it even while GET and
        // iframe navigation work. Only definitive not-found responses override
        // the iframe's own load/error signals.
        if (!controller.signal.aborted && (response.status === 404 || response.status === 410)) {
          setLoading(false)
          setLoadError(true)
          setShowSlowFallback(false)
        }
      })
      .catch(() => {
        // Let the iframe and slow-load fallback decide; a failed HEAD alone is
        // not evidence that the page cannot load.
      })
    return () => controller.abort()
  }, [effectiveSrc, frameSrc, frameKey])

  useEffect(() => {
    if (!loading || loadError) return
    const timeout = window.setTimeout(() => {
      setShowSlowFallback(true)
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [loadError, loading, frameKey])

  const handleRetry = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    setShowSlowFallback(false)
    setFrameKey((current) => current + 1)
  }, [])

  const handleHome = useCallback(() => {
    if (frameSrc) {
      setFrameKey((current) => current + 1)
      return
    }
    setSelectedSource(DEFAULT_DOCS_SOURCE)
    setLoading(true)
    setLoadError(false)
    setShowSlowFallback(false)
    setFrameKey((current) => current + 1)
  }, [frameSrc])

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <>
          <Toolbar aria-label="Documentation navigation">
            {!frameSrc && (
              <Select
                value={selectedSource}
                onChange={(event) => {
                  setSelectedSource(event.target.value)
                  setLoading(true)
                  setLoadError(false)
                  setShowSlowFallback(false)
                  setFrameKey((current) => current + 1)
                }}
                aria-label="Documentation source"
                className="max-w-44"
              >
                {DOCS_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </Select>
            )}
            <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              Reload
            </Button>
            <Button variant="secondary" size="sm" onClick={handleHome}>
              Home
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                sendToTool('api-client', {
                  activeRequestId: null,
                  draft: {
                    name: `GET ${label}`,
                    method: 'GET',
                    url: effectiveSrc,
                    headers: [],
                    body: '',
                    bodyMode: 'none',
                    auth: { type: 'none' },
                  },
                })
              }
              title="Inspect this documentation URL in API Client"
            >
              Inspect URL
            </Button>
            <ToolbarSpacer />
            <a
              href={effectiveSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--color-accent)] hover:underline"
              onClick={() => setLastAction('Opened in browser', 'info')}
            >
              Open externally
            </a>
          </Toolbar>
          {(loading || loadError || showSlowFallback) && (
            <Alert
              variant={loadError ? 'error' : showSlowFallback ? 'warning' : 'info'}
              className="rounded-none border-b border-[var(--color-border)] px-4 py-3"
            >
              {loadError ? (
                <div className="flex items-center justify-between gap-3">
                  <span>Embedded docs failed to load. Open {label} in your browser or retry.</span>
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              ) : showSlowFallback ? (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {label} is taking longer than usual to load. You can keep waiting or retry.
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              ) : (
                <span>Loading {label}…</span>
              )}
            </Alert>
          )}
        </>
      }
    >
      <iframe
        key={frameKey}
        src={effectiveSrc}
        className="flex-1 border-none"
        title={`${label} documentation`}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => {
          setLoading(false)
          setLoadError(false)
          setShowSlowFallback(false)
        }}
        onError={() => {
          setLoading(false)
          setLoadError(true)
          setShowSlowFallback(false)
        }}
      />
    </ToolLayout>
  )
}
