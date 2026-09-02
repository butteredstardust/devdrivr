/**
 * Signature verification and claim-window checks for the JWT decoder.
 *
 * Kept out of the component because verification is the part worth testing exhaustively: a tool
 * that says "Valid" when it means "I decoded it" is worse than one that says nothing.
 *
 * HMAC and locally supplied public keys are supported. No key or token leaves the application.
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

export type PublicKeyFormat = 'jwk' | 'spki'

/** `alg` → WebCrypto digest name. The three HMAC variants are the whole supported set. */
const HMAC_HASHES: Record<string, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

const ASYMMETRIC_ALGORITHMS: Record<
  string,
  { name: string; hash: string; namedCurve?: string; saltLength?: number }
> = {
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  RS384: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
  RS512: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
  PS256: { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 },
  PS384: { name: 'RSA-PSS', hash: 'SHA-384', saltLength: 48 },
  PS512: { name: 'RSA-PSS', hash: 'SHA-512', saltLength: 64 },
  ES256: { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
  ES384: { name: 'ECDSA', hash: 'SHA-384', namedCurve: 'P-384' },
  ES512: { name: 'ECDSA', hash: 'SHA-512', namedCurve: 'P-521' },
}

export function isHmacAlg(alg: JwtAlg): boolean {
  return typeof alg === 'string' && alg in HMAC_HASHES
}

export function isAsymmetricAlg(alg: JwtAlg): boolean {
  return typeof alg === 'string' && alg in ASYMMETRIC_ALGORITHMS
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '')
  return base64UrlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_'))
}

function publicKeyAlgorithm(alg: string) {
  const config = ASYMMETRIC_ALGORITHMS[alg]
  if (!config) throw new Error(`Unsupported asymmetric algorithm: ${alg}`)
  if (config.name === 'ECDSA') {
    return { name: config.name, namedCurve: config.namedCurve }
  }
  return { name: config.name, hash: config.hash }
}

async function importPublicKey(
  value: string,
  alg: string,
  format: PublicKeyFormat,
  subtle: SubtleCrypto
): Promise<CryptoKey> {
  const algorithm = publicKeyAlgorithm(alg)
  if (format === 'jwk') {
    const jwk: JsonWebKey = JSON.parse(value) as JsonWebKey
    return subtle.importKey('jwk', jwk, algorithm, false, ['verify'])
  }
  return subtle.importKey('spki', pemToBytes(value) as BufferSource, algorithm, false, ['verify'])
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
  publicKey = '',
  publicKeyFormat = 'jwk',
  encoding = 'utf8',
  subtle = globalThis.crypto?.subtle,
}: {
  token: string
  alg: JwtAlg
  secret: string
  publicKey?: string
  publicKeyFormat?: PublicKeyFormat
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

  const hash = typeof alg === 'string' ? HMAC_HASHES[alg] : undefined
  const asymmetric = typeof alg === 'string' ? ASYMMETRIC_ALGORITHMS[alg] : undefined

  // Prerequisites are per algorithm family. Both fields survive a change of token, so credentials
  // left behind by the other family must not be mistaken for something worth verifying against:
  // an HS token with only a stale public key present would otherwise be checked with an empty
  // HMAC key and reported Invalid.
  if (hash && !secret) {
    return { status: 'unchecked', detail: 'Enter the shared secret to verify this signature.' }
  }
  if (asymmetric && !publicKey) {
    return {
      status: 'unchecked',
      detail: `Signature not verified — ${alg} needs a public key, not a shared secret.`,
    }
  }

  if (!hash && !asymmetric) {
    if (!secret && !publicKey) {
      return {
        status: 'unchecked',
        detail: `Signature not verified${alg ? ` — ${alg} needs a public key, not a shared secret` : ''}.`,
      }
    }
    return {
      status: 'unsupported',
      detail: `Cannot verify ${alg ?? 'a token with no alg'} here — supply a supported public key or HMAC secret.`,
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
    const key = hash
      ? await subtle.importKey(
          'raw',
          secretToBytes(secret, encoding) as unknown as ArrayBuffer,
          { name: 'HMAC', hash },
          false,
          ['verify']
        )
      : await importPublicKey(publicKey ?? '', alg ?? '', publicKeyFormat, subtle)
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = base64UrlToBytes(parts[2] ?? '')
    const verifyAlgorithm = asymmetric
      ? asymmetric.name === 'RSA-PSS'
        ? { name: asymmetric.name, saltLength: asymmetric.saltLength }
        : asymmetric.name === 'ECDSA'
          ? { name: asymmetric.name, hash: asymmetric.hash }
          : { name: asymmetric.name }
      : 'HMAC'
    const valid = await subtle.verify(verifyAlgorithm, key, signature as BufferSource, signingInput)
    return valid
      ? { status: 'valid', detail: `Signature verified locally (${alg}).` }
      : { status: 'invalid', detail: `Signature does not match the supplied key (${alg}).` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'error', detail: `Could not verify: ${message}` }
  }
}

export async function signJwt({
  header,
  payload,
  secret,
  encoding = 'utf8',
  subtle = globalThis.crypto?.subtle,
}: {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  secret: string
  encoding?: 'utf8' | 'base64'
  subtle?: SubtleCrypto
}): Promise<string> {
  const alg = typeof header['alg'] === 'string' ? header['alg'] : ''
  const hash = HMAC_HASHES[alg]
  if (!hash)
    throw new Error('Only HS256, HS384, and HS512 tokens can be re-signed with a shared secret.')
  if (!secret) throw new Error('Enter a shared secret before signing.')
  if (!subtle) throw new Error('WebCrypto is unavailable in this environment.')
  const encode = (value: unknown) =>
    bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
  const encodedHeader = encode(header)
  const encodedPayload = encode(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const key = await subtle.importKey(
    'raw',
    secretToBytes(secret, encoding) as unknown as ArrayBuffer,
    { name: 'HMAC', hash },
    false,
    ['sign']
  )
  const signature = new Uint8Array(
    await subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  )
  return `${signingInput}.${bytesToBase64Url(signature)}`
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

  if (exp !== null && exp * 1000 <= now) {
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
