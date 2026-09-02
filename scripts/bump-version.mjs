import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const packageJsonPath = path.join(root, 'package.json')
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml')
const cargoLockPath = path.join(root, 'src-tauri', 'Cargo.lock')

function bump(version) {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3) return version
  parts[2] += 1 // Increment patch
  return parts.join('.')
}

/**
 * Rewrite the `version` field in place, editing the text rather than re-serialising the parsed
 * object. `JSON.stringify(conf, null, 2)` expands every inline array, which prettier (via
 * lint-staged) then collapses again on the next human commit — so each release used to leave
 * unrelated formatting churn in tauri.conf.json and the two tools took turns undoing each other.
 */
function replaceOnce(filePath, needle, replacement) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const occurrences = raw.split(needle).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `Expected exactly one \`${needle.replace(/\n/g, '\\n')}\` in ${path.basename(filePath)}, ` +
        `found ${occurrences}`
    )
  }
  fs.writeFileSync(filePath, raw.replace(needle, replacement))
}

function writeVersion(filePath, oldVersion, newVersion) {
  replaceOnce(filePath, `"version": "${oldVersion}"`, `"version": "${newVersion}"`)
}

try {
  // 1. Bump package.json
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const oldVersion = pkg.version
  const newVersion = bump(oldVersion)
  writeVersion(packageJsonPath, oldVersion, newVersion)
  console.log(`Bumping package.json: ${oldVersion} -> ${newVersion}`)

  // 2. Bump tauri.conf.json
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'))
  if (tauriConf.version !== oldVersion) {
    throw new Error(
      `tauri.conf.json is at ${tauriConf.version} but package.json is at ${oldVersion}`
    )
  }
  writeVersion(tauriConfPath, oldVersion, newVersion)
  console.log(`Bumping tauri.conf.json: ${oldVersion} -> ${newVersion}`)

  // 3. Bump the Rust crate, and the entry Cargo.lock keeps for it. Nothing user-facing reads this
  // version — the bundle takes its version from tauri.conf.json — but leaving it behind means
  // `cargo` output, panic reports and the lockfile all name a version that shipped long ago.
  // Rewriting the lock here also keeps `cargo build` from dirtying the tree on every release.
  replaceOnce(cargoTomlPath, `\nversion = "${oldVersion}"\n`, `\nversion = "${newVersion}"\n`)
  replaceOnce(
    cargoLockPath,
    `name = "devdrivr"\nversion = "${oldVersion}"`,
    `name = "devdrivr"\nversion = "${newVersion}"`
  )
  console.log(`Bumping Cargo.toml + Cargo.lock: ${oldVersion} -> ${newVersion}`)

  // Output for CI
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${newVersion}\n`)
  }
} catch (err) {
  console.error('Failed to bump version:', err)
  process.exit(1)
}
