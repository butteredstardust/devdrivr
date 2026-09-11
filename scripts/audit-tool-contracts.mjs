#!/usr/bin/env bun
/**
 * Tool contract audit.
 *
 * Every tool sits behind the same shell: one keyboard map, one file-drop path, one action bus, one
 * state store. A tool joins each of those by declaring a capability in `src/app/tool-registry.ts`
 * and implementing the matching half in its own source. Nothing checks that the two halves agree.
 *
 * A disagreement is invisible. TypeScript sees an optional boolean and a string comparison, both
 * valid. The tool simply stops answering a shortcut, or answers a drop the shell has already
 * refused. The Image Tool carried five of these at once — the drop it never received, the ⌘O that
 * refused it, the ⌘S that did nothing, a dead React `onDrop`, and a paste listener that also ate
 * the notes drawer's pastes.
 *
 * This walks the registry and each tool's source, then reports where the halves disagree. Every
 * rule below is a bug that shipped, not a style preference.
 *
 * The check is textual. A tool that reaches a contract through a wrapper this cannot see is a
 * false positive — annotate it with `/* tool-contract-ignore: <rule> <reason> *​/` anywhere in the
 * tool's source. The reason is mandatory.
 *
 * Usage:
 *   bun scripts/audit-tool-contracts.mjs            report and exit 0
 *   bun scripts/audit-tool-contracts.mjs --matrix   also print the capability matrix
 *   bun scripts/audit-tool-contracts.mjs --gate     exit 1 when a finding survives
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const REGISTRY = join(ROOT, 'src/app/tool-registry.ts')
const TOOLS_DIR = join(ROOT, 'src/tools')

/**
 * What each signal means, and how it is spotted in a tool's source.
 *
 * Keep these narrow. A broad pattern that matches a comment or a variable name turns the whole
 * report into noise, and a noisy report gets ignored — which is the failure mode this exists to
 * prevent.
 */
