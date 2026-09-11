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
 * Detection reads a real parse, not the file text. Each source file becomes a list of facts —
 * calls, imports, comparisons, listeners — that carry a file and a line. Three things follow:
 * a finding says where it is, a name inside a comment or a string cannot pass for code, and a rule
 * can ask about one call rather than about the whole directory. The last one matters most: while
 * signals were per-directory booleans, one correctly gated listener hid every ungated one beside
 * it.
 *
 * What this cannot see. Detection reads names and literals, not types, so four forms pass:
 * an import renamed on the way in (`import { useMonaco as editorHook }`), a value reached through
 * a constant or a template string, a call behind an `as` assertion, and an entry built from a
 * spread. Closing these needs the type checker, and a whole-program check is a different tool.
 * `parseRegistry` stops the run rather than report on the entries it managed to read.
 *
 * A tool that reaches a contract through a wrapper this cannot see is a false positive — annotate
 * it with `/* tool-contract-ignore: <rule> <reason> *​/` anywhere in the tool's source. The reason
 * is mandatory.
 *
 * Usage:
 *   bun scripts/audit-tool-contracts.mjs            report and exit 0
 *   bun scripts/audit-tool-contracts.mjs --matrix   also print the capability matrix
 *   bun scripts/audit-tool-contracts.mjs --gate     exit 1 when a finding survives
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = new URL('..', import.meta.url).pathname
const REGISTRY = join(ROOT, 'src/app/tool-registry.ts')
const TOOLS_DIR = join(ROOT, 'src/tools')
const SRC_DIR = join(ROOT, 'src')
const WORKERS_DIR = join(ROOT, 'src/workers')

// ─── Facts ──────────────────────────────────────────────────────────
//
// One fact per node a rule can ask about. `name` is the thing being named — a callee, a module
// specifier, an event — and `args` holds the argument source text, so a rule can ask what was
// passed without walking the tree itself.

/** The hooks that register a native file drop on a tool's behalf. */
const DROP_REGISTRARS = new Set([
  'useNativeFileDrop',
  'useImageFileDrop',
  'useImageDrop',
  'useNoteImageAttachments',
])

/** Events another region of the shell competes for. A `mousedown` click-outside is not one. */
const CONTESTED_EVENTS = new Set(['paste', 'copy', 'cut', 'keydown', 'keyup', 'keypress', 'drop'])

/**
 * An expression that carries the instance gate.
 *
 * The list is closed, and the match is anchored at the start. A gate reads either as the flag on
 * its own, or as the flag narrowed further: `isInstanceActive && state.mode === 'encode'`. A bare
 * `enabled` is a wrapper hook forwarding its own parameter, and the caller passing that parameter
 * is checked at its own call site.
 *
 * An open pattern certified its own opposite. `\bis\w*Active\b` accepted `isNotActive` and
 * `isInactive`, and `\bactive\b` accepted `{ active: false }` and the string `'active'`.
 */
const ACTIVITY = /^(isInstanceActive|isActive|enabled)\b(\s*&&|$)/

/** The same gate, named anywhere inside an enclosing function. A raw listener guards itself. */
const ACTIVITY_IN_SCOPE = /\b(isInstanceActive|isActive|enabled)\b/

/** True when a function around this node names the gate. */
function inGatedScope(node, source) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) && ACTIVITY_IN_SCOPE.test(current.getText(source))) return true
  }
  return false
}

/** Both forms of an equality test. A tool answers an action with either one. */
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

/** The simple name a call expression invokes: `foo()`, `a.b.foo()` and `a.foo<T>()` all give `foo`. */
function calleeName(node) {
  const target = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name
    : node.expression
  return ts.isIdentifier(target) ? target.text : undefined
}

/** The object a method is called on, or undefined: `document.addEventListener` gives `document`. */
function calleeTarget(node) {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined
  const target = node.expression.expression
  return ts.isIdentifier(target) ? target.text : undefined
}

function literalOf(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined
}

