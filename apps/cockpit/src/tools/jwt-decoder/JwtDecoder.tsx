import { useEffect, useMemo, useState } from 'react'
import { IdentificationCardIcon, WarningIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Alert } from '@/components/shared/Alert'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { Input } from '@/components/shared/Input'
import { Field } from '@/components/shared/Field'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import {
  claimWindowVariant,
  computeClaimWindow,
  formatRelative,
  isHmacAlg,
  isNoneAlg,
  verifyJwtSignature,
  verifyVariant,
  type VerifyResult,
} from '@/tools/jwt-decoder/jwt-verify'

type JwtDecoderState = {
  input: string
  /**
   * The shared secret is persisted with the rest of the tool state, same as any other input.
   *
   * That is a deliberate call, not an oversight: cockpit is local-first and single-user, the token
   * itself — which is the actual credential — is already persisted beside it, and a secret box that
   * empties every time you switch tabs makes the feature unusable for the case it exists for.
   */
  secret: string
  secretEncoding: 'utf8' | 'base64'
}

const SECRET_ENCODINGS = [
  { value: 'utf8' as const, label: 'UTF-8' },
  { value: 'base64' as const, label: 'Base64' },
]

const VERIFY_LABELS: Record<VerifyResult['status'], string> = {
  valid: 'Signature valid',
  invalid: 'Signature invalid',
  unsupported: 'Not verifiable',
  none: 'Unsigned (alg: none)',
  unchecked: 'Signature unverified',
  error: 'Verification failed',
}

const WINDOW_LABELS = {
  valid: 'Valid',
  expired: 'Expired',
  'not-yet-valid': 'Not yet valid',
  unknown: 'No expiry',
} as const

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
  const bytes = Uint8Array.from(atob(withPadding), (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function isJwtObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const headerRaw = decodeBase64Url(parts[0]!) // safe: length === 3 checked above
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const payloadRaw = decodeBase64Url(parts[1]!) // safe: length === 3 checked above
    const header = JSON.parse(headerRaw) as unknown
    const payload = JSON.parse(payloadRaw) as unknown
    if (!isJwtObject(header) || !isJwtObject(payload)) return null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { header, payload, signature: parts[2]!, headerRaw, payloadRaw } // safe: length === 3
  } catch {
    return null
  }
}

function formatTimestamp(value: unknown): string | null {
  if (typeof value !== 'number') return null
  return new Date(value * 1000).toLocaleString()
}

// ── Component ──────────────────────────────────────────────────────

