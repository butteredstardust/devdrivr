import { z } from 'zod'
import type { Note, Snippet, HistoryEntry } from '@/types/models'

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
    }
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
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): Snippet => ({
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    tags: (() => {
      try {
        const parsed = JSON.parse(row.tags)
        const result = z.array(z.string()).safeParse(parsed)
        return result.success ? result.data : []
      } catch {
        return []
      }
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

/** Validates a raw HistoryRow from SQLite and transforms it into a HistoryEntry. */
export const historyRowSchema = z
  .object({
    id: z.string(),
    tool: z.string(),
    sub_tab: z.string().nullable(),
    input: z.string(),
    output: z.string(),
    timestamp: z.number(),
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
    created_at: z.number(),
    updated_at: z.number(),
  })
  .transform((row): import('@/types/models').ApiCollection => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

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
