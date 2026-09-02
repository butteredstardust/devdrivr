import { md5, sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { sha3_256, sha3_512 } from '@noble/hashes/sha3.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * The hash set, in the order it is displayed.
 *
 * MD5 and SHA-1 are both broken for anything security-bearing and stay because checksums published
 * against them are still everywhere — the UI labels them rather than hiding them. SHA-3 and BLAKE2b
 * were added because a menu of "two broken algorithms or SHA-2" is not a real choice: SHA-3 is the
 * standard successor and BLAKE2b is what most modern tooling actually reaches for.
 */
export type Hashes = {
  md5: string
  sha1: string
  sha256: string
  sha512: string
  sha3_256: string
  sha3_512: string
  blake2b: string
}

export type HashAlgorithmMeta = {
  key: keyof Hashes
  label: string
  bits: number
  /** Shown next to the label. `null` for the algorithms with nothing to warn about. */
  note: string | null
}

export const HASH_ALGORITHMS: HashAlgorithmMeta[] = [
  { key: 'md5', label: 'MD5', bits: 128, note: 'Broken — checksums only' },
  { key: 'sha1', label: 'SHA-1', bits: 160, note: 'Broken — checksums only' },
  { key: 'sha256', label: 'SHA-256', bits: 256, note: null },
  { key: 'sha512', label: 'SHA-512', bits: 512, note: null },
  { key: 'sha3_256', label: 'SHA3-256', bits: 256, note: null },
  { key: 'sha3_512', label: 'SHA3-512', bits: 512, note: null },
  { key: 'blake2b', label: 'BLAKE2b', bits: 512, note: null },
]

export async function computeHashes(input: string): Promise<Hashes> {
  const data = new TextEncoder().encode(input)
  return hashBytes(data)
}

/** Hash raw bytes. Separate from `computeHashes` so file input doesn't round-trip through a string. */
export function hashBytes(data: Uint8Array): Hashes {
  return {
    md5: bytesToHex(md5(data)),
    sha1: bytesToHex(sha1(data)),
    sha256: bytesToHex(sha256(data)),
    sha512: bytesToHex(sha512(data)),
    sha3_256: bytesToHex(sha3_256(data)),
    sha3_512: bytesToHex(sha3_512(data)),
    blake2b: bytesToHex(blake2b(data)),
  }
}

export async function computeHmac(input: string, secret: string): Promise<Hashes> {
  const key = new TextEncoder().encode(secret)
  const data = new TextEncoder().encode(input)
  return {
    md5: '(HMAC-MD5 not supported)',
    sha1: bytesToHex(hmac(sha1, key, data)),
    sha256: bytesToHex(hmac(sha256, key, data)),
    sha512: bytesToHex(hmac(sha512, key, data)),
    sha3_256: bytesToHex(hmac(sha3_256, key, data)),
    sha3_512: bytesToHex(hmac(sha3_512, key, data)),
    // BLAKE2b is keyed natively rather than through HMAC. Wrapping it in HMAC would produce a
    // digest no other tool agrees with, which is worse than not offering it.
    blake2b:
      key.length >= 1 && key.length <= 64
        ? bytesToHex(blake2b(data, { key }))
        : '(Keyed BLAKE2b requires a key of 1–64 bytes)',
  }
}

// ── File hashing ───────────────────────────────────────────────────

/**
 * Chunk size for streaming file hashes.
 *
 * 4 MiB is large enough that the per-chunk overhead disappears and small enough that a single
 * `arrayBuffer()` never allocates a copy of a multi-gigabyte artefact. Hashing an ISO is precisely
 * the case this feature exists for, so reading the whole file into memory first is not an option.
 */
const CHUNK_BYTES = 4 * 1024 * 1024

export type FileHashProgress = {
  /** Bytes hashed so far. */
  loaded: number
  total: number
}

/** Extract a digest from common sha256sum/md5sum checksum-file lines. */
export function parseChecksumFile(text: string, filename?: string): string | null {
  const target = filename?.trim()
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{32,128})\s+[* ]?(.*)$/i)
    if (!match) continue
    if (
      !target ||
      !match[2] ||
      match[2].trim() === target ||
      match[2].trim().endsWith(`/${target}`)
    ) {
      const digest = match[1]
      if (digest) return digest.toLowerCase()
    }
  }
  return null
}

