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

export default function DocsBrowser({
  defaultLoadError = false,
  frameSrc = 'https://devdocs.io',
}: DocsBrowserProps) {
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
            <span className="font-mono text-xs text-[var(--color-text-muted)]">DevDocs.io</span>
            <ToolbarSpacer />
            <a
              href="https://devdocs.io"
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
                  <span>Embedded docs failed to load. Open DevDocs in your browser or retry.</span>
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              ) : showSlowFallback ? (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    DevDocs is taking longer than usual to load. You can keep waiting or retry.
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              ) : (
                <span>Loading DevDocs…</span>
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
        title="DevDocs"
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
