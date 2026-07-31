import { handleRpc } from './rpc'
import { format, detectLanguage, getSupportedLanguages } from './formatter.api'
import type { FormatOptions } from './formatter.api'

const api = {
  format(code: string, options: FormatOptions): Promise<string> {
    return format(code, options)
  },
  detectLanguage(code: string): Promise<string> {
    return detectLanguage(code)
  },
  getSupportedLanguages(): string[] {
    return getSupportedLanguages()
  },
}

export type FormatterWorker = typeof api

handleRpc(api)