/**
 * Hash a file incrementally, one chunk at a time.
 *
 * Every algorithm gets its own streaming instance and all seven are fed the same chunk, so the file
 * is read exactly once no matter how many digests are wanted. `onProgress` fires per chunk, which
 * is the only feedback available for a job that can legitimately run for a minute.
 *
 * `signal` matters more than it looks: dropping a second file while the first is still hashing is
 * an easy thing to do, and without cancellation the two runs race to set the same result.
 */
export async function computeFileHashes(
  file: Blob,
  options: { onProgress?: (progress: FileHashProgress) => void; signal?: AbortSignal } = {}
): Promise<Hashes> {
  const { onProgress, signal } = options

  const streams = {
    md5: md5.create(),
    sha1: sha1.create(),
    sha256: sha256.create(),
    sha512: sha512.create(),
    sha3_256: sha3_256.create(),
    sha3_512: sha3_512.create(),
    blake2b: blake2b.create(),
  }

  let offset = 0
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException('Hashing cancelled', 'AbortError')
    const end = Math.min(offset + CHUNK_BYTES, file.size)
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer())
    for (const stream of Object.values(streams)) stream.update(chunk)
    offset = end
    onProgress?.({ loaded: offset, total: file.size })
  }

  // An empty file still has a well-defined digest for every algorithm, and the loop above never
  // runs for one — the `digest()` calls below are what produce it.
  if (signal?.aborted) throw new DOMException('Hashing cancelled', 'AbortError')
  onProgress?.({ loaded: file.size, total: file.size })

  return {
    md5: bytesToHex(streams.md5.digest()),
    sha1: bytesToHex(streams.sha1.digest()),
    sha256: bytesToHex(streams.sha256.digest()),
    sha512: bytesToHex(streams.sha512.digest()),
    sha3_256: bytesToHex(streams.sha3_256.digest()),
    sha3_512: bytesToHex(streams.sha3_512.digest()),
    blake2b: bytesToHex(streams.blake2b.digest()),
  }
}

/** Stream a file through keyed digests without retaining the whole file in memory. */
export async function computeFileHmac(
  file: Blob,
  secret: string,
  options: { onProgress?: (progress: FileHashProgress) => void; signal?: AbortSignal } = {}
): Promise<Hashes> {
  const key = new TextEncoder().encode(secret)
  const streams = {
    sha1: hmac.create(sha1, key),
    sha256: hmac.create(sha256, key),
    sha512: hmac.create(sha512, key),
    sha3_256: hmac.create(sha3_256, key),
    sha3_512: hmac.create(sha3_512, key),
  }
  const blakeKey = key.length >= 1 && key.length <= 64 ? key : null
  const blakeStream = blakeKey ? blake2b.create({ key: blakeKey }) : null
  let offset = 0
  while (offset < file.size) {
    if (options.signal?.aborted) throw new DOMException('Hashing cancelled', 'AbortError')
    const end = Math.min(offset + CHUNK_BYTES, file.size)
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer())
    for (const stream of Object.values(streams)) stream.update(chunk)
    blakeStream?.update(chunk)
    offset = end
    options.onProgress?.({ loaded: offset, total: file.size })
  }
  if (options.signal?.aborted) throw new DOMException('Hashing cancelled', 'AbortError')
  options.onProgress?.({ loaded: file.size, total: file.size })
  return {
    md5: '(HMAC-MD5 not supported)',
    sha1: bytesToHex(streams.sha1.digest()),
    sha256: bytesToHex(streams.sha256.digest()),
    sha512: bytesToHex(streams.sha512.digest()),
    sha3_256: bytesToHex(streams.sha3_256.digest()),
    sha3_512: bytesToHex(streams.sha3_512.digest()),
    blake2b: blakeStream
      ? bytesToHex(blakeStream.digest())
      : '(Keyed BLAKE2b requires a key of 1–64 bytes)',
  }
}
