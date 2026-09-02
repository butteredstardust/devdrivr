/**
 * Pure TypeScript transpilation logic shared by the typescript worker and its
 * test-environment mock. Lives in its own module (no `self` reference) so it
 * can run identically on the worker thread and in-process under Vitest.
 */
import ts from 'typescript'

export type TranspileOptions = {
  target?: string
  module?: string
  strict?: boolean
  jsx?: boolean
}

export type Diagnostic = {
  message: string
  line?: number
  column?: number
  category: 'error' | 'warning' | 'suggestion'
  code: number
}

export type TranspileResult = {
  output: string
  diagnostics: Diagnostic[]
  /** False when the standard library could not be loaded — see `loadLibs`. */
  typesChecked: boolean
}

const TARGET_MAP: Record<string, ts.ScriptTarget> = {
  ES5: ts.ScriptTarget.ES5,
  ES2015: ts.ScriptTarget.ES2015,
  ES2016: ts.ScriptTarget.ES2016,
  ES2017: ts.ScriptTarget.ES2017,
  ES2018: ts.ScriptTarget.ES2018,
  ES2019: ts.ScriptTarget.ES2019,
  ES2020: ts.ScriptTarget.ES2020,
  ES2021: ts.ScriptTarget.ES2021,
  ES2022: ts.ScriptTarget.ES2022,
  ES2023: ts.ScriptTarget.ES2023,
  ESNext: ts.ScriptTarget.ESNext,
}

const MODULE_MAP: Record<string, ts.ModuleKind> = {
  CommonJS: ts.ModuleKind.CommonJS,
  ES2015: ts.ModuleKind.ES2015,
  ES2020: ts.ModuleKind.ES2020,
  ES2022: ts.ModuleKind.ES2022,
  ESNext: ts.ModuleKind.ESNext,
  Node16: ts.ModuleKind.Node16,
  NodeNext: ts.ModuleKind.NodeNext,
  None: ts.ModuleKind.None,
}

const SOURCE_FILE = 'input.tsx'

/**
 * The `lib*.d.ts` files that ship with the compiler, inlined into this bundle.
 *
 * Without them the checker runs with `noLib` and has no `Array`, `Promise` or
 * `console`, so it reported "Cannot find name 'console'" and "Property 'map'
 * does not exist on type '{}'" for the playground's own example code.
 *
 * `eager` costs ~3 MB in the worker chunk, but the lazy alternative splits the
 * worker into chunks, and rollup cannot code-split an `iife` bundle — the only
 * way out would be `worker.format: 'es'`, which AGENTS.md rule 4 forbids
 * because module workers are unreliable in WKWebView.
 *
 * `lib*.d.ts`, not `lib.*.d.ts`: the ES5 default library is plainly `lib.d.ts`,
 * and leaving it out silently downgraded that target to syntax-only checking.
 */
