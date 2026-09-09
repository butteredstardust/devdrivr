import { describe, expect, it } from 'vitest'
import { apiRequestRowSchema } from '@/lib/schemas'

/**
 * The MCP tools once stored whatever JSON a client sent for `headers` and `auth`. The API Client
 * calls array methods on `headers`, so a stored header map crashed the tool on load. These cases
 * pin the recovery that keeps such rows usable.
 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    collection_id: 'api-requests-inbox',
    name: 'Create user',
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: '[]',
    body: '',
    body_mode: 'json',
    auth: '{"type":"none"}',
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('apiRequestRowSchema headers', () => {
  it('keeps a well-formed header array and fills the enabled default', () => {
    const parsed = apiRequestRowSchema.parse(
      row({ headers: '[{"key":"Accept","value":"application/json"}]' })
    )

    expect(parsed.headers).toEqual([{ key: 'Accept', value: 'application/json', enabled: true }])
  })

  it('recovers a header map written by an MCP import', () => {
    const parsed = apiRequestRowSchema.parse(
      row({ headers: '{"Accept":"application/json","X-Trace":"abc"}' })
    )

    expect(parsed.headers).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'X-Trace', value: 'abc', enabled: true },
    ])
  })

  it('returns an array for a scalar, a null and unparsable JSON', () => {
    expect(apiRequestRowSchema.parse(row({ headers: '"Accept: text/plain"' })).headers).toEqual([])
    expect(apiRequestRowSchema.parse(row({ headers: 'null' })).headers).toEqual([])
    expect(apiRequestRowSchema.parse(row({ headers: 'not json' })).headers).toEqual([])
  })

  it('drops header entries that carry a non-text value', () => {
    expect(
      apiRequestRowSchema.parse(row({ headers: '[{"key":"Accept","value":[1]}]' })).headers
    ).toEqual([])
  })
})

describe('apiRequestRowSchema auth', () => {
  it('keeps each supported auth type and strips unknown keys', () => {
    expect(apiRequestRowSchema.parse(row({ auth: '{"type":"bearer","token":"t"}' })).auth).toEqual({
      type: 'bearer',
      token: 't',
    })
    expect(
      apiRequestRowSchema.parse(
        row({ auth: '{"type":"basic","username":"u","password":"p","realm":"x"}' })
      ).auth
    ).toEqual({ type: 'basic', username: 'u', password: 'p' })
  })

  it('falls back to no auth for an unrecognised stored shape', () => {
    expect(apiRequestRowSchema.parse(row({ auth: '"bearer"' })).auth).toEqual({ type: 'none' })
    expect(apiRequestRowSchema.parse(row({ auth: '{"type":"oauth2"}' })).auth).toEqual({
      type: 'none',
    })
    expect(apiRequestRowSchema.parse(row({ auth: 'not json' })).auth).toEqual({ type: 'none' })
  })
})
