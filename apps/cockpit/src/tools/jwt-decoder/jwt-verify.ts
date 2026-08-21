/**
 * Signature verification and claim-window checks for the JWT decoder.
 *
 * Kept out of the component because verification is the part worth testing exhaustively: a tool
 * that says "Valid" when it means "I decoded it" is worse than one that says nothing.
 *
 * **Only HMAC is verified here.** RS/ES/PS tokens are the majority of what people paste, and this
 * deliberately reports them as unsupported rather than unverified-looking-fine — asymmetric
 * verification needs a public key in PEM or JWK form, which is a materially larger input than a
 * shared secret and belongs in its own change.
 */

export type JwtAlg = string | undefined

export type VerifyStatus =
  /** Signature checked against the secret and matched. */
  | 'valid'
  /** Signature checked and did not match. */
  | 'invalid'
  /** `alg` names a scheme this tool cannot check (RS256, ES256, …). */
  | 'unsupported'
  /** `alg: "none"` — there is no signature to check, and that is the finding. */
  | 'none'
  /** The secret was blank, so nothing was attempted. */
  | 'unchecked'
  /** The token or secret was malformed enough that WebCrypto refused. */
  | 'error'

export type VerifyResult = {
  status: VerifyStatus
  /** One sentence, shown verbatim in the UI and to screen readers. */
  detail: string
}

/** `alg` → WebCrypto digest name. The three HMAC variants are the whole supported set. */
const HMAC_HASHES: Record<string, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

export function isHmacAlg(alg: JwtAlg): boolean {
  return typeof alg === 'string' && alg in HMAC_HASHES
}

/**
 * True for `alg: "none"` in any casing.
 *
 * RFC 7519 spells it lowercase, but the attack this guards against is a token whose header was
 * rewritten by someone who wanted it accepted — so matching only the spelling the spec prefers
 * would miss `None` and `NONE`, which several historic libraries also accepted.
 */
