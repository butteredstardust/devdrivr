import type { PendingValidatorDocument } from '@/hooks/useValidatorDocument'

export type ViewMode = 'editor' | 'split' | 'preview'
export type Panel = 'problems' | 'outline'

export type HtmlValidatorState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * The last text written to (or read from) a file — the dirty comparison.
   * `null` means "never established": state saved before this field existed
   * hydrates that way, and treating it as `''` would report every restored
   * document as modified.
   */
  savedContent: string | null
  viewMode: ViewMode
  templateId: string
  panel: Panel
  panelOpen: boolean
  /** Departures from the rule defaults, so new defaults still reach the user. */
  disabledRules: string[]
  enabledRules: string[]
}

export type PendingDocument = PendingValidatorDocument
export type UpdateHtmlValidatorState = (patch: Partial<HtmlValidatorState>) => void
