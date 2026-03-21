export type Theme = 'dark' | 'light' | 'system'

export type AppSettings = {
  theme: Theme
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  notesDrawerOpen: boolean
  defaultIndentSize: number
  defaultTimezone: string
  editorFontSize: number
  editorKeybindingMode: 'standard' | 'vim' | 'emacs'
  historyRetentionPerTool: number
  formatOnPaste: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  alwaysOnTop: false,
  sidebarCollapsed: false,
  notesDrawerOpen: false,
  defaultIndentSize: 2,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  editorFontSize: 14,
  editorKeybindingMode: 'standard',
  historyRetentionPerTool: 500,
  formatOnPaste: false,
}

export type ToolState = {
  toolId: string
  state: Record<string, unknown>
  updatedAt: number
}

export type Snippet = {
  id: string
  title: string
  content: string
  language: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'red' | 'gray'

export type Note = {
  id: string
  title: string
  content: string
  color: NoteColor
  pinned: boolean
  poppedOut: boolean
  windowBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  createdAt: number
  updatedAt: number
}

export type HistoryEntry = {
  id: string
  tool: string
  subTab?: string
  input: string
  output: string
  timestamp: number
}
