import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IdentificationCardIcon, WarningIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useUiStore } from '@/stores/ui.store'
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
import { Toggle } from '@/components/shared/Toggle'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import {
  claimWindowVariant,
  computeClaimWindow,
  formatRelative,
  isHmacAlg,
  isAsymmetricAlg,
  isNoneAlg,
  signJwt,
  verifyJwtSignature,
  verifyVariant,
  type PublicKeyFormat,
  type VerifyResult,
} from '@/tools/jwt-decoder/jwt-verify'

type JwtDecoderState = {
  /**
   * Only written while {@link JwtDecoderState.rememberToken} is on. A JWT is a bearer credential:
   * persisting it puts it in the SQLite file and every backup of it, so keeping it is the user's
   * explicit choice rather than a side effect of pasting.
   */
  input: string
  /** Opt-in token persistence. Off by default; see {@link JwtDecoderState.input}. */
  rememberToken: boolean
  secretEncoding: 'utf8' | 'base64'
  publicKeyFormat: PublicKeyFormat
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

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const withPadding = pad ? padded + '='.repeat(4 - pad) : padded
  return Uint8Array.from(atob(withPadding), (character) => character.charCodeAt(0))
}

export function isJwtObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

type JwtDecodeResult = { decoded: DecodedJwt; error: null } | { decoded: null; error: string }