/**
 * Facts for one source file.
 *
 * Comments and string contents never become facts, which is the point. A tool that embeds a sample
 * document containing `onDrop` or `<h1>` is describing HTML, not writing a handler.
 */
export function factsForFile(file, text) {
  // Parse a `.ts` file as TS, not as TSX. TSX reads the angle-bracket assertion `<Foo>value` as an
  // unterminated JSX element and drops every fact after it.
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const facts = []

  const at = (node) => ({
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  })

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node)
      if (name) {
        const args = node.arguments.map((argument) => argument.getText(source))
        facts.push({
          kind: 'call',
          name,
          target: calleeTarget(node),
          args,
          // A raw listener takes no gate argument, so its gate is the guard around it.
          gated: name === 'onDragDropEvent' ? inGatedScope(node, source) : undefined,
          ...at(node),
        })

        if (name === 'addEventListener') {
          const target = calleeTarget(node)
          const event = literalOf(node.arguments[0])
          if ((target === 'document' || target === 'window') && event) {
            facts.push({ kind: 'listener', name: event, target, ...at(node) })
          }
        }
      }
    }

    // `new Worker(...)` — a construction is a node of its own, not a call expression.
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      facts.push({ kind: 'new', name: node.expression.text, ...at(node) })
    }

    // `action.type === 'open-file'` — the tool answering an action from the shared bus. The
    // negated form counts too: an early `if (action.type !== 'save-file') return` is the same
    // handler written inside out, and it is the form half the tools use.
    if (ts.isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) {
      const value = literalOf(node.right) ?? literalOf(node.left)
      if (value) facts.push({ kind: 'compare', name: value, ...at(node) })
    }

    // `case 'open-file':` reads the same way a comparison does.
    if (ts.isCaseClause(node)) {
      const value = literalOf(node.expression)
      if (value) facts.push({ kind: 'compare', name: value, ...at(node) })
    }

    // A React `onDrop`, whether written as a JSX attribute or inside a props object.
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'onDrop') {
      facts.push({ kind: 'prop', name: 'onDrop', ...at(node) })
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'onDrop') {
      facts.push({ kind: 'prop', name: 'onDrop', ...at(node) })
    }

    if (ts.isImportDeclaration(node)) {
      const specifier = literalOf(node.moduleSpecifier)
      if (specifier) facts.push({ kind: 'import', name: specifier, ...at(node) })
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return facts
}

// ─── Rules ──────────────────────────────────────────────────────────

const calls = (facts, name) => facts.filter((f) => f.kind === 'call' && f.name === name)
const handles = (facts, action) => facts.some((f) => f.kind === 'compare' && f.name === action)
const anyCall = (facts, name) => calls(facts, name).length > 0

/** A location list a rule returns when the fault belongs to the tool rather than to one line. */
const TOOL_LEVEL = [{}]

/**
 * One rule per bug that shipped.
 *
 * `check` receives the tool (registry flags, id, dir) and its facts. Return the locations to
 * report, or an empty array for no finding. `detail` states what the user sees, because a finding
 * nobody can picture never gets fixed.
 */
