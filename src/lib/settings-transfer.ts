import { z } from 'zod'
import { TOOLS } from '@/app/tool-registry'
import { ALL_THEMES } from '@/lib/theme'
import { clampNotesDrawerWidth, clampSidebarWidth } from '@/lib/shell-layout'
import type { AppSettings, Theme } from '@/types/models'
import type { ToolGroup } from '@/types/tools'

// A new ToolGroup must also become importable. This map turns a forgotten group into a tsc error.
const TOOL_GROUP_MAP: Record<ToolGroup, true> = {
  code: true,
  data: true,
  web: true,
  convert: true,
  test: true,
  network: true,
  write: true,
}

const EDITOR_FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro'] as const

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

const validThemes = new Set<string>(['system', ...ALL_THEMES])
const validToolIds = new Set(TOOLS.map((tool) => tool.id))
const validToolGroups = new Set<string>(Object.keys(TOOL_GROUP_MAP))

const settingsImportShape = {
  theme: z
    .string()
    .refine((value) => validThemes.has(value))
    .transform((value) => value as Theme),
  shellStyle: z.enum(['flush', 'floating']),
  alwaysOnTop: z.boolean(),
  sidebarCollapsed: z.boolean(),
  collapsedSidebarGroups: z
    .array(z.string())
    .transform((groups) => unique(groups.filter((group) => validToolGroups.has(group))))
    .transform((groups) => groups as AppSettings['collapsedSidebarGroups']),
  openedSidebarGroups: z
    .array(z.string())
    .transform((groups) => unique(groups.filter((group) => validToolGroups.has(group))))
    .transform((groups) => groups as AppSettings['openedSidebarGroups']),
  pinnedToolIds: z
    .array(z.string())
    .transform((ids) => unique(ids.filter((id) => validToolIds.has(id)))),
  sidebarWidth: z.number().finite().transform(clampSidebarWidth),
  notesDrawerOpen: z.boolean(),
  notesDrawerWidth: z.number().finite().transform(clampNotesDrawerWidth),
  defaultIndentSize: z.number().int().min(1).max(8),
  defaultTimezone: z.string().refine(isTimezone, 'Invalid IANA timezone'),
  editorFont: z.enum(EDITOR_FONTS),
  editorFontSize: z.number().finite().min(8).max(40),
  editorTheme: z.enum(['devdrivr-dark', 'devdrivr-light', 'match-app']),
  editorKeybindingMode: z.literal('standard'),
  editorWordWrap: z.boolean(),
  editorMinimap: z.boolean(),
  editorLineNumbers: z.boolean(),
  editorFolding: z.boolean(),
  editorStickyScroll: z.boolean(),
  editorRenderWhitespace: z.enum(['none', 'boundary', 'all']),
  editorInsertSpaces: z.boolean(),
  editorBracketPairColorization: z.boolean(),
  editorCursorStyle: z.enum(['line', 'block', 'underline']),
  historyRetentionPerTool: z.number().int().min(10).max(5000),
  formatOnPaste: z.boolean(),
  checkForUpdatesAutomatically: z.boolean(),
  downloadUpdatesAutomatically: z.boolean(),
  notifyWhenUpdateAvailable: z.boolean(),
} satisfies { [Key in keyof AppSettings]: z.ZodType<AppSettings[Key]> }

const settingsImportSchema = z.object(settingsImportShape).partial()

export function parseSettingsImport(text: string): Partial<AppSettings> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Settings import is not valid JSON')
  }

  const result = settingsImportSchema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(
      issue
        ? `Invalid setting ${issue.path.join('.') || 'payload'}: ${issue.message}`
        : 'Invalid settings payload'
    )
  }
  if (Object.keys(result.data).length === 0) {
    throw new Error('Settings import contains no recognized settings')
  }
  return result.data as Partial<AppSettings>
}
