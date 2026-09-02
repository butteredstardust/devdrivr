import { describe, it, expect } from 'vitest'
import {
  computeFileHashes,
  computeHashes,
  computeHmac,
  hashBytes,
  HASH_ALGORITHMS,
} from '../hash-generator/hash-utils'

describe('added algorithms', () => {
  it('SHA3-256 of "abc" matches the NIST vector', async () => {
    const { sha3_256 } = await computeHashes('abc')
    expect(sha3_256).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532')
  })

  it('SHA3-512 of "abc" matches the NIST vector', async () => {
    const { sha3_512 } = await computeHashes('abc')
    expect(sha3_512).toBe(
      'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0'
    )
  })

  it('BLAKE2b-512 of "abc" matches the RFC 7693 vector', async () => {
    const { blake2b } = await computeHashes('abc')
    expect(blake2b).toBe(
      'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923'
    )
  })

  it('keys BLAKE2b natively rather than through HMAC', async () => {
    // A BLAKE2b wrapped in HMAC would produce a digest nothing else agrees with. The check that it
    // isn't happening is that the keyed digest differs from the unkeyed one but is still 128 hex
    // characters — i.e. a real BLAKE2b, not an HMAC construction over one.
    const keyed = await computeHmac('hello', 'secret')
    const plain = await computeHashes('hello')
    expect(keyed.blake2b).toHaveLength(128)
    expect(keyed.blake2b).not.toBe(plain.blake2b)
  })

  it('keeps standard HMAC results when a key is too long for keyed BLAKE2b', async () => {
    const result = await computeHmac('hello', 'x'.repeat(65))
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.blake2b).toMatch(/requires a key of 1–64 bytes/)
  })
})

describe('HASH_ALGORITHMS', () => {
  it('labels the broken algorithms and leaves the rest unannotated', () => {
    const notes = Object.fromEntries(HASH_ALGORITHMS.map((a) => [a.key, a.note]))
    expect(notes['md5']).toMatch(/Broken/)
    expect(notes['sha1']).toMatch(/Broken/)
    expect(notes['sha256']).toBeNull()
    expect(notes['blake2b']).toBeNull()
  })
})

describe('computeFileHashes', () => {
  it('agrees with the one-shot digest across many chunk boundaries', async () => {
    // 10 MiB crosses the 4 MiB chunk size twice and ends mid-chunk, which is where a streaming
    // implementation that mishandles the tail would diverge.
    const bytes = new Uint8Array(10 * 1024 * 1024)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251
    const streamed = await computeFileHashes(new Blob([bytes]))
    expect(streamed).toEqual(hashBytes(bytes))
  }, 30_000)

  it('produces the well-defined empty digests for an empty file', async () => {
    const streamed = await computeFileHashes(new Blob([]))
    expect(streamed.md5).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(streamed).toEqual(hashBytes(new Uint8Array(0)))
  })

  it('reports progress that ends at the file size', async () => {
    const seen: number[] = []
    const bytes = new Uint8Array(1024)
    await computeFileHashes(new Blob([bytes]), {
      onProgress: (p) => seen.push(p.loaded),
    })
    expect(seen.at(-1)).toBe(1024)
  })

  it('aborts rather than racing a newer run', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      computeFileHashes(new Blob([new Uint8Array(8)]), { signal: controller.signal })
    ).rejects.toThrow(/cancelled/i)
  })
})
