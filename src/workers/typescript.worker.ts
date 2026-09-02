import { handleRpc } from './rpc'
import { transpile } from './typescript.api'
import type { TranspileOptions, TranspileResult } from './typescript.api'

const api = {
  transpile(code: string, options: TranspileOptions = {}): TranspileResult {
    return transpile(code, options)
  },
}

export type TypeScriptWorker = typeof api

handleRpc(api)