const LIB_TEXT = import.meta.glob<string>('/node_modules/typescript/lib/lib*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const libSourceFiles = new Map<string, ts.SourceFile>()
let cachedLanguageVersion: ts.ScriptTarget | null = null

const REFERENCE_LIB = /\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g

function libText(name: string): string | undefined {
  return LIB_TEXT[`/node_modules/typescript/lib/${name}`]
}

/** Collects `name` and everything it `/// <reference lib="…" />`s, transitively. */
function collectLibs(name: string, loaded: Set<string>): void {
  if (loaded.has(name)) return
  const text = libText(name)
  // A lib we have no text for stays out of the set so `fileExists` is honest.
  if (text === undefined) return
  loaded.add(name)

  for (const match of text.matchAll(REFERENCE_LIB)) {
    collectLibs(`lib.${match[1]}.d.ts`, loaded)
  }
}

/**
 * Parsing lib.dom.d.ts alone is ~1.9 MB of work and the playground re-checks on
 * every debounced keystroke, so parsed lib files are cached. The cache is
 * dropped wholesale when the target changes rather than keyed by language
 * version: otherwise cycling all four targets pins four copies of every lib AST
 * in the worker for its lifetime.
 */
function libSourceFile(name: string, languageVersion: ts.ScriptTarget): ts.SourceFile | undefined {
  const text = libText(name)
  if (text === undefined) return undefined

  if (cachedLanguageVersion !== languageVersion) {
    libSourceFiles.clear()
    cachedLanguageVersion = languageVersion
  }

  const cached = libSourceFiles.get(name)
  if (cached) return cached

  const sourceFile = ts.createSourceFile(name, text, languageVersion, false, ts.ScriptKind.TS)
  libSourceFiles.set(name, sourceFile)
  return sourceFile
}

const CATEGORY_MAP: Record<ts.DiagnosticCategory, Diagnostic['category']> = {
  [ts.DiagnosticCategory.Error]: 'error',
  [ts.DiagnosticCategory.Warning]: 'warning',
  [ts.DiagnosticCategory.Suggestion]: 'suggestion',
  [ts.DiagnosticCategory.Message]: 'suggestion',
}

function toDiagnostic(d: ts.Diagnostic): Diagnostic {
  const entry: Diagnostic = {
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    category: CATEGORY_MAP[d.category] ?? 'error',
    code: d.code,
  }
  if (d.file && d.start !== undefined) {
    const position = d.file.getLineAndCharacterOfPosition(d.start)
    entry.line = position.line + 1
    entry.column = position.character + 1
  }
  return entry
}

function collectDiagnostics(
  code: string,
  compilerOptions: ts.CompilerOptions
): { diagnostics: readonly ts.Diagnostic[]; typesChecked: boolean } {
  const languageVersion = compilerOptions.target ?? ts.ScriptTarget.ESNext
  const sourceFile = ts.createSourceFile(
    SOURCE_FILE,
    code,
    languageVersion,
    true,
    ts.ScriptKind.TSX
  )

  const defaultLib = ts.getDefaultLibFileName(compilerOptions)
  const libs = new Set<string>()
  collectLibs(defaultLib, libs)
  // Missing libs would mean every reference to `console`, `Array`, `Promise`…
  // reports as an unknown name. Reporting syntax only is the honest fallback.
  const typesChecked = libs.has(defaultLib)

  const host: ts.CompilerHost = {
    fileExists: (fileName) => fileName === SOURCE_FILE || libs.has(fileName),
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => '',
    getDefaultLibFileName: () => defaultLib,
    getDirectories: () => [],
    getNewLine: () => '\n',
    getSourceFile: (fileName) =>
      fileName === SOURCE_FILE ? sourceFile : libSourceFile(fileName, languageVersion),
    readFile: (fileName) => (fileName === SOURCE_FILE ? code : libText(fileName)),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  }

  const program = ts.createProgram(
    [SOURCE_FILE],
    { ...compilerOptions, noLib: !typesChecked },
    host
  )

  return {
    typesChecked,
    diagnostics: [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...(typesChecked ? program.getSemanticDiagnostics(sourceFile) : []),
    ],
  }
}

export function transpile(code: string, options: TranspileOptions = {}): TranspileResult {
  const compilerOptions: ts.CompilerOptions = {
    target: TARGET_MAP[options.target ?? 'ESNext'] ?? ts.ScriptTarget.ESNext,
    module: MODULE_MAP[options.module ?? 'ESNext'] ?? ts.ModuleKind.ESNext,
    strict: options.strict ?? true,
    ...(options.jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    esModuleInterop: true,
    skipLibCheck: true,
  }

  // No `reportDiagnostics`: the program below reports the same syntax errors
  // with real positions, so asking the transpiler for them again is dead work.
  const result = ts.transpileModule(code, { compilerOptions })

  const { diagnostics, typesChecked } = collectDiagnostics(code, compilerOptions)

  return {
    output: result.outputText,
    diagnostics: diagnostics.map(toDiagnostic),
    typesChecked,
  }
}
