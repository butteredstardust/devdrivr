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

/**
 * What the HEAD preflight learned about the source.
 *
 * Embedding a third-party site is best-effort: an iframe's `onError` does not fire for
 * cross-origin HTTP failures, so a 401 or a 503 renders as a blank frame that stays "loading"
 * forever. The probe cannot be authoritative either — CDNs reject HEAD, and a probe that succeeds
 * says nothing about whether the response allows framing. So it reports what it saw and the UI
 * says so, rather than pretending to know.
 */
type ProbeStatus =
  | { kind: 'pending' }
  /** 2xx/3xx — the URL resolves; framing may still be refused. */
  | { kind: 'ok' }
  /** 404/410 — definitively not a document. */
  | { kind: 'missing'; status: number }
  /** Any other non-2xx: auth walls, rate limits, outages. */
  | { kind: 'http-error'; status: number }
  /** HEAD was rejected or the network failed; this tells us nothing either way. */
  | { kind: 'unverified' }

export default function DocsBrowser({ defaultLoadError = false, frameSrc }: DocsBrowserProps) {
  const [selectedSource, setSelectedSource] = useState(DEFAULT_DOCS_SOURCE)
  const effectiveSrc = frameSrc ?? selectedSource
  const label = siteLabel(effectiveSrc)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [loading, setLoading] = useState(!defaultLoadError)
  const [loadError, setLoadError] = useState(defaultLoadError)
  const [showSlowFallback, setShowSlowFallback] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const [probe, setProbe] = useState<ProbeStatus>({ kind: 'pending' })

  useEffect(() => {
    if (frameSrc) return
    const controller = new AbortController()
    setProbe({ kind: 'pending' })
    void tauriFetch(effectiveSrc, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return
        const status = response.status
        if (status === 404 || status === 410) {
          // Definitive: stop waiting on an iframe that will never load a document.
          setProbe({ kind: 'missing', status })
          setLoading(false)
          setLoadError(true)
          setShowSlowFallback(false)
          return
        }
        if (status >= 400) {
          // Not definitive — the page may still frame fine, or may be an error document. Record it
          // so the copy can name the status instead of leaving the user at a blank panel.
          setProbe({ kind: 'http-error', status })
          return
        }
        setProbe({ kind: 'ok' })
      })
      .catch(() => {
        // Let the iframe and slow-load fallback decide; a failed HEAD alone is
        // not evidence that the page cannot load.
        if (!controller.signal.aborted) setProbe({ kind: 'unverified' })
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
          {(loading || loadError || showSlowFallback || probe.kind === 'http-error') && (
            <Alert
              variant={
                loadError
                  ? 'error'
                  : showSlowFallback || probe.kind === 'http-error'
                    ? 'warning'
                    : 'info'
              }
              className="rounded-none border-b border-[var(--color-border)] px-4 py-3"
            >
              {loadError || showSlowFallback || probe.kind === 'http-error' ? (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {loadError
                      ? probe.kind === 'missing'
                        ? `${label} returned HTTP ${probe.status} — there is no document at this address.`
                        : `Embedded docs failed to load. Open ${label} in your browser or retry.`
                      : probe.kind === 'http-error'
                        ? `${label} returned HTTP ${probe.status}. The embedded view may show an error page or stay blank.`
                        : `${label} is taking longer than usual to load. You can keep waiting or retry.`}
                  </span>
                  {/* Opening in the real browser is the fallback that always works — embedding is
                      best-effort, so the escape hatch is offered here and not only in the toolbar. */}
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={effectiveSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-accent)] hover:underline"
                      onClick={() => setLastAction('Opened in browser', 'info')}
                    >
                      Open in browser
                    </a>
                    <Button variant="secondary" size="sm" onClick={handleRetry}>
                      Retry
                    </Button>
                  </div>
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
        /*
         * Trust boundary for the embedded documentation.
         *
         * DevDocs is a client-rendered app that keeps its downloaded doc sets in IndexedDB, so
         * `allow-scripts` and `allow-same-origin` are load-bearing: without them the frame renders
         * an empty shell. Everything else is dropped. `allow-forms` was never needed — DevDocs'
         * search is a scripted input, not a submitted form — and `allow-popups` let a third-party
         * page open windows inside the app when "Open externally" is the supported way out.
         * `allow-top-navigation` is absent, so the frame cannot navigate the cockpit itself.
         *
         * Note that `allow-scripts` plus `allow-same-origin` is, by design, close to unsandboxed
         * for a same-origin document; the real containment here is the Tauri CSP and the fact that
         * the frame's origin is never the app's own. This is a read-only viewer for a fixed list
         * of sources — it is not a general browser, and it must not become one without revisiting
         * this attribute.
         */
        sandbox="allow-scripts allow-same-origin"
        // No device or storage capabilities need to reach a documentation page.
        allow=""
        referrerPolicy="no-referrer"
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
