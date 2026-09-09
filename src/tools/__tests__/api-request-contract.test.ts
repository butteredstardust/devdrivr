import { describe, expect, it } from 'vitest'
import contract from '../../../shared/api-request-contract.json'
import { BODY_METHODS, METHODS } from '@/tools/api-client/request-model'
import { BODY_MODE_IDS } from '@/lib/api-import'

/**
 * The API request contract is shared with the Rust MCP service, which asserts against the same
 * file. A method or body mode added on one side and forgotten on the other fails here instead of
 * reaching a user as a saved request the API Client cannot send.
 */
describe('shared API request contract', () => {
  it('matches the methods the API Client offers', () => {
    expect([...METHODS]).toEqual(contract.methods)
  })

  it('matches the methods that carry a body', () => {
    expect([...BODY_METHODS].sort()).toEqual([...contract.bodyMethods].sort())
  })

  it('matches the body modes the API Client renders', () => {
    expect([...BODY_MODE_IDS].sort()).toEqual([...contract.bodyModes].sort())
  })
})