export default function JwtDecoder() {
  const [state, updateState] = useToolState<JwtDecoderState>('jwt-decoder', {
    input: '',
    secret: '',
    secretEncoding: 'utf8',
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

  // Live-tick while either time-bounded claim is present. `nbf` needs the tick as much as `exp`
  // does — a token that becomes valid in forty seconds should stop saying so on its own.
  const hasTimeClaim = decoded
    ? typeof decoded.payload['exp'] === 'number' || typeof decoded.payload['nbf'] === 'number'
    : false
  useEffect(() => {
    if (!hasTimeClaim) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasTimeClaim])

  const claimWindow = useMemo(() => {
    if (!decoded) return null
    const window = computeClaimWindow(decoded.payload, now)
    return window.state === 'unknown' ? null : window
  }, [decoded, now])

  const alg =
    decoded && typeof decoded.header['alg'] === 'string' ? decoded.header['alg'] : undefined
  const algIsNone = isNoneAlg(alg)

  const [verification, setVerification] = useState<VerifyResult | null>(null)

  useEffect(() => {
    if (!decoded) {
      setVerification(null)
      return
    }
    // Guarded against out-of-order resolution: the secret box is typed into character by character,
    // so a slow first `importKey` could otherwise land after a later, more correct answer.
    let live = true
    void verifyJwtSignature({
      token: state.input,
      alg,
      secret: state.secret,
      encoding: state.secretEncoding,
    }).then((result) => {
      if (live) setVerification(result)
    })
    return () => {
      live = false
    }
  }, [decoded, state.input, state.secret, state.secretEncoding, alg])

  // Color-coded token parts
  const tokenParts = useMemo(() => {
    const trimmed = state.input.trim()
    const parts = trimmed.split('.')
    if (parts.length !== 3) return null
    return parts
  }, [state.input])

  return (
    <ToolLayout fullBleed>
      {/* Token input */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">JWT Token</span>
          {claimWindow && (
            <StatusBadge variant={claimWindowVariant(claimWindow.state)}>
              {WINDOW_LABELS[claimWindow.state]} · {claimWindow.relative}
            </StatusBadge>
          )}
          {verification && verification.status !== 'unchecked' && (
            <StatusBadge variant={verifyVariant(verification.status)}>
              {VERIFY_LABELS[verification.status]}
            </StatusBadge>
          )}
        </div>
        <TextArea
          value={state.input}
          onChange={(e) => updateState({ input: e.target.value })}
          placeholder="Paste a JWT token (eyJ...)"
          rows={3}
          monospace
          className="resize-none"
        />
        {/* Color-coded token preview */}
        {tokenParts && decoded && (
          <div className="mt-2 break-all font-mono text-xs leading-relaxed">
            <span className="text-[var(--color-info)]">{tokenParts[0]}</span>
            <span className="text-[var(--color-text-muted)]">.</span>
            <span className="text-[var(--color-success)]">{tokenParts[1]}</span>
            <span className="text-[var(--color-text-muted)]">.</span>
            <span className="text-[var(--color-error)]">{tokenParts[2]}</span>
          </div>
        )}

        {/* Secret — only once there is a token to check it against, so the box doesn't invite input
            that has nothing to verify. Hidden entirely for `alg: none`, where a secret is not a
            missing ingredient but a category error. */}
        {decoded && !algIsNone && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field
              label="Shared secret"
              hint={
                isHmacAlg(alg)
                  ? `Verifies the ${alg} signature locally — nothing leaves this machine.`
                  : `${alg ?? 'This token'} is not HMAC; only HS256/384/512 can be verified here.`
              }
              className="min-w-[16rem] flex-1"
            >
              <Input
                type="password"
                value={state.secret}
                onChange={(e) => updateState({ secret: e.target.value })}
                placeholder="your-256-bit-secret"
                size="md"
                spellCheck={false}
                autoComplete="off"
                disabled={!isHmacAlg(alg)}
              />
            </Field>
            <SegmentedControl
              options={SECRET_ENCODINGS}
              value={state.secretEncoding}
              onChange={(secretEncoding) => updateState({ secretEncoding })}
              aria-label="Secret encoding"
              className="mb-1"
            />
          </div>
        )}
      </div>

      {/* Decoded output */}
      <div className="flex-1 overflow-auto p-4">
        {decoded ? (
          <div className="flex flex-col gap-4">
            {/* `alg: "none"` first and unconditionally. It outranks every other banner: a token
                nobody signed cannot be expired or valid in any sense the user cares about. */}
            {algIsNone && (
              <Alert variant="error">
                <span className="flex items-start gap-2">
                  <WarningIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>
                    <strong>This token is unsigned.</strong> The header declares{' '}
                    <code className="font-mono">alg: &quot;none&quot;</code>, so the signature
                    segment carries no proof of origin and anyone who can reach this token can
                    rewrite the claims below. Reject it unless you are deliberately testing that
                    your verifier does.
                  </span>
                </span>
              </Alert>
            )}

            {/* Signature verification. Suppressed at `unchecked` — the empty-secret case already
                explains itself in the Field hint, and a banner saying "not verified" above every
                token the user merely wanted to read is noise. */}
            {!algIsNone && verification && verification.status !== 'unchecked' && (
              <Alert
                variant={
                  verification.status === 'valid'
                    ? 'success'
                    : verification.status === 'invalid'
                      ? 'error'
                      : 'warning'
                }
              >
                {verification.detail}
              </Alert>
            )}

            {/* Claim window */}
            {claimWindow && (
              <Alert variant={claimWindowVariant(claimWindow.state)}>
                {claimWindow.state === 'expired'
                  ? `Token expired — ${claimWindow.boundaryAt} (${claimWindow.relative})`
                  : claimWindow.state === 'not-yet-valid'
                    ? `Token is not valid yet — nbf is ${claimWindow.boundaryAt} (${claimWindow.relative})`
                    : claimWindow.claim === 'exp'
                      ? `Token valid — expires ${claimWindow.boundaryAt} (${claimWindow.relative})`
                      : `Token valid — in force since ${claimWindow.boundaryAt} (${claimWindow.relative})`}
              </Alert>
            )}

            {/* Header + Payload side by side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Header */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-mono text-xs text-[var(--color-info)]">Header</h3>
                  <CopyButton text={JSON.stringify(decoded.header, null, 2)} />
                </div>
                <pre className="rounded border border-[var(--color-info)]/30 bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                  {JSON.stringify(decoded.header, null, 2)}
                </pre>
              </section>

              {/* Signature */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-mono text-xs text-[var(--color-error)]">Signature</h3>
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
                <h3 className="font-mono text-xs text-[var(--color-success)]">Payload Claims</h3>
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
                        <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                          {info.label}
                        </span>
                      )}
                      <span className="ml-auto text-right font-mono text-xs text-[var(--color-text)]">
                        {timeStr ? (
                          <span title={String(value)}>
                            {timeStr}
                            {/* Both time-bounded claims get the live relative, not just `exp`.
                                A future `nbf` is the reason a token is being rejected right now,
                                so it is exactly as worth reading. */}
                            {(key === 'exp' || key === 'nbf') && typeof value === 'number' && (
                              <span
                                className={`ml-1 text-2xs ${
                                  (key === 'exp' ? value * 1000 < now : value * 1000 > now)
                                    ? 'text-[var(--color-error)]'
                                    : 'text-[var(--color-success)]'
                                }`}
                              >
                                ({formatRelative(value * 1000 - now)})
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
          <Alert variant="error">
            Invalid JWT token — expected format: header.payload.signature
          </Alert>
        ) : (
          <EmptyState
            icon={IdentificationCardIcon}
            title="Paste a JWT token above to decode it"
            action={
              TOOL_SAMPLES['jwt-decoder'] ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateState({ input: TOOL_SAMPLES['jwt-decoder'] ?? '' })}
                >
                  Load sample
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </ToolLayout>
  )
}
