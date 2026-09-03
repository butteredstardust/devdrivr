import { useCallback, useEffect, useState } from 'react'
import { getVersion, getTauriVersion } from '@tauri-apps/api/app'
import { ArrowsClockwiseIcon, QuotesIcon } from '@phosphor-icons/react'
import { Mascot } from '@/components/shared/Mascot'
import { CopyButton } from '@/components/shared/CopyButton'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TOOLS } from '@/app/tool-registry'
import { randomQuote, type Quote } from '@/lib/quotes'

/**
 * Settings → About.
 *
 * Version comes from the Tauri app metadata rather than `package.json`, because the release job
 * bumps `tauri.conf.json` and the installed binary is the thing the user is actually running —
 * a stale import would keep reporting the version the bundle was built from.
 */
export function AboutTab() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [tauriVersion, setTauriVersion] = useState<string | null>(null)
  // Rolled once per mount, so re-opening the dialog gets you a new one without a re-render churning
  // through quotes while you read.
  const [quote, setQuote] = useState<Quote>(() => randomQuote())

  useEffect(() => {
    let cancelled = false
    getVersion()
      .then((v) => {
        if (!cancelled) setAppVersion(v)
      })
      .catch(() => {})
    getTauriVersion()
      .then((v) => {
        if (!cancelled) setTauriVersion(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const shuffle = useCallback(() => setQuote((previous) => randomQuote(previous)), [])

  // What a bug report needs, in a form that survives being pasted into one. The user agent is in
  // here because it is the only OS and WebView version this app can name without taking on
  // `@tauri-apps/plugin-os` for one string, and "which WebKit" is exactly the question a rendering
  // bug turns on. `unknown` rather than the `—` the cards show: a dash is legible in a table and
  // meaningless in a pasted report, and the version calls fail silently, so this really can be hit.
  const buildInfo = [
    `devdrivr ${appVersion ? `v${appVersion}` : 'version unknown'}`,
    `Tauri ${tauriVersion ? `v${tauriVersion}` : 'version unknown'}`,
    `User agent: ${navigator.userAgent}`,
  ].join('\n')

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-1 pt-1">
        <Mascot size={112} />
        <h3 className="font-brand text-sm text-[var(--color-accent)]">devdrivr</h3>
      </div>

      <div className="space-y-2">
        <dl className="grid grid-cols-2 gap-2">
          <FactCard label="Version" value={appVersion ? `v${appVersion}` : '—'} />
          <FactCard label="Tauri" value={tauriVersion ? `v${tauriVersion}` : '—'} />
          <FactCard label="Tools" value={String(TOOLS.length)} />
          <FactCard label="License" value="MIT" />
        </dl>
        <div className="flex justify-end">
          <CopyButton text={buildInfo} label="Copy build info" />
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          <QuotesIcon size={12} />
          Words from the field
        </SectionLabel>
        <blockquote className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
          <p className="text-xs leading-relaxed text-[var(--color-text)]">“{quote.text}”</p>
          <footer className="mt-2 flex items-center justify-between gap-2">
            <cite className="text-2xs not-italic text-[var(--color-text-muted)]">
              — {quote.author}
            </cite>
            <button
              type="button"
              onClick={shuffle}
              className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2 py-1 text-2xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <ArrowsClockwiseIcon size={12} aria-hidden="true" />
              Another
            </button>
          </footer>
        </blockquote>
      </div>
    </div>
  )
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <dt className="text-2xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-mono text-sm text-[var(--color-text)]">{value}</dd>
    </div>
  )
}
