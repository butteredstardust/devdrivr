import { useEffect, useMemo, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
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
}

// ── Known claim metadata ───────────────────────────────────────────

const CLAIM_INFO: Record<string, { label: string; isTime?: boolean }> = {
  iss: { label: 'Issuer' },
  sub: { label: 'Subject' },
  aud: { label: 'Audience' },
  exp: { label: 'Expiration', isTime: true },
  nbf: { label: 'Not Before', isTime: true },
  iat: { label: 'Issued At', isTime: true },
  jti: { label: 'JWT ID' },
  azp: { label: 'Authorized Party' },
  scope: { label: 'Scope' },
  nonce: { label: 'Nonce' },
  at_hash: { label: 'Access Token Hash' },
  email: { label: 'Email' },
  name: { label: 'Name' },
  given_name: { label: 'Given Name' },
  family_name: { label: 'Family Name' },
  picture: { label: 'Picture URL' },
  email_verified: { label: 'Email Verified' },
  roles: { label: 'Roles' },
  permissions: { label: 'Permissions' },
}

// ── Helpers ────────────────────────────────────────────────────────

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
    return { header, payload, signature: parts[2]!, headerRaw, payloadRaw }
  } catch {
    return null
  }
}

function formatRelative(diffMs: number): string {
  const abs = Math.abs(diffMs)
  let text: string
  if (abs < 60_000) text = `${Math.round(abs / 1000)}s`
  else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)}m`
  else if (abs < 86_400_000) text = `${(abs / 3_600_000).toFixed(1)}h`
  else text = `${(abs / 86_400_000).toFixed(1)}d`
  return diffMs >= 0 ? `in ${text}` : `${text} ago`
}

function formatTimestamp(value: unknown): string | null {
  if (typeof value !== 'number') return null
  return new Date(value * 1000).toLocaleString()
}

// ── Component ──────────────────────────────────────────────────────

export default function JwtDecoder() {
  const [state, updateState] = useToolState<JwtDecoderState>('jwt-decoder', {
    input: '',
  })
  const { record } = useToolHistory({ toolId: 'jwt-decoder' })
  const [now, setNow] = useState(() => Date.now())

  const decoded = useMemo(() => {
    if (!state.input.trim()) return null
    return decodeJwt(state.input)
  }, [state.input])

  useEffect(() => {
    if (decoded) {
      record({
        input: state.input.slice(0, 1000),
        output: JSON.stringify({ header: decoded.header, payload: decoded.payload }),
        subTab: 'decoded',
        success: true,
      })
    }
  }, [decoded, record, state.input])

  // Live-tick expiry every second when token has exp claim
  const hasExp = decoded ? typeof decoded.payload['exp'] === 'number' : false
  useEffect(() => {
    if (!hasExp) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasExp])

  const expiry = useMemo(() => {
    if (!decoded || typeof decoded.payload['exp'] !== 'number') return null
    const exp = decoded.payload['exp'] as number
    const expiresAt = new Date(exp * 1000)
    const diffMs = expiresAt.getTime() - now
    return {
      expired: diffMs < 0,
      expiresAt: expiresAt.toLocaleString(),
      relative: formatRelative(diffMs),
    }
  }, [decoded, now])

  // Color-coded token parts
  const tokenParts = useMemo(() => {
    const trimmed = state.input.trim()
    const parts = trimmed.split('.')
    if (parts.length !== 3) return null
    return parts
  }, [state.input])

  return (
    <div className="flex h-full flex-col">
      {/* Token input */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">JWT Token</span>
          {expiry && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                expiry.expired
                  ? 'bg-[var(--color-error)]/15 text-[var(--color-error)]'
                  : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
              }`}
            >
              {expiry.expired ? 'Expired' : 'Valid'} · {expiry.relative}
            </span>
          )}
        </div>
        <textarea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Paste a JWT token (eyJ...)"
          rows={3}
          className="w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
        {/* Color-coded token preview */}
        {tokenParts && decoded && (
          <div className="mt-2 break-all font-mono text-[11px] leading-relaxed">
            <span className="text-[var(--color-info)]">{tokenParts[0]}</span>
            <span className="text-[var(--color-text-muted)]">.</span>
            <span className="text-[var(--color-success)]">{tokenParts[1]}</span>
            <span className="text-[var(--color-text-muted)]">.</span>
            <span className="text-[var(--color-error)]">{tokenParts[2]}</span>
          </div>
        )}
      </div>

      {/* Decoded output */}
      <div className="flex-1 overflow-auto p-4">
        {decoded ? (
          <div className="flex flex-col gap-4">
            {/* Expiry banner */}
            {expiry && (
              <div
                className={`rounded border px-3 py-2 text-sm ${
                  expiry.expired
                    ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                    : 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
                }`}
              >
                {expiry.expired ? '⚠ Token expired' : '✓ Token valid'} — {expiry.expiresAt} (
                {expiry.relative})
              </div>
            )}

            {/* Header + Payload side by side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Header */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-pixel text-xs text-[var(--color-info)]">Header</h3>
                  <CopyButton text={JSON.stringify(decoded.header, null, 2)} />
                </div>
                <pre className="rounded border border-[var(--color-info)]/30 bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                  {JSON.stringify(decoded.header, null, 2)}
                </pre>
              </section>

              {/* Signature */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-pixel text-xs text-[var(--color-error)]">Signature</h3>
                  <CopyButton text={decoded.signature} />
                </div>
                <pre className="break-all rounded border border-[var(--color-error)]/30 bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                  {decoded.signature}
                </pre>
              </section>
            </div>

            {/* Payload with claim annotations */}
            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-pixel text-xs text-[var(--color-success)]">Payload Claims</h3>
                <CopyButton text={JSON.stringify(decoded.payload, null, 2)} />
              </div>
              <div className="rounded border border-[var(--color-success)]/30 bg-[var(--color-surface)] p-3">
                {Object.entries(decoded.payload).map(([key, value]) => {
                  const info = CLAIM_INFO[key]
                  const timeStr = info?.isTime ? formatTimestamp(value) : null
                  return (
                    <div
                      key={key}
                      className="flex items-baseline gap-2 border-b border-[var(--color-border)]/50 py-1.5 last:border-b-0"
                    >
                      <code className="shrink-0 text-xs font-bold text-[var(--color-accent)]">
                        {key}
                      </code>
                      {info && (
                        <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                          {info.label}
                        </span>
                      )}
                      <span className="ml-auto text-right font-mono text-xs text-[var(--color-text)]">
                        {timeStr ? (
                          <span title={String(value)}>
                            {timeStr}
                            {key === 'exp' && expiry && (
                              <span
                                className={`ml-1 text-[10px] ${
                                  expiry.expired
                                    ? 'text-[var(--color-error)]'
                                    : 'text-[var(--color-success)]'
                                }`}
                              >
                                ({expiry.relative})
                              </span>
                            )}
                          </span>
                        ) : typeof value === 'string' ? (
                          value.length > 60 ? (
                            value.slice(0, 60) + '…'
                          ) : (
                            value
                          )
                        ) : (
                          JSON.stringify(value)
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        ) : state.input.trim() ? (
          <div className="text-sm text-[var(--color-error)]">
            Invalid JWT token — expected format: header.payload.signature
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">
            Paste a JWT token above to decode it
          </div>
        )}
      </div>
    </div>
  )
}