export const RULES = [
  {
    id: 'open-file-flag-dead',
    detail:
      'Registered for Open File but handles no `open-file` action. ⌘O reports success and nothing arrives.',
    check: (tool, facts) =>
      tool.supportsOpenFile && !handles(facts, 'open-file') ? TOOL_LEVEL : [],
  },
  {
    id: 'open-file-flag-missing',
    detail:
      'Handles `open-file` but is not registered for it. ⌘O answers "not supported by the active tool", and a file opened from the OS routes elsewhere.',
    check: (tool, facts) =>
      handles(facts, 'open-file') && !tool.supportsOpenFile && !tool.ownsOpenFile ? TOOL_LEVEL : [],
  },
  {
    id: 'save-file-flag-dead',
    detail: 'Registered for Save Output but handles no `save-file` action. ⌘S does nothing.',
    check: (tool, facts) =>
      tool.supportsSaveFile && !handles(facts, 'save-file') ? TOOL_LEVEL : [],
  },
  {
    id: 'save-file-flag-missing',
    detail:
      'Handles `save-file` but is not registered for it. ⌘S answers "not supported by the active tool" and never reaches the handler.',
    check: (tool, facts) =>
      handles(facts, 'save-file') && !tool.supportsSaveFile ? TOOL_LEVEL : [],
  },
  {
    id: 'owns-open-file-unhandled',
    detail:
      'Declares `ownsOpenFile` but handles no `open-file-dialog` action. ⌘O dispatches into the void.',
    check: (tool, facts) =>
      tool.ownsOpenFile && !handles(facts, 'open-file-dialog') ? TOOL_LEVEL : [],
  },
  {
    id: 'owns-open-file-unregistered',
    detail:
      'Handles `open-file-dialog` but lacks `ownsOpenFile`. The shell reads the file as text instead, which rejects binary data.',
    check: (tool, facts) =>
      handles(facts, 'open-file-dialog') && !tool.ownsOpenFile ? TOOL_LEVEL : [],
  },
  {
    id: 'html-drop-is-dead',
    detail:
      'React `onDrop` in a tool. Tauri runs with `dragDropEnabled`, claims the OS drop, and the webview never fires an HTML5 drop event. This handler is dead in the desktop window.',
    check: (_tool, facts) => facts.filter((f) => f.kind === 'prop' && f.name === 'onDrop'),
  },
  {
    id: 'native-drop-unregistered',
    detail:
      'Listens for a native drop but lacks `ownsFileDrop`. The shell claims the same drop and answers "File drop is not supported by the active tool".',
    check: (tool, facts) => (tool.ownsFileDrop ? [] : dropRegistrations(facts)),
  },
  {
    id: 'owns-drop-unhandled',
    detail:
      'Declares `ownsFileDrop` but registers no native drop listener. The shell stays silent and nothing handles the drop.',
    check: (tool, facts) =>
      tool.ownsFileDrop && dropRegistrations(facts).length === 0 ? TOOL_LEVEL : [],
  },
  {
    id: 'native-drop-not-instance-gated',
    detail:
      'Registers a native drop without passing the instance-active flag. Every mounted tab keeps its listener and every listener sees every drop, so a background tab answers a drop meant for the tab in front of it.',
    // The gate is checked at the call, not across the directory. A tool that gates one listener
    // correctly must still gate the others, and a per-directory boolean said otherwise.
    //
    // A wrapper hook takes the gate as an argument. The raw Tauri listener takes none, so its gate
    // is a guard in a function around it.
    check: (_tool, facts) =>
      dropRegistrations(facts).filter((f) =>
        f.name === 'onDragDropEvent'
          ? !f.gated
          : !f.args.some((argument) => ACTIVITY.test(argument))
      ),
  },
  {
    id: 'ungated-global-listener',
    detail:
      'Listens on `document` or `window` for a contested event without `useIsInstanceActive`. Backgrounded tabs stay mounted, and the notes drawer renders beside every tool, so the handler also claims events meant for them.',
    check: (_tool, facts) =>
      anyCall(facts, 'useIsInstanceActive')
        ? []
        : facts.filter((f) => f.kind === 'listener' && CONTESTED_EVENTS.has(f.name)),
  },
  {
    id: 'raw-action-subscription',
    detail:
      'Calls `subscribeToolAction` directly instead of `useToolAction`. That skips the shared active-tab gate and the pending-action claim, so a file opened from the OS never arrives.',
    check: (_tool, facts) =>
      anyCall(facts, 'useToolAction') ? [] : calls(facts, 'subscribeToolAction'),
  },
  {
    id: 'monaco-flag-dead',
    detail:
      'Declares `usesMonaco` but never calls `useMonaco`. The workspace gives this tool `overflow-hidden`, so content past the bottom of the pane cannot be reached.',
    check: (tool, facts) => (tool.usesMonaco && !anyCall(facts, 'useMonaco') ? TOOL_LEVEL : []),
  },
  {
    id: 'monaco-flag-missing',
    detail:
      'Calls `useMonaco` but lacks `usesMonaco`. The editor sits inside the workspace’s `overflow-auto` container, which gives it a broken height and a second scrollbar.',
    check: (tool, facts) => (!tool.usesMonaco && anyCall(facts, 'useMonaco') ? TOOL_LEVEL : []),
  },
  {
    id: 'tool-state-id-mismatch',
    detail:
      'Passes a `useToolState` key that is not this tool’s registry id. The tool reads and writes another tool’s SQLite row, so its state appears to reset.',
    check: (tool, facts) =>
      calls(facts, 'useToolState').filter((f) => {
        const key = stringArgument(f.args[0])
        return key !== undefined && key !== tool.id
      }),
  },
  {
    id: 'handoff-target-unregistered',
    detail:
      'Hands off to a tool id that is not in the registry. The Send to… action opens nothing and the payload is dropped.',
    check: (_tool, facts, registry) =>
      calls(facts, 'sendToTool').filter((f) => {
        const target = stringArgument(f.args[0])
        return target !== undefined && !registry.ids.has(target)
      }),
  },
]

