import { describe, it, expect } from 'vitest'
import { computeHashes, computeHmac } from '../hash-generator/hash-utils'

describe('computeHashes', () => {
  it('MD5 of "hello"', async () => {
    const { md5 } = await computeHashes('hello')
    expect(md5).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('SHA-1 of "hello"', async () => {
    const { sha1 } = await computeHashes('hello')
    expect(sha1).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('SHA-256 of "hello"', async () => {
    const { sha256 } = await computeHashes('hello')
    expect(sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('SHA-512 of "hello"', async () => {
    const { sha512 } = await computeHashes('hello')
    expect(sha512).toBe(
      '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043'
    )
  })

  it('empty string returns all-zeros MD5', async () => {
    const { md5 } = await computeHashes('')
    expect(md5).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })
})

describe('computeHmac', () => {
  it('HMAC-SHA-256 of "hello" with key "secret"', async () => {
    const { sha256 } = await computeHmac('hello', 'secret')
    expect(sha256).toBe('88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b')
  })

  it('HMAC-SHA-1 of "hello" with key "secret"', async () => {
    const { sha1 } = await computeHmac('hello', 'secret')
    expect(sha1).toBe('5112055c05f944f85755efc5cd8970e194e9f45b')
  })

  it('HMAC-MD5 returns unsupported message', async () => {
    const { md5 } = await computeHmac('hello', 'secret')
    expect(md5).toBe('(HMAC-MD5 not supported)')
  })
})
