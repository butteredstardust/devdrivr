import { z } from 'zod'
import type {
  Note,
  Snippet,
  HistoryEntry,
  PromptTemplate,
  PromptTemplateVariable,
  ResourceFolder,
} from '@/types/models'

export const NOTE_COLORS = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'red',
  'gray',
] as const

const noteColorSchema = z.enum(NOTE_COLORS)
const PROMPT_TEMPLATE_CATEGORY_VALUES = [
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'learning',
  'productivity',
] as const
const promptTemplateCategorySchema = z.enum(PROMPT_TEMPLATE_CATEGORY_VALUES)
const promptTemplateOptimizedForSchema = z.enum(['Claude', 'ChatGPT', 'Cursor', 'Generic'])
const promptTemplateVariableSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'select']),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
})

function parseStringArray(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    const result = z.array(z.string()).safeParse(parsed)
    return result.success ? result.data : []
  } catch {
    return []
  }
}

/** Validates a raw NoteRow from SQLite and transforms it into a Note. */
export const noteRowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    color: noteColorSchema,
    pinned: z.number(),
    popped_out: z.number(),
    window_x: z.number().nullable(),
    window_y: z.number().nullable(),
    window_width: z.number().nullable(),
    window_height: z.number().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
    tags: z.string().optional(),
    sort_order: z.number().default(0),
    folder_id: z.string().nullable().optional(),
  })
  .transform((row): Note => {
    const note: Note = {
      id: row.id,
      title: row.title,
      content: row.content,
      color: row.color,
      pinned: row.pinned === 1,
      poppedOut: row.popped_out === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: (() => {
        if (!row.tags) return []
        try {
          const parsed = JSON.parse(row.tags)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })(),
      sortOrder: row.sort_order,
    }
    if (row.folder_id != null) note.folderId = row.folder_id
    if (
      row.window_x != null &&
      row.window_y != null &&
      row.window_width != null &&
      row.window_height != null
    ) {
      note.windowBounds = {
        x: row.window_x,
        y: row.window_y,
        width: row.window_width,
        height: row.window_height,
      }
    }
    return note
  })

/** Validates a raw SnippetRow from SQLite and transforms it into a Snippet. */
export const snippetRowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    language: z.string(),
    tags: z.string(),
    favorite: z.union([z.number(), z.boolean()]).default(0),
    folder: z.string().default(''),
    folder_id: z.string().nullable().optional(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): Snippet => {
    const snippet: Snippet = {
      id: row.id,
      title: row.title,
      content: row.content,
      language: row.language,
      folder: row.folder,
      tags: parseStringArray(row.tags),
      favorite:
        row.favorite === true || row.favorite === 1 || parseStringArray(row.tags).includes('⭐'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    if (row.folder_id != null) snippet.folderId = row.folder_id
    return snippet
  })

/** Validates a raw resource_folders row and transforms it into a ResourceFolder. */
export const resourceFolderRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable(),
    kind: z.enum(['notes', 'snippets', 'apiRequests']),
    sort_order: z.number(),
    default_language: z.string().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): ResourceFolder => {
    const folder: ResourceFolder = {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      kind: row.kind,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    if (row.default_language != null) folder.defaultLanguage = row.default_language
    return folder
  })

/** Validates a raw user_prompt_templates row from SQLite and transforms it into a PromptTemplate. */
export const promptTemplateRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().default(''),
    category: promptTemplateCategorySchema,
    tags: z.string(),
    prompt: z.string(),
    variables_schema: z.string(),
    estimated_tokens: z.number(),
    optimized_for: promptTemplateOptimizedForSchema,
    author: z.enum(['builtin', 'user']).default('user'),
    version: z.string().default('1.0.0'),
    tips: z.string().default('[]'),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): PromptTemplate => {
    let variables: PromptTemplateVariable[]
    try {
      const parsed = JSON.parse(row.variables_schema)
      const result = z.array(promptTemplateVariableSchema).safeParse(parsed)
      variables = result.success
        ? result.data.map((variable) => {
            const nextVariable: PromptTemplateVariable = {
              name: variable.name,
              label: variable.label,
              type: variable.type,
            }
            if (variable.placeholder) nextVariable.placeholder = variable.placeholder
            if (variable.options) nextVariable.options = variable.options
            if (variable.required !== undefined) nextVariable.required = variable.required
            return nextVariable
          })
        : []
    } catch {
      variables = []
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: parseStringArray(row.tags),
      prompt: row.prompt,
      variables,
      estimatedTokens: row.estimated_tokens,
      optimizedFor: row.optimized_for,
      author: row.author,
      version: row.version,
      tips: parseStringArray(row.tips),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

/** Validates a raw HistoryRow from SQLite and transforms it into a HistoryEntry. */
export const historyRowSchema = z
  .object({
    id: z.string(),
    tool: z.string(),
    sub_tab: z.string().nullable(),
    input: z.string(),
    output: z.string(),
    timestamp: z.number(),
    duration_ms: z.number().nullable(),
    success: z.number().nullable(),
    output_size: z.number().nullable(),
    starred: z.number().nullable(),
    response_body: z.string().nullable().optional(),
    response_mime_type: z.string().nullable().optional(),
    response_status: z.number().nullable().optional(),
    response_status_text: z.string().nullable().optional(),
  })
  .transform((row): HistoryEntry => {
    const entry: HistoryEntry = {
      id: row.id,
      tool: row.tool,
      input: row.input,
      output: row.output,
      timestamp: row.timestamp,
    }
    if (row.sub_tab != null) {
      entry.subTab = row.sub_tab
    }
    if (row.duration_ms != null) {
      entry.durationMs = row.duration_ms
    }
    if (row.success != null) {
      entry.success = row.success === 1
    }
    if (row.output_size != null) {
      entry.outputSize = row.output_size
    }
    if (row.starred != null) {
      entry.starred = row.starred === 1
    }
    if (row.response_body != null) entry.responseBody = row.response_body
    if (row.response_mime_type != null) entry.responseMimeType = row.response_mime_type
    if (row.response_status != null) entry.responseStatus = row.response_status
    if (row.response_status_text != null) entry.responseStatusText = row.response_status_text
    return entry
  })

// --- API Client Schemas ---

export const apiEnvironmentRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    variables: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): import('@/types/models').ApiEnvironment => {
    return {
      id: row.id,
      name: row.name,
      variables: (() => {
        try {
          return JSON.parse(row.variables)
        } catch {
          return {}
        }
      })(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

export const apiCollectionRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable().optional(),
    sort_order: z.number().optional(),
    default_language: z.string().nullable().optional(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): import('@/types/models').ApiCollection => {
    const collection: import('@/types/models').ApiCollection = {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    if (row.parent_id !== undefined) collection.parentId = row.parent_id
    if (row.sort_order !== undefined) collection.sortOrder = row.sort_order
    if (row.default_language != null) collection.defaultLanguage = row.default_language
    return collection
  })

export const apiRequestRowSchema = z
  .object({
    id: z.string(),
    collection_id: z.string().nullable(),
    name: z.string(),
    method: z.string(),
    url: z.string(),
    headers: z.string(),
    body: z.string(),
    body_mode: z.string(),
    auth: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): import('@/types/models').ApiRequest => {
    return {
      id: row.id,
      collectionId: row.collection_id,
      name: row.name,
      method: row.method,
      url: row.url,
      headers: (() => {
        try {
          return JSON.parse(row.headers)
        } catch {
          return []
        }
      })(),
      body: row.body,
      bodyMode: row.body_mode,
      auth: (() => {
        try {
          return JSON.parse(row.auth)
        } catch {
          return { type: 'none' }
        }
      })(),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
