import { describe, it, expect } from 'vitest'
import {
  claimWindowVariant,
  computeClaimWindow,
  isHmacAlg,
  isNoneAlg,
  secretToBytes,
  signJwt,
  verifyJwtSignature,
  verifyVariant,
} from '../jwt-decoder/jwt-verify'

/** Build a real HS256 token so the verifier is tested against something it did not produce. */
async function signHs256(payload: object, secret: string): Promise<string> {
  const b64 = (bytes: Uint8Array) => {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const encoder = new TextEncoder()
  const header = b64(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64(encoder.encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`))
  )
  return `${header}.${body}.${b64(sig)}`
}

describe('alg classification', () => {
  it('recognises the HMAC family and nothing else', () => {
    expect(isHmacAlg('HS256')).toBe(true)
    expect(isHmacAlg('HS512')).toBe(true)
    expect(isHmacAlg('RS256')).toBe(false)
  })

  it('matches `none` case-insensitively', () => {
    // A header rewritten to `None` is the classic alg-confusion attack; a case-sensitive check
    // would wave it through as an unrecognised algorithm.
    expect(isNoneAlg('none')).toBe(true)
    expect(isNoneAlg('None')).toBe(true)
    expect(isNoneAlg('HS256')).toBe(false)
  })
})

describe('secretToBytes', () => {
  it('decodes base64 secrets', () => {
    expect(Array.from(secretToBytes('aGk=', 'base64'))).toEqual([104, 105])
  })

  it('encodes utf8 secrets', () => {
    expect(Array.from(secretToBytes('hi', 'utf8'))).toEqual([104, 105])
  })
})

describe('verifyJwtSignature', () => {
  it('reports a correct signature as valid', async () => {
    const token = await signHs256({ sub: '1' }, 'topsecret')
    const result = await verifyJwtSignature({ token, alg: 'HS256', secret: 'topsecret' })
    expect(result.status).toBe('valid')
  })

  it('reports a wrong secret as invalid', async () => {
    const token = await signHs256({ sub: '1' }, 'topsecret')
    const result = await verifyJwtSignature({ token, alg: 'HS256', secret: 'wrong' })
    expect(result.status).toBe('invalid')
  })

  it('reports a truncated signature as a mismatch, not an error', async () => {
    // WebCrypto treats a wrong-length HMAC as a failed verification, which is the useful answer for
    // a truncated paste: the signature did not verify, rather than the tool itself failing.
    const token = await signHs256({ sub: '1' }, 'topsecret')
    const truncated = `${token.slice(0, -4)}`
    const result = await verifyJwtSignature({ token: truncated, alg: 'HS256', secret: 'topsecret' })
    expect(result.status).toBe('invalid')
  })

  it('waits for a secret before claiming anything', async () => {
    const token = await signHs256({ sub: '1' }, 'topsecret')
    const result = await verifyJwtSignature({ token, alg: 'HS256', secret: '' })
    expect(result.status).toBe('unchecked')
  })

  it('flags `alg: none` rather than verifying it', async () => {
    const result = await verifyJwtSignature({ token: 'a.b.', alg: 'none', secret: 'x' })
    expect(result.status).toBe('none')
  })

  it('waits for a public key before checking asymmetric algorithms', async () => {
    const result = await verifyJwtSignature({ token: 'a.b.c', alg: 'RS256', secret: '' })
    expect(result.status).toBe('unchecked')
  })

  it('verifies an RS256 token with a pasted JWK', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    )
    const b64 = (bytes: Uint8Array) => {
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    const header = b64(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
    const payload = b64(new TextEncoder().encode(JSON.stringify({ sub: '1' })))
    const input = `${header}.${payload}`
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        new TextEncoder().encode(input)
      )
    )
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    const result = await verifyJwtSignature({
      token: `${input}.${b64(signature)}`,
      alg: 'RS256',
      secret: '',
      publicKey: JSON.stringify(publicJwk),
      publicKeyFormat: 'jwk',
    })
    expect(result.status).toBe('valid')
  })
})

describe('HS re-signing', () => {
  it('builds a verifiable token from edited claims', async () => {
    const token = await signJwt({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: 'edited' },
      secret: 'topsecret',
    })
    const result = await verifyJwtSignature({ token, alg: 'HS256', secret: 'topsecret' })
    expect(result.status).toBe('valid')
    expect(
      JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(
            atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/').padEnd(4, '=')),
            (c) => c.charCodeAt(0)
          )
        )
      )
    ).toEqual({ sub: 'edited' })
  })
})

describe('computeClaimWindow', () => {
  const now = 1_700_000_000_000

  it('is valid inside the window', () => {
    const window = computeClaimWindow({ exp: now / 1000 + 60, nbf: now / 1000 - 60 }, now)
    expect(window.state).toBe('valid')
  })

  it('is expired past exp', () => {
    expect(computeClaimWindow({ exp: now / 1000 - 1 }, now).state).toBe('expired')
  })

  it('is not-yet-valid before nbf', () => {
    expect(computeClaimWindow({ nbf: now / 1000 + 60 }, now).state).toBe('not-yet-valid')
  })

  it('reports expiry when both exp and nbf would fire', () => {
    // An expired token is expired regardless of nbf; saying "not yet valid" would be misleading
    // about which problem to fix.
    const window = computeClaimWindow({ exp: now / 1000 - 1, nbf: now / 1000 + 60 }, now)
    expect(window.state).toBe('expired')
  })

  it('is unknown with neither claim', () => {
    expect(computeClaimWindow({}, now).state).toBe('unknown')
  })
})

describe('badge variants', () => {
  it('maps claim states to their badge colours', () => {
    expect(claimWindowVariant('valid')).toBe('success')
    expect(claimWindowVariant('expired')).toBe('error')
    expect(claimWindowVariant('not-yet-valid')).toBe('warning')
  })

  it('maps verification statuses to their badge colours', () => {
    expect(verifyVariant('valid')).toBe('success')
    expect(verifyVariant('invalid')).toBe('error')
    expect(verifyVariant('none')).toBe('error')
    expect(verifyVariant('unchecked')).toBe('neutral')
  })
})
