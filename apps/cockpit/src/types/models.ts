import { NOTE_COLORS } from '@/lib/schemas'
import type { ToolGroup } from '@/types/tools'

export type Theme =
  | 'system'
  | 'midnight'
  | 'warm-terminal'
  | 'neon-brutalist'
  | 'earth-code'
  | 'cyber-luxe'
  | 'soft-focus'
  | 'tokyo-night'
  | 'tokyo-night-light'
  | 'catppuccin-latte'
  | 'catppuccin-frappe'
  | 'catppuccin-macchiato'
  | 'catppuccin-mocha'
  | 'dracula'
  | 'monokai'
  | 'nord'
  | 'night-owl'
  | 'github-dark'
  | 'github-light'
  | 'solarized-dark'
  | 'solarized-light'
  | 'tomorrow-night'
  | 'oceanic-next'

export type AppSettings = {
  theme: Theme
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  collapsedSidebarGroups: ToolGroup[]
  pinnedToolIds: string[]
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
  checkForUpdatesAutomatically: boolean
  downloadUpdatesAutomatically: boolean
  notifyWhenUpdateAvailable: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  alwaysOnTop: false,
  sidebarCollapsed: false,
  collapsedSidebarGroups: [],
  pinnedToolIds: [],
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
  checkForUpdatesAutomatically: true,
  downloadUpdatesAutomatically: false,
  notifyWhenUpdateAvailable: true,
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
  folder: string
  createdAt: number
  updatedAt: number
}

export const PROMPT_TEMPLATE_CATEGORIES = [
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'learning',
  'productivity',
] as const

export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number]

export type PromptTemplateVariableType = 'text' | 'textarea' | 'select'

export type PromptTemplateVariable = {
  name: string
  label: string
  type: PromptTemplateVariableType
  placeholder?: string
  options?: string[]
  required?: boolean
}

export type PromptTemplate = {
  id: string
  name: string
  description: string
  category: PromptTemplateCategory
  tags: string[]
  prompt: string
  variables: PromptTemplateVariable[]
  estimatedTokens: number
  optimizedFor: 'Claude' | 'ChatGPT' | 'Cursor' | 'Generic'
  author: 'builtin' | 'user'
  version: string
  tips?: string[]
  createdAt?: number
  updatedAt?: number
}

export type PromptTemplateValues = Record<string, string>

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
  sortOrder: number
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

export type ApiImportFormat =
  | 'postman'
  | 'openapi'
  | 'asyncapi'
  | 'protobuf'
  | 'graphql'
  | 'cockpit-json'

export type ApiImportCollectionDraft = {
  key: string
  name: string
}

export type ApiImportRequestDraft = Omit<
  ApiRequest,
  'id' | 'collectionId' | 'createdAt' | 'updatedAt'
> & {
  collectionKey: string | null
}

export type ApiImportResult = {
  format: ApiImportFormat
  sourceTitle: string
  collections: ApiImportCollectionDraft[]
  requests: ApiImportRequestDraft[]
  warnings: string[]
}

export type McpResource = 'notes' | 'snippets' | 'promptTemplates' | 'apiRequests'
export type McpAction = 'read' | 'create' | 'update' | 'delete'

export type McpResourcePermissions = Record<McpAction, boolean>
export type McpPermissions = Record<McpResource, McpResourcePermissions>

export type McpSettings = {
  enabled: boolean
  host: '127.0.0.1'
  port: number
  apiKey: string
  permissions: McpPermissions
  apiRequestsExposeSecrets: boolean
}

export type McpStatus = {
  running: boolean
  host: string
  port: number
  url: string
  lastError: string | null
}

export type McpDataChangedResource = McpResource | 'apiCollections'

export type McpDataChangedEvent = {
  resource: McpDataChangedResource
  action: McpAction
  id?: string
}
