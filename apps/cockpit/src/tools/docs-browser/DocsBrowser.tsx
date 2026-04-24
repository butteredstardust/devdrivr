import { useCallback, useEffect, useState } from 'react'
import { useUiStore } from '@/stores/ui.store'

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
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    if (!loading || loadError) return
    const timeout = window.setTimeout(() => {
      setLoading(false)
      setLoadError(true)
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [loadError, loading, frameKey])

  const handleRetry = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    setFrameKey((current) => current + 1)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">DevDocs.io</span>
        <a
          href="https://devdocs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-accent)] hover:underline"
          onClick={() => setLastAction('Opened in browser', 'info')}
        >
          Open externally
        </a>
      </div>
      {(loading || loadError) && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
          {loadError ? (
            <div className="flex items-center justify-between gap-3">
              <span>Embedded docs failed to load. Open DevDocs in your browser or retry.</span>
              <button
                type="button"
                onClick={handleRetry}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
              >
                Retry
              </button>
            </div>
          ) : (
            <span>Loading DevDocs…</span>
          )}
        </div>
      )}
      <iframe
        key={frameKey}
        src={frameSrc}
        className="flex-1 border-none"
        title="DevDocs"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => {
          setLoading(false)
          setLoadError(false)
        }}
        onError={() => {
          setLoading(false)
          setLoadError(true)
        }}
      />
    </div>
  )
}