function decodeJwt(token: string): JwtDecodeResult {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { decoded: null, error: 'Invalid JWT structure — expected header.payload.signature' }
  }
  const decodePart = (part: string, name: 'header' | 'payload') => {
    let bytes: Uint8Array
    try {
      bytes = decodeBase64Url(part)
    } catch {
      throw new Error(`Invalid JWT ${name} Base64URL encoding`)
    }
    let raw: string
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error(`Invalid JWT ${name} UTF-8`)
    }
    let value: unknown
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      throw new Error(`Invalid JWT ${name} JSON`)
    }
    if (!isJwtObject(value)) throw new Error(`Invalid JWT ${name} — expected a JSON object`)
    return { raw, value }
  }
  try {
    const header = decodePart(parts[0] ?? '', 'header')
    const payload = decodePart(parts[1] ?? '', 'payload')
    return {
      decoded: {
        header: header.value,
        payload: payload.value,
        signature: parts[2] ?? '',
        headerRaw: header.raw,
        payloadRaw: payload.raw,
      },
      error: null,
    }
  } catch (error) {
    return { decoded: null, error: error instanceof Error ? error.message : String(error) }
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
    rememberToken: false,
    secretEncoding: 'utf8',
    publicKeyFormat: 'jwk',
  })
  const { recordEdited, markUserEdit } = useToolHistory({ toolId: 'jwt-decoder' })
  // Signing material never leaves this component: no tool state, no cache, no history row.
  const [secret, setSecret] = useState('')
  const [publicKey, setPublicKey] = useState('')
  // The token lives here too, and only reaches persisted state while `rememberToken` is on.
  const [token, setToken] = useState(state.input)
  const tokenRef = useRef(token)
  tokenRef.current = token
  const [now, setNow] = useState(() => Date.now())
  const [payloadDraft, setPayloadDraft] = useState('')
  const [signing, setSigning] = useState(false)
  const copy = useCopyToClipboard()
  const setLastAction = useUiStore((s) => s.setLastAction)

  // A remembered token is read out of SQLite after mount; adopt it only while the field is still
  // untouched, so a paste made during the read is never overwritten by last session's token.
  useEffect(() => {
    if (state.input && !tokenRef.current) setToken(state.input)
  }, [state.input])

  const applyToken = useCallback(
    (value: string) => {
      setToken(value)
      // Nothing to write while the token is volatile — and no debounced save to schedule either.
      if (state.rememberToken) updateState({ input: value })
      else if (state.input) updateState({ input: '' })
    },
    [state.rememberToken, state.input, updateState]
  )

  const handleClearSensitive = useCallback(() => {
    setToken('')
    setSecret('')
    setPublicKey('')
    updateState({ input: '' })
    setLastAction('Cleared token and signing material', 'success')
  }, [updateState, setLastAction])

  const handleRememberChange = useCallback(
    (rememberToken: boolean) => {
      updateState({ rememberToken, input: rememberToken ? tokenRef.current : '' })
    },
    [updateState]
  )

  const decodeResult = useMemo(() => {
    if (!token.trim()) return { decoded: null, error: null }
    return decodeJwt(token)
  }, [token])
  const decoded = decodeResult.decoded

  useEffect(() => {
    if (decoded) setPayloadDraft(JSON.stringify(decoded.payload, null, 2))
    else setPayloadDraft('')
  }, [decoded])

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
      token,
      alg,
      secret,
      publicKey,
      publicKeyFormat: state.publicKeyFormat,
      encoding: state.secretEncoding,
    }).then((result) => {
      if (live) setVerification(result)
    })
    return () => {
      live = false
    }
  }, [decoded, token, secret, state.secretEncoding, publicKey, state.publicKeyFormat, alg])

  const handleSign = async () => {
    if (!decoded) return
    let payload: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(payloadDraft)
      if (!isJwtObject(parsed)) throw new Error('Payload must be a JSON object')
      payload = parsed
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : 'Payload JSON is invalid', 'error')
      return
    }
    setSigning(true)
    try {
      const signed = await signJwt({
        header: decoded.header,
        payload,
        secret,
        encoding: state.secretEncoding,
      })
      applyToken(signed)
      // The only history this tool writes, and only for an explicit action. Claim names but no
      // claim values, and never the secret: a history row must not be a second copy of the token.
      recordEdited({
        input: `Re-signed ${alg ?? 'JWT'} token`,
        output: `Claims: ${Object.keys(payload).join(', ') || '(none)'}`,
        subTab: 'signed',
        success: true,
      })
      setLastAction('Re-signed JWT and updated the token field', 'success')
      await copy(signed, { success: 'Re-signed JWT copied', failure: 'Could not copy JWT' })
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : 'Could not sign JWT', 'error')
    } finally {
      setSigning(false)
    }
  }

  // Color-coded token parts
  const tokenParts = useMemo(() => {
    const trimmed = token.trim()
    const parts = trimmed.split('.')
    if (parts.length !== 3) return null
    return parts
  }, [token])

  return (
    <ToolLayout fullBleed>
      {/* Token input */}
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-muted)]">JWT Token</span>
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
          <div className="ml-auto flex items-center gap-3">
            {/* Off by default: a JWT is a bearer credential, so remembering it writes it
                unencrypted into this machine's database and every backup of it. The secret and
                public key are never stored either way. */}
            <Toggle
              checked={state.rememberToken}
              onChange={handleRememberChange}
              label="Remember token"
            />
            <span className="max-w-[22rem] text-2xs text-[var(--color-text-muted)]">
              {state.rememberToken
                ? 'Token is stored unencrypted on this machine. Secrets and keys never are.'
                : 'Token, secret and key are kept in memory only.'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSensitive}
              disabled={!token && !secret && !publicKey}
            >
              Clear sensitive data
            </Button>
          </div>
        </div>
        <TextArea
          value={token}
          onChange={(e) => {
            markUserEdit()
            applyToken(e.target.value)
          }}
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
            {isHmacAlg(alg) ? (
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
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="your-256-bit-secret"
                  size="md"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={!isHmacAlg(alg)}
                />
              </Field>
            ) : isAsymmetricAlg(alg) ? (
              <Field
                label="Public key"
                hint="Paste a JWK JSON object or PEM-encoded SubjectPublicKeyInfo. Verification stays local."
                className="min-w-[20rem] flex-1"
              >
                <TextArea
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder={
                    state.publicKeyFormat === 'jwk'
                      ? '{ "kty": "RSA", ... }'
                      : '-----BEGIN PUBLIC KEY-----'
                  }
                  rows={3}
                  monospace
                  className="resize-y"
                />
              </Field>
            ) : null}
            {isHmacAlg(alg) && (
              <SegmentedControl
                options={SECRET_ENCODINGS}
                value={state.secretEncoding}
                onChange={(secretEncoding) => updateState({ secretEncoding })}
                aria-label="Secret encoding"
                className="mb-1"
              />
            )}
            {isAsymmetricAlg(alg) && (
              <SegmentedControl
                options={[
                  { value: 'jwk' as const, label: 'JWK' },
                  { value: 'spki' as const, label: 'SPKI / PEM' },
                ]}
                value={state.publicKeyFormat}
                onChange={(publicKeyFormat) => updateState({ publicKeyFormat })}
                aria-label="Public key format"
                className="mb-1"
              />
            )}
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
                  <h3 className="text-xs text-[var(--color-info)]">Header</h3>
                  <CopyButton text={JSON.stringify(decoded.header, null, 2)} />
                </div>
                <pre className="rounded border border-[var(--color-info)]/30 bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
                  {JSON.stringify(decoded.header, null, 2)}
                </pre>
              </section>

              {/* Signature */}
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs text-[var(--color-error)]">Signature</h3>
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
                <h3 className="text-xs text-[var(--color-success)]">Payload Claims</h3>
                <CopyButton text={JSON.stringify(decoded.payload, null, 2)} />
              </div>
              <div className="rounded border border-[var(--color-success)]/30 bg-[var(--color-surface)] p-3">
                {isHmacAlg(alg) && (
                  <div className="mb-3 border-b border-[var(--color-border)]/50 pb-3">
                    <Field
                      label="Editable payload JSON"
                      hint="Change claims, then sign a new HS token."
                    >
                      <TextArea
                        value={payloadDraft}
                        onChange={(event) => setPayloadDraft(event.target.value)}
                        rows={5}
                        monospace
                        className="resize-y"
                        aria-label="Editable payload JSON"
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => void handleSign()}
                      disabled={signing || !secret}
                    >
                      {signing ? 'Signing…' : 'Re-sign with secret'}
                    </Button>
                  </div>
                )}
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
                        ) : key === 'aud' && Array.isArray(value) ? (
                          <span title="Multiple allowed audiences">
                            {value.length} audiences: {value.map(String).join(', ')}
                          </span>
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
        ) : token.trim() ? (
          <Alert variant="error">{decodeResult.error ?? 'Invalid JWT token'}</Alert>
        ) : (
          <EmptyState
            icon={IdentificationCardIcon}
            title="Paste a JWT token above to decode it"
            action={
              TOOL_SAMPLES['jwt-decoder'] ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    markUserEdit()
                    applyToken(TOOL_SAMPLES['jwt-decoder'] ?? '')
                  }}
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
