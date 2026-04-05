import { md5, sha1 } from '@noble/hashes/legacy.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export type Hashes = {
  md5: string
  sha1: string
  sha256: string
  sha512: string
}

export async function computeHashes(input: string): Promise<Hashes> {
  const data = new TextEncoder().encode(input)
  return {
    md5: bytesToHex(md5(data)),
    sha1: bytesToHex(sha1(data)),
    sha256: bytesToHex(sha256(data)),
    sha512: bytesToHex(sha512(data)),
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
  }
}
