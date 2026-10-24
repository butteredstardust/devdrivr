/**
 * Writes a release's notes from the pull request that produced it.
 *
 * The notes live in the PR description between two markers, which render as nothing:
 *
 *   <!-- release-notes -->
 *   ## What’s fixed
 *   ...
 *   <!-- /release-notes -->
 *
 * Markers rather than a heading, because the notes carry their own `##` headings. This copies the
 * text between them, followed by the download line every release ends with, onto the GitHub
 * release. A PR without the markers leaves the release's default body alone.
 *
 *   node scripts/release-notes.mjs --tag devdrivr-v0.1.113 --pr 146
 *   node scripts/release-notes.mjs --tag devdrivr-v0.1.113 --sha <merge commit>
 *
 * Runs in the release workflow after the release is published, and from the "Release notes"
 * workflow to write or rewrite the notes of an existing release. Needs `gh` with GH_TOKEN.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DOWNLOAD_LINE = 'Download the installer for your platform from the assets below.'

export const START_MARKER = '<!-- release-notes -->'
export const END_MARKER = '<!-- /release-notes -->'

/** The text between the PR body's release-notes markers, or '' when they are missing. */
export function extractReleaseNotes(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n')
  const start = text.indexOf(START_MARKER)
  if (start === -1) return ''
  const from = start + START_MARKER.length
  const end = text.indexOf(END_MARKER, from)
  if (end === -1) return ''
  return text.slice(from, end).trim()
}

/** The release body: the notes, then the download line, which is never repeated. */
export function composeReleaseBody(notes) {
  const trimmed = notes.trim()
  if (trimmed === '') return ''
  const withoutDownload = trimmed.endsWith(DOWNLOAD_LINE)
    ? trimmed.slice(0, -DOWNLOAD_LINE.length).trimEnd()
    : trimmed
  return `${withoutDownload}\n\n${DOWNLOAD_LINE}\n`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    const value = argv[i + 1]
    if (!key || value === undefined) throw new Error(`Missing value for ${argv[i]}`)
    args[key] = value
  }
  return args
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()

function run() {
  const { tag, pr, sha } = parseArgs(process.argv.slice(2))
  if (!tag || (!pr && !sha)) {
    throw new Error('Usage: release-notes.mjs --tag <tag> (--pr <number> | --sha <commit>)')
  }
  const repo =
    process.env.GITHUB_REPOSITORY ||
    gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner')
  const number = pr || gh('api', `repos/${repo}/commits/${sha}/pulls`, '-q', '.[0].number')
  if (!number) {
    console.log(`No pull request found for ${sha}; ${tag} keeps its default notes.`)
    return
  }
  const body = composeReleaseBody(
    extractReleaseNotes(gh('pr', 'view', number, '--repo', repo, '--json', 'body', '-q', '.body'))
  )
  if (body === '') {
    console.log(`PR #${number} has no release-notes markers; ${tag} keeps its default notes.`)
    return
  }
  const file = join(mkdtempSync(join(tmpdir(), 'release-notes-')), 'notes.md')
  writeFileSync(file, body)
  gh('release', 'edit', tag, '--repo', repo, '--notes-file', file)
  console.log(`Wrote the notes of ${tag} from PR #${number}.`)
}

// Only run as a CLI, so the unit tests can import the pure functions.
if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) run()
