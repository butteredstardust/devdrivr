import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const scriptPath = new URL('./waive-bun-audit.mjs', import.meta.url)

const runWaiver = (auditLog) => {
  const directory = mkdtempSync(join(tmpdir(), 'waive-bun-audit-'))
  const auditPath = join(directory, 'audit.log')
  writeFileSync(auditPath, auditLog)

  return spawnSync(process.execPath, [scriptPath.pathname, auditPath], {
    encoding: 'utf8',
  })
}

const shellQuoteAdvisory = `shell-quote <1.8.3
workspace:expo-app > react-native > shell-quote
GHSA-w7jw-789q-3m8p
`

const tarAdvisory = `tar <=7.5.18
workspace:expo-app > expo > tar
workspace:next-app > vercel > tar
GHSA-23hp-3jrh-7fpw
`

test('accepts the known advisories only in their expected legacy workspaces', () => {
  const result = runWaiver(`${shellQuoteAdvisory}\n${tarAdvisory}`)

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a known advisory when its expected dependency evidence changes', () => {
  const result = runWaiver(tarAdvisory.replace('workspace:next-app > vercel > tar\n', ''))

  assert.equal(result.status, 1)
  assert.match(result.stderr, /did not match expected audit evidence/)
})

test('rejects a known advisory when another workspace is exposed', () => {
  const result = runWaiver(`${tarAdvisory.trim()}\nworkspace:@t4/api > dependency > tar\n`)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /matched unexpected workspaces/)
})

test('rejects an unknown advisory', () => {
  const result = runWaiver(`dependency <1.0.0
workspace:cockpit > dependency
GHSA-aaaa-bbbb-cccc
`)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /found unwaived advisories/)
})
