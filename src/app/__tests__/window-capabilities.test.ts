import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Capability = { permissions: Array<string | { identifier: string }> }

function grantedPermissions(): string[] {
  const capability = JSON.parse(
    readFileSync(resolve(__dirname, '../../../src-tauri/capabilities/default.json'), 'utf8')
  ) as Capability
  return capability.permissions.map((p) => (typeof p === 'string' ? p : p.identifier))
}

describe('window capabilities', () => {
  // WARNING: A JS `onCloseRequested` listener takes over the close. After the handler runs, the
  // listener calls `window.destroy()`. Without this permission Tauri rejects that call silently,
  // and the close (x) button does nothing. The Providers tests mock the window, so they cannot
  // catch this.
  it('grants window destroy, which the close-requested flush handler needs', () => {
    expect(grantedPermissions()).toContain('core:window:allow-destroy')
  })
})