export function isNoneAlg(alg: JwtAlg): boolean {
  return typeof alg === 'string' && alg.toLowerCase() === 'none'
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = padded.length % 4
  const withPadding = remainder ? padded + '='.repeat(4 - remainder) : padded
  const binary = atob(withPadding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * The secret as bytes.
 *
 * `base64` is offered because a large share of real HS256 secrets — anything that came out of a JWK
 * `k` field or an Auth0 dashboard — are base64url text standing in for random bytes. Treating those
 * as UTF-8 produces a signature mismatch that looks exactly like a wrong secret, which is the most
 * confusing possible failure for this tool to have.
 */
export function secretToBytes(secret: string, encoding: 'utf8' | 'base64'): Uint8Array {
  if (encoding === 'base64') return base64UrlToBytes(secret)
  return new TextEncoder().encode(secret)
}

/**
 * Verify a token's signature against a shared secret.
 *
 * Returns a status rather than a boolean because "could not check" and "checked and wrong" are
 * completely different answers to the user's question, and collapsing them into `false` is how a
 * verifier ends up lying.
 */
export async function verifyJwtSignature({
  token,
  alg,
  secret,
  encoding = 'utf8',
  subtle = globalThis.crypto?.subtle,
}: {
  token: string
  alg: JwtAlg
  secret: string
  encoding?: 'utf8' | 'base64'
  subtle?: SubtleCrypto
}): Promise<VerifyResult> {
  if (isNoneAlg(alg)) {
    return {
      status: 'none',
      detail:
        'Header declares alg "none", so this token carries no signature. Any party can rewrite its claims.',
    }
  }

  if (!secret) {
    return isHmacAlg(alg)
      ? { status: 'unchecked', detail: 'Enter the shared secret to verify this signature.' }
      : {
          status: 'unchecked',
          detail: `Signature not verified${alg ? ` — ${alg} needs a public key, not a shared secret` : ''}.`,
        }
  }

  const hash = typeof alg === 'string' ? HMAC_HASHES[alg] : undefined
  if (!hash) {
    return {
      status: 'unsupported',
      detail: `Cannot verify ${alg ?? 'a token with no alg'} here — only HS256, HS384 and HS512 are checked. Asymmetric algorithms need a public key.`,
    }
  }

  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    return { status: 'error', detail: 'Token is not three dot-separated parts.' }
  }

  if (!subtle) {
    return { status: 'error', detail: 'WebCrypto is unavailable in this environment.' }
  }

  try {
    const keyBytes = secretToBytes(secret, encoding)
    const key = await subtle.importKey(
      'raw',
      keyBytes as unknown as ArrayBuffer,
      { name: 'HMAC', hash },
      false,
      ['verify']
    )
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = base64UrlToBytes(parts[2] ?? '')
    const valid = await subtle.verify(
      'HMAC',
      key,
      signature as BufferSource,
      signingInput as BufferSource
    )
    return valid
      ? { status: 'valid', detail: `Signature verified against the supplied secret (${alg}).` }
      : { status: 'invalid', detail: `Signature does not match the supplied secret (${alg}).` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'error', detail: `Could not verify: ${message}` }
  }
}

// ── Claim window ───────────────────────────────────────────────────

export type ClaimWindowState = 'valid' | 'expired' | 'not-yet-valid' | 'unknown'

export type ClaimWindow = {
  state: ClaimWindowState
  /** Absolute local time of whichever claim decided the state, if any. */
  boundaryAt: string | null
  /** `in 3m` / `2h ago`, relative to the boundary. */
  relative: string | null
  /** Which claim decided it — `exp`, `nbf`, or null when neither is present. */
  claim: 'exp' | 'nbf' | null
}

export function formatRelative(diffMs: number): string {
  const abs = Math.abs(diffMs)
  let text: string
  if (abs < 60_000) text = `${Math.round(abs / 1000)}s`
  else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)}m`
  else if (abs < 86_400_000) text = `${(abs / 3_600_000).toFixed(1)}h`
  else text = `${(abs / 86_400_000).toFixed(1)}d`
  return diffMs >= 0 ? `in ${text}` : `${text} ago`
}

/**
 * Resolve `exp` and `nbf` into one answer.
 *
 * `exp` was already handled; `nbf` was decoded, labelled and then ignored, so a token that had not
 * started yet displayed as plainly "Valid". Expiry wins when both fire, because an expired token is
 * dead permanently while a not-yet-valid one is merely early.
 */
export function computeClaimWindow(payload: Record<string, unknown>, now: number): ClaimWindow {
  const exp = typeof payload['exp'] === 'number' ? payload['exp'] : null
  const nbf = typeof payload['nbf'] === 'number' ? payload['nbf'] : null

  if (exp !== null && exp * 1000 < now) {
    return {
      state: 'expired',
      boundaryAt: new Date(exp * 1000).toLocaleString(),
      relative: formatRelative(exp * 1000 - now),
      claim: 'exp',
    }
  }

  if (nbf !== null && nbf * 1000 > now) {
    return {
      state: 'not-yet-valid',
      boundaryAt: new Date(nbf * 1000).toLocaleString(),
      relative: formatRelative(nbf * 1000 - now),
      claim: 'nbf',
    }
  }

  if (exp !== null) {
    return {
      state: 'valid',
      boundaryAt: new Date(exp * 1000).toLocaleString(),
      relative: formatRelative(exp * 1000 - now),
      claim: 'exp',
    }
  }

  if (nbf !== null) {
    return {
      state: 'valid',
      boundaryAt: new Date(nbf * 1000).toLocaleString(),
      relative: formatRelative(nbf * 1000 - now),
      claim: 'nbf',
    }
  }

  return { state: 'unknown', boundaryAt: null, relative: null, claim: null }
}

/** Badge/alert variant for a window state, so the component doesn't re-derive it in two places. */
export function claimWindowVariant(state: ClaimWindowState): 'success' | 'error' | 'warning' {
  if (state === 'expired') return 'error'
  if (state === 'not-yet-valid') return 'warning'
  return 'success'
}

export function verifyVariant(status: VerifyStatus): 'success' | 'error' | 'warning' | 'neutral' {
  if (status === 'valid') return 'success'
  if (status === 'invalid') return 'error'
  if (status === 'none') return 'error'
  if (status === 'unsupported' || status === 'error') return 'warning'
  return 'neutral'
}
