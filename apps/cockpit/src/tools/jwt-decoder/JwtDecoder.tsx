import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'

type JwtDecoderState = {
  input: string
}

type DecodedJwt = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  headerRaw: string
  payloadRaw: string
  expiry: { expired: boolean; expiresAt: string; relative: string } | null
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const withPadding = pad ? padded + '='.repeat(4 - pad) : padded
  return decodeURIComponent(
    atob(withPadding)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null

  try {
    const headerRaw = decodeBase64Url(parts[0]!)
    const payloadRaw = decodeBase64Url(parts[1]!)
    const header = JSON.parse(headerRaw) as Record<string, unknown>
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>

    let expiry: DecodedJwt['expiry'] = null
    if (typeof payload['exp'] === 'number') {
      const expiresAt = new Date(payload['exp'] * 1000)
      const now = new Date()
      const diffMs = expiresAt.getTime() - now.getTime()
      const absDiff = Math.abs(diffMs)
      let relative: string
      if (absDiff < 3_600_000) relative = `${Math.round(absDiff / 60_000)} minutes`
      else if (absDiff < 86_400_000) relative = `${Math.round(absDiff / 3_600_000)} hours`
      else relative = `${Math.round(absDiff / 86_400_000)} days`
      relative = diffMs >= 0 ? `in ${relative}` : `${relative} ago`

      expiry = {
        expired: diffMs < 0,
        expiresAt: expiresAt.toLocaleString(),
        relative,
      }
    }

    return {
      header,
      payload,
      signature: parts[2]!,
      headerRaw,
      payloadRaw,
      expiry,
    }
  } catch {
    return null
  }
}

export default function JwtDecoder() {
  const [state, updateState] = useToolState<JwtDecoderState>('jwt-decoder', {
    input: '',
  })
  const decoded = useMemo(() => {
    if (!state.input.trim()) return null
    return decodeJwt(state.input)
  }, [state.input])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">JWT Token</h2>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Paste a JWT token (eyJ...)"
          rows={3}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {decoded ? (
          <div className="flex flex-col gap-4">
            {decoded.expiry && (
              <div className={`rounded border px-3 py-2 text-sm ${
                decoded.expiry.expired
                  ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                  : 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
              }`}>
                {decoded.expiry.expired ? '⚠ Token expired' : '✓ Token valid'} — expires {decoded.expiry.expiresAt} ({decoded.expiry.relative})
              </div>
            )}

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-[var(--color-info)]">Header</h3>
                <CopyButton text={JSON.stringify(decoded.header, null, 2)} />
              </div>
              <pre className="rounded border border-[var(--color-info)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                {JSON.stringify(decoded.header, null, 2)}
              </pre>
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-[var(--color-success)]">Payload</h3>
                <CopyButton text={JSON.stringify(decoded.payload, null, 2)} />
              </div>
              <pre className="rounded border border-[var(--color-success)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                {JSON.stringify(decoded.payload, null, 2)}
              </pre>
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-[var(--color-error)]">Signature</h3>
                <CopyButton text={decoded.signature} />
              </div>
              <pre className="rounded border border-[var(--color-error)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)] break-all">
                {decoded.signature}
              </pre>
            </section>
          </div>
        ) : state.input.trim() ? (
          <div className="text-sm text-[var(--color-error)]">Invalid JWT token — expected format: header.payload.signature</div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">Paste a JWT token above to decode it</div>
        )}
      </div>
    </div>
  )
}
