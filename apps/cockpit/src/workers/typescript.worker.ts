import { handleRpc } from './rpc'
import ts from 'typescript'

type TranspileOptions = {
  target?: string
  module?: string
  strict?: boolean
}

type TranspileResult = {
  output: string
  diagnostics: Array<{
    message: string
    line?: number
    column?: number
  }>
}

const TARGET_MAP: Record<string, ts.ScriptTarget> = {
  ES5: ts.ScriptTarget.ES5,
  ES2015: ts.ScriptTarget.ES2015,
  ES2020: ts.ScriptTarget.ES2020,
  ESNext: ts.ScriptTarget.ESNext,
}

const MODULE_MAP: Record<string, ts.ModuleKind> = {
  CommonJS: ts.ModuleKind.CommonJS,
  ESNext: ts.ModuleKind.ESNext,
  None: ts.ModuleKind.None,
}

const SOURCE_FILE = 'input.tsx'

function collectDiagnostics(
  code: string,
  compilerOptions: ts.CompilerOptions
): readonly ts.Diagnostic[] {
  const sourceFile = ts.createSourceFile(
    SOURCE_FILE,
    code,
    compilerOptions.target ?? ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX
  )
  const host: ts.CompilerHost = {
    fileExists: (fileName) => fileName === SOURCE_FILE,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => '',
    getDefaultLibFileName: () => 'lib.d.ts',
    getDirectories: () => [],
    getNewLine: () => '\n',
    getSourceFile: (fileName) => (fileName === SOURCE_FILE ? sourceFile : undefined),
    readFile: (fileName) => (fileName === SOURCE_FILE ? code : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  }
  const program = ts.createProgram([SOURCE_FILE], { ...compilerOptions, noLib: true }, host)
  return [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ]
}

const api = {
  transpile(code: string, options: TranspileOptions = {}): TranspileResult {
    const compilerOptions: ts.CompilerOptions = {
      target: TARGET_MAP[options.target ?? 'ESNext'] ?? ts.ScriptTarget.ESNext,
      module: MODULE_MAP[options.module ?? 'ESNext'] ?? ts.ModuleKind.ESNext,
      strict: options.strict ?? true,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
    }

    const result = ts.transpileModule(code, {
      compilerOptions,
      reportDiagnostics: true,
    })

    const diagnostics = collectDiagnostics(code, compilerOptions).map((d) => {
      const pos =
        d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined
      const entry: { message: string; line?: number; column?: number } = {
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      }
      if (pos !== undefined) {
        entry.line = pos.line + 1
        entry.column = pos.character + 1
      }
      return entry
    })

    return {
      output: result.outputText,
      diagnostics,
    }
  },
}

export type TypeScriptWorker = typeof api

handleRpc(api)
