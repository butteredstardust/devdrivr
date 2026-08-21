import { useCallback, useEffect, useState } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Alert } from '@/components/shared/Alert'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'

type DocsBrowserProps = {
  defaultLoadError?: boolean
  frameSrc?: string
}

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

export default function DocsBrowser({
  defaultLoadError = false,
  frameSrc = 'https://devdocs.io',
}: DocsBrowserProps) {
  const label = siteLabel(frameSrc)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [loading, setLoading] = useState(!defaultLoadError)
  const [loadError, setLoadError] = useState(defaultLoadError)
  const [showSlowFallback, setShowSlowFallback] = useState(false)
  const [frameKey, setFrameKey] = useState(0)

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

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <>
          <Toolbar aria-label="Documentation navigation">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">{label}</span>
            <ToolbarSpacer />
            <a
              href={frameSrc}
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
        src={frameSrc}
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
