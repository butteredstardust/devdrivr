import type { PendingValidatorDocument } from '@/hooks/useValidatorDocument'

export type Panel = 'problems' | 'selectors'

export type CssValidatorState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * The last text written to (or read from) a file. `null` means "never
   * established", which is how state saved before this field existed hydrates;
   * treating it as `''` would call every restored stylesheet modified.
   */
  savedContent: string | null
  templateId: string
  panel: Panel
  panelOpen: boolean
  /** Departures from the rule defaults, so new defaults still reach the user. */
  disabledRules: string[]
  enabledRules: string[]
  syntax: 'css' | 'scss' | 'less'
}

export type UpdateCssValidatorState = (patch: Partial<CssValidatorState>) => void

export type PendingDocument = PendingValidatorDocument & {
  syntax?: CssValidatorState['syntax']
}

export function syntaxFromFilename(filename: string): CssValidatorState['syntax'] | undefined {
  if (/\.scss$/i.test(filename)) return 'scss'
  if (/\.less$/i.test(filename)) return 'less'
  if (/\.css$/i.test(filename)) return 'css'
  return undefined
}
