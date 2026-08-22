import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARGO_DEPENDENCIES,
  FONTS,
  NPM_DEPENDENCIES,
  licenseKeysFor,
  type Attribution,
} from '../acknowledgments'
import { LICENSE_TEXTS } from '../license-texts'

/**
 * Guards for the two hand-maintained attribution lists.
 *
 * They have to be hand-maintained: the app ships as a compiled bundle with no node_modules and no
 * cargo registry beside it, so nothing can be read at runtime. That makes them correct on the day
 * they are written and quietly wrong three `bun add`s later — and wrong with no symptom, because
 * the tab still renders a perfectly plausible list, just not of what we actually ship. Nothing in
 * the UI can notice that. These assertions are what notices.
 *
 * Manifests are parsed off disk rather than imported so the test reads the same files a reviewer
 * would check by hand, instead of whatever the bundler resolved.
 */

const APP_ROOT = path.resolve(__dirname, '../../..')

const readText = (...segments: string[]) =>
  fs.readFileSync(path.join(APP_ROOT, ...segments), 'utf8')

describe('npm attribution', () => {
  const manifest = JSON.parse(readText('package.json')) as { dependencies?: Record<string, string> }
  // `dependencies` only. devDependencies are build-time tooling that never reaches a user's
  // machine, so they carry no notice obligation and are deliberately uncredited.
  const runtimeDependencies = Object.keys(manifest.dependencies ?? {})
  const credited = new Map(NPM_DEPENDENCIES.map((item) => [item.name, item]))

  it('credits every runtime dependency', () => {
    const uncredited = runtimeDependencies.filter((name) => !credited.has(name))
    expect(uncredited).toEqual([])
  })

  it('credits nothing that is no longer a dependency', () => {
    const dependencies = new Set(runtimeDependencies)
    const orphaned = [...credited.keys()].filter((name) => !dependencies.has(name))
    expect(orphaned).toEqual([])
  })

  it('records the version that is actually installed', () => {
    // Read the package manifest straight off disk: `require('pkg/package.json')` is refused by any
    // package whose `exports` map does not list it, which several of these do not.
    const drift = [...credited.values()].flatMap((item) => {
      const file = path.join(APP_ROOT, 'node_modules', ...item.name.split('/'), 'package.json')
      // A partial install should not fail the suite — that is a broken checkout, not stale credit.
      if (!fs.existsSync(file)) return []
      const installed = (JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }).version
      if (!installed || installed === item.version) return []
      return [`${item.name}: credited ${item.version}, installed ${installed}`]
    })
    expect(drift).toEqual([])
  })
})

describe('cargo attribution', () => {
  const cargoToml = readText('src-tauri', 'Cargo.toml')

  /**
   * Direct dependencies declared in `Cargo.toml`, across the plain, build and per-target tables.
   * Build dependencies are included because `tauri-build` is credited — it generates code that
   * ends up in the binary.
   *
   * `optional = true` crates are excluded: they are feature-gated and absent from a default build.
   * That is what keeps AGPL-licensed `tauri-remote-ui` out of the credits, and out of anything we
   * ship. The check only looks at the line the crate is named on, so an optional crate declared as
   * a multi-line table would be treated as required — which fails loudly, the safe direction.
   */
  const directCrates = (() => {
    const names: string[] = []
    let inDependencyTable = false
    for (const line of cargoToml.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[')) {
        inDependencyTable = /^\[(target\.[^\]]+\.)?(build-)?dependencies\]$/.test(trimmed)
        continue
      }
      if (!inDependencyTable || trimmed === '' || trimmed.startsWith('#')) continue
      const declaration = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed)
      if (declaration && !/optional\s*=\s*true/.test(trimmed)) names.push(declaration[1]!)
    }
    return names
  })()

  const credited = new Map(CARGO_DEPENDENCIES.map((item) => [item.name, item]))

  it('finds the dependency tables it is supposed to be checking', () => {
    // Guards the parser itself: a Cargo.toml restructure that silently matched nothing would make
    // every other assertion in this block vacuously pass.
    expect(directCrates).toContain('tauri')
    expect(directCrates).toContain('tauri-build')
    expect(directCrates).toContain('objc2-app-kit')
    expect(directCrates).not.toContain('tauri-remote-ui')
  })

  it('credits every direct crate that ships', () => {
    const uncredited = directCrates.filter((name) => !credited.has(name))
    expect(uncredited).toEqual([])
  })

  it('credits nothing that is no longer a direct crate', () => {
    const direct = new Set(directCrates)
    const orphaned = [...credited.keys()].filter((name) => !direct.has(name))
    expect(orphaned).toEqual([])
  })

  it('records a version the lockfile actually resolved', () => {
    // A crate can appear in the lock more than once when the graph pulls two major versions, so
    // this asserts membership rather than equality.
    const resolved = new Map<string, Set<string>>()
    const lock = readText('src-tauri', 'Cargo.lock')
    for (const entry of lock.split('[[package]]').slice(1)) {
      const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(entry)?.[1]
      const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(entry)?.[1]
      if (!name || !version) continue
      resolved.set(name, (resolved.get(name) ?? new Set()).add(version))
    }
    expect(resolved.size).toBeGreaterThan(0)

    const drift = [...credited.values()].flatMap((item) => {
      const versions = resolved.get(item.name)
      if (!versions) return [`${item.name}: absent from Cargo.lock`]
      if (versions.has(item.version)) return []
      return [`${item.name}: credited ${item.version}, locked ${[...versions].join(', ')}`]
    })
    expect(drift).toEqual([])
  })
})

describe('license notice', () => {
  const everything: readonly Attribution[] = [...NPM_DEPENDENCIES, ...CARGO_DEPENDENCIES, ...FONTS]

  it('reproduces the full text of every licence named', () => {
    // The load-bearing one. AcknowledgmentsTab filters its "License texts" section down to keys
    // present in LICENSE_TEXTS, so a licence with no text is not an error there — it just silently
    // does not appear, while the tab goes on promising that every licence is reproduced below.
    const named = [...new Set(everything.flatMap((item) => licenseKeysFor(item.license)))].sort()
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter((key) => !(key in LICENSE_TEXTS))).toEqual([])
  })

  it('carries no licence text nothing is offered under', () => {
    const named = new Set(everything.flatMap((item) => licenseKeysFor(item.license)))
    expect(Object.keys(LICENSE_TEXTS).filter((key) => !named.has(key))).toEqual([])
  })

  it('names a licence for every credited item', () => {
    expect(everything.filter((item) => item.license.trim() === '').map((i) => i.name)).toEqual([])
  })
})