export const SIGNALS = {
  handlesOpenFile: /['"]open-file['"]/,
  handlesOpenFileDialog: /['"]open-file-dialog['"]/,
  handlesSaveFile: /['"]save-file['"]/,
  handlesCopyOutput: /['"]copy-output['"]/,
  usesToolAction: /\buseToolAction\s*[<(]/,
  rawSubscribe: /\bsubscribeToolAction\s*[<(]/,
  nativeDrop: /\bonDragDropEvent\b/,
  htmlDrop: /\bonDrop\s*[=:]/,
  // Only the events another region competes for. A `mousedown` click-outside handler that
  // hit-tests its own ref is correct and must not be reported, or the report becomes noise.
  globalListener:
    /\b(?:document|window)\.addEventListener\s*\(\s*['"](?:paste|copy|cut|keydown|keyup|keypress|drop)['"]/,
  instanceActive: /\buseIsInstanceActive\b/,
  // `[<(]` because these hooks are routinely called with an explicit type argument.
  toolState: /\buseToolState\s*[<(]/,
}

/**
 * One rule per bug that shipped.
 *
 * `when` receives the tool's registry flags and source signals. Return true to report. `detail`
 * states what the user sees, because a finding nobody can picture never gets fixed.
 */
export const RULES = [
  {
    id: 'open-file-flag-dead',
    when: (t) => t.supportsOpenFile && !t.handlesOpenFile,
    detail:
      'Registered for Open File but handles no `open-file` action. ⌘O reports success and nothing arrives.',
  },
  {
    id: 'open-file-flag-missing',
    when: (t) => t.handlesOpenFile && !t.supportsOpenFile && !t.ownsOpenFile,
    detail:
      'Handles `open-file` but is not registered for it. ⌘O answers "not supported by the active tool", and a file opened from the OS routes elsewhere.',
  },
  {
    id: 'save-file-flag-dead',
    when: (t) => t.supportsSaveFile && !t.handlesSaveFile,
    detail: 'Registered for Save Output but handles no `save-file` action. ⌘S does nothing.',
  },
  {
    id: 'save-file-flag-missing',
    when: (t) => t.handlesSaveFile && !t.supportsSaveFile,
    detail:
      'Handles `save-file` but is not registered for it. ⌘S answers "not supported by the active tool" and never reaches the handler.',
  },
  {
    id: 'owns-open-file-unhandled',
    when: (t) => t.ownsOpenFile && !t.handlesOpenFileDialog,
    detail:
      'Declares `ownsOpenFile` but handles no `open-file-dialog` action. ⌘O dispatches into the void.',
  },
  {
    id: 'owns-open-file-unregistered',
    when: (t) => t.handlesOpenFileDialog && !t.ownsOpenFile,
    detail:
      'Handles `open-file-dialog` but lacks `ownsOpenFile`. The shell reads the file as text instead, which rejects binary data.',
  },
  {
    id: 'html-drop-is-dead',
    when: (t) => t.htmlDrop,
    detail:
      'React `onDrop` in a tool. Tauri runs with `dragDropEnabled`, claims the OS drop, and the webview never fires an HTML5 drop event. This handler is dead in the desktop window.',
  },
  {
    id: 'native-drop-unregistered',
    when: (t) => t.nativeDrop && !t.ownsFileDrop,
    detail:
      'Listens with `onDragDropEvent` but lacks `ownsFileDrop`. The shell claims the same drop and answers "File drop is not supported by the active tool".',
  },
  {
    id: 'owns-drop-unhandled',
    when: (t) => t.ownsFileDrop && !t.nativeDrop,
    detail:
      'Declares `ownsFileDrop` but never calls `onDragDropEvent`. The shell stays silent and nothing handles the drop.',
  },
  {
    id: 'ungated-global-listener',
    when: (t) => t.globalListener && !t.instanceActive,
    detail:
      'Listens on `document` or `window` without `useIsInstanceActive`. Backgrounded tabs stay mounted, and the notes drawer renders beside every tool, so the handler also claims events meant for them.',
  },
  {
    id: 'raw-action-subscription',
    when: (t) => t.rawSubscribe && !t.usesToolAction,
    detail:
      'Calls `subscribeToolAction` directly instead of `useToolAction`. That skips the shared active-tab gate and the pending-action claim, so a file opened from the OS never arrives.',
  },
]

const IGNORE = /tool-contract-ignore:\s*([\w-]+)\s+(\S.*)/g

/** Every `.ts`/`.tsx` file under a directory, excluding tests. */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Registry entries, with their capability flags and the directory holding their source.
 *
 * The directory comes from the `lazy(() => import('@/tools/<dir>/<File>'))` line the entry's
 * component names, not from the tool id. The two match today, and a tool whose directory cannot be
 * resolved is reported rather than skipped — a silently skipped tool is the hole this closes.
 */
export function parseRegistry(text) {
  const imports = new Map()
  for (const [, name, dir] of text.matchAll(
    /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('@\/tools\/([\w-]+)\//g
  )) {
    imports.set(name, dir)
  }

  const tools = []
  for (const [, body] of text.matchAll(/\{\s*(id:\s*'[\w-]+'[\s\S]*?)\n\s*\},/g)) {
    const id = body.match(/id:\s*'([\w-]+)'/)?.[1]
    if (!id) continue
    const component = body.match(/component:\s*(\w+)/)?.[1]
    tools.push({
      id,
      dir: component ? imports.get(component) : undefined,
      supportsOpenFile: /supportsOpenFile:\s*true/.test(body),
      supportsSaveFile: /supportsSaveFile:\s*true/.test(body),
      ownsFileDrop: /ownsFileDrop:\s*true/.test(body),
      ownsOpenFile: /ownsOpenFile:\s*true/.test(body),
      usesMonaco: /usesMonaco:\s*true/.test(body),
    })
  }
  return tools
}

/** Signal values for one tool, from the concatenated text of its source files. */
export function readSignals(text) {
  const signals = {}
  for (const [name, pattern] of Object.entries(SIGNALS)) signals[name] = pattern.test(text)
  return signals
}

/** Findings for one tool, after its own ignore comments are applied. */
export function auditTool(tool, text) {
  const ignored = new Map()
  for (const [, rule, reason] of text.matchAll(IGNORE)) ignored.set(rule, reason.trim())
  const subject = { ...tool, ...readSignals(text) }
  return RULES.filter((rule) => rule.when(subject) && !ignored.has(rule.id)).map((rule) => ({
    tool: tool.id,
    rule: rule.id,
    detail: rule.detail,
  }))
}

const MATRIX_COLUMNS = [
  ['open', (t) => t.supportsOpenFile, (t) => t.handlesOpenFile],
  ['save', (t) => t.supportsSaveFile, (t) => t.handlesSaveFile],
  ['drop', (t) => t.ownsFileDrop, (t) => t.nativeDrop],
  ['dialog', (t) => t.ownsOpenFile, (t) => t.handlesOpenFileDialog],
]

/** `·` neither half, `✓` both, `!` one half only. */
function cell(tool, declared, implemented) {
  const d = declared(tool)
  const i = implemented(tool)
  if (d && i) return '✓'
  if (d || i) return '!'
  return '·'
}

function printMatrix(subjects) {
  const width = Math.max(...subjects.map((t) => t.id.length))
  const header = MATRIX_COLUMNS.map(([name]) => name.padEnd(6)).join(' ')
  console.log(`\n${'tool'.padEnd(width)}  ${header}  state  gate`)
  for (const tool of subjects) {
    const cells = MATRIX_COLUMNS.map(([, d, i]) => cell(tool, d, i).padEnd(6)).join(' ')
    const state = tool.toolState ? '✓' : '·'
    const gate = tool.globalListener ? (tool.instanceActive ? '✓' : '!') : '·'
    console.log(`${tool.id.padEnd(width)}  ${cells}  ${state.padEnd(5)}  ${gate}`)
  }
}

function run() {
  const tools = parseRegistry(readFileSync(REGISTRY, 'utf8'))
  const findings = []
  const subjects = []

  for (const tool of tools) {
    if (!tool.dir) {
      findings.push({
        tool: tool.id,
        rule: 'unresolved-source',
        detail: 'No `lazy(() => import(...))` line resolves this entry, so its source was not read.',
      })
      continue
    }
    const dir = join(TOOLS_DIR, tool.dir)
    const files = sourceFiles(dir)
    const text = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    subjects.push({ ...tool, ...readSignals(text) })
    findings.push(...auditTool(tool, text))
  }

  if (process.argv.includes('--matrix')) printMatrix(subjects)

  if (findings.length === 0) {
    console.log(`\ntool-contracts: ${tools.length} tools, no findings`)
    return 0
  }

  const byRule = new Map()
  for (const finding of findings) {
    if (!byRule.has(finding.rule)) byRule.set(finding.rule, [])
    byRule.get(finding.rule).push(finding)
  }

  console.log(`\ntool-contracts: ${findings.length} findings across ${tools.length} tools\n`)
  for (const [rule, group] of byRule) {
    console.log(`${rule} — ${group[0].detail}`)
    for (const finding of group) console.log(`  ${finding.tool}`)
    console.log('')
  }
  console.log(`Registry: ${relative(ROOT, REGISTRY)}`)
  return process.argv.includes('--gate') ? 1 : 0
}

if (import.meta.main) process.exit(run())
