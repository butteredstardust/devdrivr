import { NOTE_COLORS } from '@/lib/schemas'

export type Theme = 'system' | 'midnight' | 'warm-terminal' | 'neon-brutalist' | 'earth-code' | 'cyber-luxe' | 'soft-focus'

export type AppSettings = {
  theme: Theme
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  notesDrawerOpen: boolean
  notesDrawerWidth: number
  defaultIndentSize: number
  defaultTimezone: string
  editorFont: 'JetBrains Mono' | 'Fira Code' | 'Cascadia Code' | 'Source Code Pro'
  editorFontSize: number
  editorTheme: 'cockpit-dark' | 'cockpit-light' | 'match-app'
  editorKeybindingMode: 'standard' | 'vim' | 'emacs'
  historyRetentionPerTool: number
  formatOnPaste: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  alwaysOnTop: false,
  sidebarCollapsed: false,
  notesDrawerOpen: false,
  notesDrawerWidth: 288,
  defaultIndentSize: 2,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  editorFont: 'JetBrains Mono',
  editorFontSize: 14,
  editorTheme: 'cockpit-dark',
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

export type NoteColor = (typeof NOTE_COLORS)[number]

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
  tags: string[]
}

export type HistoryEntry = {
  id: string
  tool: string
  subTab?: string
  input: string
  output: string
  timestamp: number
  /** Execution duration in milliseconds */
  durationMs?: number
  /** Whether the operation succeeded */
  success?: boolean
  /** Size of output in bytes */
  outputSize?: number
  /** User-starred/favorite flag */
  starred?: boolean
}

// --- API Client ---

export type ApiEnvironment = {
  id: string
  name: string
  variables: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type ApiCollection = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type ApiHeader = { key: string; value: string; enabled: boolean }

export type ApiRequestAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }

export type ApiRequest = {
  id: string
  collectionId: string | null
  name: string
  method: string
  url: string
  headers: ApiHeader[]
  body: string
  bodyMode: string
  auth: ApiRequestAuth
  createdAt: number
  updatedAt: number
}