/** Every native drop registration in a tool: the wrapper hooks, and the raw Tauri listener. */
function dropRegistrations(facts) {
  return facts.filter(
    (f) =>
      f.kind === 'call' && (DROP_REGISTRARS.has(f.name) || f.name === 'onDragDropEvent')
  )
}

/** The text of a string-literal argument, or undefined when the argument is computed. */
function stringArgument(text) {
  if (text === undefined) return undefined
  const match = /^(['"])(.*)\1$/.exec(text.trim())
  return match ? match[2] : undefined
}

const IGNORE = /tool-contract-ignore:\s*([\w-]+)\s+(\S.*)/g

// ─── Repository-wide ownership ──────────────────────────────────────
//
// One call that belongs to exactly one file. These flag zero lines today and exist to keep it that
// way: each names a shared path that a second caller would quietly bypass.

const OWNERSHIP = [
  {
    id: 'direct-database-load',
    call: 'load',
    target: 'Database',
    owners: ['src/lib/db.ts'],
    detail:
      'Opens a second SQLite connection instead of going through `getDb()`. That skips the shared write queue and the WAL setup, so writes race and the database locks intermittently.',
  },
  {
    id: 'raw-worker-construction',
    construct: 'Worker',
    owners: [],
    detail:
      'Constructs a Worker directly. WKWebView needs the `?worker` import form; a hand-built module worker never becomes usable.',
  },
  {
    id: 'comlink-worker-protocol',
    import: 'comlink',
    owners: [],
    detail:
      'Imports Comlink. Its `expose`/`wrap` protocol does not complete in WKWebView; workers answer through `handleRpc` instead.',
  },
]

/** Every worker entry must answer the RPC protocol, or every call to it hangs with no error. */
const WORKER_ENTRY_RULE = {
  id: 'worker-entry-missing-handle-rpc',
  detail:
    'Worker entry that never calls `handleRpc`. Nothing answers the port, so every call into this worker hangs for ever.',
}

// ─── Discovery ──────────────────────────────────────────────────────

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
/** True when a node sits inside the `TOOLS` array declaration. */
function inToolsArray(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text === 'TOOLS'
    }
  }
  return false
}

