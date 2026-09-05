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
  | 'inked'
  | 'urban-nocturne'
  | 'amethyst-haze'
  | 'lapis-velvet'
  | 'amethyst-mint'
  | 'fireside'
  | 'marina'
  | 'pearl'
  | 'yacht-club'
  | 'dodecastar'

/**
 * `flush` packs the shell panels edge to edge, separated by 1px borders. `floating`
 * insets them into cards on a recessed canvas, which costs about 16px in each
 * direction — worth offering rather than imposing, in an app this dense.
 */
export type ShellStyle = 'flush' | 'floating'

export type AppSettings = {
  theme: Theme
  shellStyle: ShellStyle
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  collapsedSidebarGroups: ToolGroup[]
  /**
   * Groups the user has explicitly expanded or opened a tool from at least
   * once. Once a group is in this list, "never opened" default-collapse no
   * longer applies to it — only an explicit collapse (via
   * collapsedSidebarGroups) hides it again.
   */
  openedSidebarGroups: ToolGroup[]
  pinnedToolIds: string[]
  /** Expanded-sidebar width in px. Ignored while collapsed, which is a fixed rail. */
  sidebarWidth: number
  notesDrawerOpen: boolean
  notesDrawerWidth: number
  defaultIndentSize: number
  defaultTimezone: string
  editorFont: 'JetBrains Mono' | 'Fira Code' | 'Cascadia Code' | 'Source Code Pro'
  editorFontSize: number
  editorTheme: 'devdrivr-dark' | 'devdrivr-light' | 'match-app'
  /**
   * Only `standard` exists. The union used to include `vim` and `emacs`, neither of which was ever
   * implemented: initialization reset any stored value back to `standard`, the Settings select
   * offered one option, and StatusBar carried a branch that could not render. Keeping the key —
   * rather than deleting it — means older exported settings files still round-trip.
   */
  editorKeybindingMode: 'standard'
  /**
   * Wrap long lines instead of scrolling them horizontally.
   *
   * Defaults on, and that default matters: Monaco's horizontal scrollbar is a
   * 12px sliver that stays hidden until you scroll, so with wrap off a long
   * line reads as truncated rather than scrollable. Turning this off therefore
   * also forces the horizontal scrollbar permanently visible (see
   * buildEditorOptions) so the rest of the line is at least reachable.
   */
  editorWordWrap: boolean
  editorMinimap: boolean
  editorLineNumbers: boolean
  editorFolding: boolean
  editorStickyScroll: boolean
  editorRenderWhitespace: 'none' | 'boundary' | 'all'
  /** False indents with real tab characters; `defaultIndentSize` is then the tab's display width. */
  editorInsertSpaces: boolean
  editorBracketPairColorization: boolean
  editorCursorStyle: 'line' | 'block' | 'underline'
  historyRetentionPerTool: number
  formatOnPaste: boolean
  checkForUpdatesAutomatically: boolean
  downloadUpdatesAutomatically: boolean
  notifyWhenUpdateAvailable: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  shellStyle: 'floating',
  alwaysOnTop: false,
  sidebarCollapsed: false,
  collapsedSidebarGroups: [],
  openedSidebarGroups: [],
  pinnedToolIds: [],
  sidebarWidth: 218,
  notesDrawerOpen: false,
  notesDrawerWidth: 288,
  defaultIndentSize: 2,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  editorFont: 'JetBrains Mono',
  editorFontSize: 14,
  editorTheme: 'devdrivr-dark',
  editorKeybindingMode: 'standard',
  editorWordWrap: true,
  // Off: these editors routinely sit in a half-window pane, where a minimap
  // costs more width than it navigates.
  editorMinimap: false,
  editorLineNumbers: true,
  editorFolding: true,
  // Off: sticky scroll eats rows off the top of an already short pane, and most
  // tool content here is a single payload rather than deeply nested source.
  editorStickyScroll: false,
  editorRenderWhitespace: 'none',
  editorInsertSpaces: true,
  editorBracketPairColorization: true,
  editorCursorStyle: 'line',
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
  /** Persisted favorite flag; optional for imported/legacy in-memory fixtures. */
  favorite?: boolean
  /** The typed folder backing the legacy display-name `folder` field. */
  folderId?: string
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
  /** Always populated from persisted rows after migration 013. */
  folderId?: string
}

export type ResourceKind = 'notes' | 'snippets' | 'apiRequests'

export type ResourceFolder = {
  id: string
  name: string
  parentId: string | null
  kind: ResourceKind
  sortOrder: number
  defaultLanguage?: string | null
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
  /** Execution duration in milliseconds */
  durationMs?: number
  /** Whether the operation succeeded */
  success?: boolean
  /** Size of output in bytes */
  outputSize?: number
  /** User-starred/favorite flag */
  starred?: boolean
  /** Optional API response snapshot, capped before persistence. */
  responseBody?: string
  responseMimeType?: string
  responseStatus?: number
  responseStatusText?: string
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
  /** Parent typed API folder. Undefined is accepted for legacy import payloads. */
  parentId?: string | null
  sortOrder?: number
  defaultLanguage?: string | null
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
  | 'devdrivr-json'

export type ApiImportCollectionDraft = {
  key: string
  name: string
  parentKey?: string | null
  sortOrder?: number
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

export type McpDataChangedResource = McpResource | 'apiCollections' | 'folders'

export type McpDataChangedEvent = {
  resource: McpDataChangedResource
  action: McpAction
  id?: string
}
