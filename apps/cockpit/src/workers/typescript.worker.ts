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

    const diagnostics = (result.diagnostics ?? []).map((d) => {
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