export function parseRegistry(text) {
  const source = ts.createSourceFile('tool-registry.ts', text, ts.ScriptTarget.Latest, true)
  const dirs = new Map()
  const tools = []
  let entryCount

  const visit = (node) => {
    // `const CodeFormatter = lazy(() => import('@/tools/code-formatter/CodeFormatter'))`
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const dir = /@\/tools\/([\w-]+)\//.exec(node.initializer.getText(source))
      if (dir && node.initializer.getText(source).startsWith('lazy(')) {
        dirs.set(node.name.text, dir[1])
      }
      if (node.name.text === 'TOOLS' && ts.isArrayLiteralExpression(node.initializer)) {
        entryCount = node.initializer.elements.length
      }
    }

    // A registry entry is an object literal inside `TOOLS`, carrying both an `id` and a
    // `component`. The scope matters: any other object with those two keys would otherwise enter
    // the registry model, and a phantom id certifies an orphan directory as registered.
    if (ts.isObjectLiteralExpression(node) && inToolsArray(node)) {
      const read = (name) =>
        node.properties.find(
          (property) => property.name && property.name.getText(source) === name
        )?.initializer
      const id = literalOf(read('id'))
      const component = read('component')
      if (id && component) {
        tools.push({
          id,
          component: component.getText(source),
          supportsOpenFile: read('supportsOpenFile')?.kind === ts.SyntaxKind.TrueKeyword,
          supportsSaveFile: read('supportsSaveFile')?.kind === ts.SyntaxKind.TrueKeyword,
          ownsFileDrop: read('ownsFileDrop')?.kind === ts.SyntaxKind.TrueKeyword,
          ownsOpenFile: read('ownsOpenFile')?.kind === ts.SyntaxKind.TrueKeyword,
          usesMonaco: read('usesMonaco')?.kind === ts.SyntaxKind.TrueKeyword,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  // WARNING: stop rather than report on a partial registry. An entry this cannot read is a tool
  // nothing checks, and a short list reads exactly like a clean one.
  if (entryCount === undefined) {
    throw new Error('tool-contracts: no `TOOLS` array literal in src/app/tool-registry.ts')
  }
  if (entryCount !== tools.length) {
    throw new Error(
      `tool-contracts: read ${tools.length} of ${entryCount} registry entries. An entry needs a literal \`id\` and a \`component\`.`
    )
  }

  for (const tool of tools) tool.dir = dirs.get(tool.component)
  return tools
}

/** Findings for one tool, after its own ignore comments are applied. */
export function auditTool(tool, facts, text, registry = { ids: new Set() }) {
  const ignored = new Set()
  for (const [, rule] of text.matchAll(IGNORE)) ignored.add(rule)

  const findings = []
  for (const rule of RULES) {
    if (ignored.has(rule.id)) continue
    for (const location of rule.check(tool, facts, registry)) {
      findings.push({ tool: tool.id, rule: rule.id, detail: rule.detail, ...location })
    }
  }
  return findings
}

/** Findings about the registry as a whole, which no single tool can see. */
export function auditRegistry(tools, toolDirs) {
  const findings = []
  const seenIds = new Map()
  const seenComponents = new Map()

  for (const tool of tools) {
    if (seenIds.has(tool.id)) {
      findings.push({
        tool: tool.id,
        rule: 'duplicate-tool-id',
        detail:
          'Two registry entries share one id. `getToolById` returns the first, so the second entry opens the wrong tool and both share one state row.',
      })
    }
    seenIds.set(tool.id, true)

    if (seenComponents.has(tool.component)) {
      findings.push({
        tool: tool.id,
        rule: 'duplicate-tool-component',
        detail: `Shares its component with \`${seenComponents.get(tool.component)}\`. Two sidebar entries open the same tool.`,
      })
    }
    seenComponents.set(tool.component, tool.id)
  }

  const registered = new Set(tools.map((tool) => tool.dir).filter(Boolean))
  for (const dir of toolDirs) {
    if (registered.has(dir)) continue
    findings.push({
      tool: dir,
      rule: 'orphan-tool-directory',
      detail:
        'Tool source that no registry entry names. It ships in no build, answers no shortcut, and cannot be opened.',
    })
  }

  return findings
}

/** Findings for the shared paths one file is meant to own. */
export function auditOwnership(files) {
  const findings = []

  for (const file of files) {
    const relativePath = relative(ROOT, file)
    const facts = factsForFile(file, readFileSync(file, 'utf8'))

    for (const rule of OWNERSHIP) {
      if (rule.owners.includes(relativePath)) continue
      const hits = facts.filter((fact) => {
        if (rule.import) return fact.kind === 'import' && fact.name === rule.import
        if (rule.construct) return fact.kind === 'new' && fact.name === rule.construct
        return (
          fact.kind === 'call' &&
          fact.name === rule.call &&
          (rule.target === undefined || fact.target === rule.target)
        )
      })
      for (const hit of hits) {
        findings.push({ tool: relativePath, rule: rule.id, detail: rule.detail, ...hit })
      }
    }
  }

  return findings
}

/** Findings for worker entry points, which answer the RPC protocol or answer nothing. */
export function auditWorkers(files) {
  return files
    .filter((file) => /\.worker\.tsx?$/.test(file))
    .filter((file) => !anyCall(factsForFile(file, readFileSync(file, 'utf8')), 'handleRpc'))
    .map((file) => ({
      tool: relative(ROOT, file),
      rule: WORKER_ENTRY_RULE.id,
      detail: WORKER_ENTRY_RULE.detail,
    }))
}

// ─── Report ─────────────────────────────────────────────────────────

const MATRIX_COLUMNS = [
  ['open', (t) => t.supportsOpenFile, (t) => handles(t.facts, 'open-file')],
  ['save', (t) => t.supportsSaveFile, (t) => handles(t.facts, 'save-file')],
  ['drop', (t) => t.ownsFileDrop, (t) => dropRegistrations(t.facts).length > 0],
  ['dialog', (t) => t.ownsOpenFile, (t) => handles(t.facts, 'open-file-dialog')],
  ['monaco', (t) => t.usesMonaco, (t) => anyCall(t.facts, 'useMonaco')],
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
    const state = anyCall(tool.facts, 'useToolState') ? '✓' : '·'
    const listens = tool.facts.some((f) => f.kind === 'listener' && CONTESTED_EVENTS.has(f.name))
    const gate = listens ? (anyCall(tool.facts, 'useIsInstanceActive') ? '✓' : '!') : '·'
    console.log(`${tool.id.padEnd(width)}  ${cells}  ${state.padEnd(5)}  ${gate}`)
  }
}

function run() {
  const tools = parseRegistry(readFileSync(REGISTRY, 'utf8'))
  const registry = { ids: new Set(tools.map((tool) => tool.id)) }
  const findings = []
  const subjects = []

  for (const tool of tools) {
    if (!tool.dir || !existsSync(join(TOOLS_DIR, tool.dir))) {
      findings.push({
        tool: tool.id,
        rule: 'unresolved-source',
        detail: 'No `lazy(() => import(...))` line resolves this entry, so its source was not read.',
      })
      continue
    }
    const files = sourceFiles(join(TOOLS_DIR, tool.dir))
    const facts = []
    const parts = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      parts.push(text)
      facts.push(...factsForFile(relative(ROOT, file), text))
    }
    subjects.push({ ...tool, facts })
    findings.push(...auditTool(tool, facts, parts.join('\n'), registry))
  }

  const toolDirs = readdirSync(TOOLS_DIR).filter(
    (entry) =>
      entry !== 'node_modules' &&
      entry !== '__tests__' &&
      statSync(join(TOOLS_DIR, entry)).isDirectory()
  )
  findings.push(...auditRegistry(tools, toolDirs))
  findings.push(...auditOwnership(sourceFiles(SRC_DIR)))
  findings.push(...auditWorkers(sourceFiles(WORKERS_DIR)))

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
    for (const finding of group) {
      const where = finding.file ? `  ${finding.file}:${finding.line}` : ''
      console.log(`  ${finding.tool}${where}`)
    }
    console.log('')
  }

  console.log('Annotate a false positive with /* tool-contract-ignore: <rule> <reason> */\n')
  return process.argv.includes('--gate') ? 1 : 0
}

if (import.meta.main) process.exit(run())
