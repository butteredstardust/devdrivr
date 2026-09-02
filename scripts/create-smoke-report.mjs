import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { arch, platform, release, type } from 'node:os'
import { basename, dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLATFORMS = {
  'darwin-aarch64': {
    artifact: (version) => `devdrivr_${version}_aarch64.dmg`,
    host: { platform: 'darwin', arch: 'arm64' },
  },
  'windows-x86_64': {
    artifact: (version) => `devdrivr_${version}_x64-setup.exe`,
    host: { platform: 'win32', arch: 'x64' },
  },
  'linux-x86_64': {
    artifact: (version) => `devdrivr_${version}_amd64.AppImage`,
    host: { platform: 'linux', arch: 'x64' },
  },
}

const HELP = `Create an artifact-bound devdrivr release smoke report.

Usage:
  bun run smoke:report -- \\
    --version <semver> \\
    --platform <platform-key> \\
    --artifact <downloaded-release-artifact> \\
    --tester <name> \\
    --environment <native-vm-or-emulation-details> \\
    [--output <report.md>] [--force]

Platform keys:
  ${Object.keys(PLATFORMS).join('\n  ')}
`

function parseArgs(args) {
  const options = { force: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (!arg?.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    options[arg.slice(2)] = value
    index += 1
  }
  return options
}

function requireOption(options, key) {
  const value = options[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required option: --${key}`)
  }
  return value.trim()
}

function escapeMarkdown(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function isSameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

async function fileExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }

  const version = requireOption(options, 'version')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid semantic version: ${version}`)
  }
  const platformKey = requireOption(options, 'platform')
  const tester = requireOption(options, 'tester')
  const validationEnvironment = requireOption(options, 'environment')
  const artifactPath = resolve(requireOption(options, 'artifact'))
  const selectedPlatform = PLATFORMS[platformKey]
  if (!selectedPlatform) {
    throw new Error(`Unsupported platform key: ${platformKey}`)
  }
  const hostPlatform = platform()
  const hostArch = arch()
  if (hostPlatform !== selectedPlatform.host.platform || hostArch !== selectedPlatform.host.arch) {
    throw new Error(
      `Platform "${platformKey}" must be validated on ${selectedPlatform.host.platform}/${selectedPlatform.host.arch}; current host is ${hostPlatform}/${hostArch}`
    )
  }
  const expectedArtifact = selectedPlatform.artifact(version)
  if (basename(artifactPath) !== expectedArtifact) {
    throw new Error(`Expected artifact "${expectedArtifact}", received "${basename(artifactPath)}"`)
  }
  const normalizedPath = artifactPath.split(sep).join('/')
  if (
    normalizedPath.includes('/src-tauri/target/') ||
    normalizedPath.includes('/target/release/')
  ) {
    throw new Error('Use an artifact downloaded from GitHub Releases, not local build output')
  }
  const artifactStats = await stat(artifactPath)
  if (!artifactStats.isFile()) throw new Error(`Artifact is not a file: ${artifactPath}`)

  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const templatePath = resolve(scriptDir, '../documentation/RELEASE_SMOKE_REPORT_TEMPLATE.md')
  const templateStats = await stat(templatePath)
  const defaultOutput = resolve(
    scriptDir,
    `../documentation/release-smoke-results/${version}-${platformKey}.md`
  )
  const outputPath = resolve(options.output ?? defaultOutput)
  if (extname(outputPath).toLowerCase() !== '.md') {
    throw new Error('Smoke report output must use the .md extension')
  }
  if (outputPath === artifactPath || outputPath === templatePath) {
    throw new Error('Smoke report output cannot replace the artifact or report template')
  }
  let existingOutputStats
  if (await fileExists(outputPath)) {
    if (!options.force) {
      throw new Error(`Report already exists: ${outputPath}. Pass --force to replace it.`)
    }
    const outputLinkStats = await lstat(outputPath)
    if (outputLinkStats.isSymbolicLink()) {
      throw new Error('--force cannot replace a symbolic link')
    }
    existingOutputStats = await stat(outputPath)
    if (
      isSameFile(existingOutputStats, artifactStats) ||
      isSameFile(existingOutputStats, templateStats)
    ) {
      throw new Error('Smoke report output cannot alias the artifact or report template')
    }
    const existingReport = await readFile(outputPath, 'utf8')
    if (!existingReport.startsWith('# devdrivr Release Smoke Report\n')) {
      throw new Error('--force can replace only an existing devdrivr release smoke report')
    }
  }

  const sha256 = await sha256File(artifactPath)
  const generatedAt = new Date().toISOString()
  const osVersion = `${type()} ${release()} (${platform()} ${arch()})`
  const replacements = {
    '{{VERSION}}': escapeMarkdown(version),
    '{{PLATFORM_KEY}}': escapeMarkdown(platformKey),
    '{{ARTIFACT_NAME}}': escapeMarkdown(expectedArtifact),
    '{{ARTIFACT_PATH}}': escapeMarkdown(artifactPath),
    '{{ARTIFACT_SIZE}}': artifactStats.size.toLocaleString('en-US'),
    '{{ARTIFACT_SHA256}}': sha256,
    '{{OS_VERSION}}': escapeMarkdown(osVersion),
    '{{VALIDATION_ENVIRONMENT}}': escapeMarkdown(validationEnvironment),
    '{{TESTER}}': escapeMarkdown(tester),
    '{{GENERATED_AT}}': generatedAt,
  }

  let report = await readFile(templatePath, 'utf8')
  for (const [placeholder, value] of Object.entries(replacements)) {
    report = report.replaceAll(placeholder, value)
  }

  await mkdir(dirname(outputPath), { recursive: true })
  if (existingOutputStats) {
    const output = await open(outputPath, 'r+')
    try {
      const openedStats = await output.stat()
      if (!isSameFile(openedStats, existingOutputStats)) {
        throw new Error('Smoke report output changed during validation; refusing to overwrite')
      }
      await output.truncate(0)
      await output.writeFile(report, 'utf8')
    } finally {
      await output.close()
    }
  } else {
    await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx' })
  }
  console.log(`Created smoke report: ${outputPath}`)
}

main().catch((error) => {
  console.error(`Smoke report error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
