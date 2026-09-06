import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { NOTE_COLORS } from '@/lib/schemas'
import type { Note, NoteColor, TaskPriority, TaskStatus } from '@/types/models'

const ASSET_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ASSET_URL_PATTERN = new RegExp(`devdrivr-asset:(${ASSET_ID})`, 'g')
const ASSET_ID_PATTERN = new RegExp(`^${ASSET_ID}$`)
const ASSET_IMAGE_PATTERN = new RegExp(`!\\[([^\\]]*)\\]\\(devdrivr-asset:(${ASSET_ID})\\)`, 'g')

export type NoteAsset = {
  id: string
  fileName: string
  mimeType: string
  size: number
  path: string
}

export type NoteAssetBackup = Omit<NoteAsset, 'size' | 'path'> & { bytes: number[] }

export type NoteBackupEntry = Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'tags'> & {
  taskStatus?: TaskStatus
  taskPriority?: TaskPriority
  taskDueDate?: string
}

type NotesBackup = {
  format: 'devdrivr-notes'
  version: 1
  exportedAt: string
  notes: NoteBackupEntry[]
  assets: NoteAssetBackup[]
}

const VALID_NOTE_COLORS = new Set<string>(NOTE_COLORS)
const TASK_STATUSES = new Set<TaskStatus>(['todo', 'in_progress', 'done', 'blocked'])
const TASK_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high'])
const MAX_ASSET_BYTES = 10 * 1024 * 1024
const MAX_BACKUP_ASSETS = 500
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

function displayName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'image'
  return (
    base
      .replace(/[\\\r\n]/g, ' ')
      .replaceAll('[', ' ')
      .replaceAll(']', ' ')
      .trim()
      .slice(0, 120) || 'image'
  )
}

export function collectNoteAssetIds(contents: Iterable<string>): string[] {
  const ids = new Set<string>()
  for (const content of contents) {
    ASSET_URL_PATTERN.lastIndex = 0
    for (const match of content.matchAll(ASSET_URL_PATTERN)) {
      const id = match[1]
      if (id) ids.add(id)
    }
  }
  return [...ids].sort()
}

export async function importNoteImage(bytes: Uint8Array, fileName: string): Promise<string> {
  const asset = await invoke<NoteAsset>('note_asset_import', { bytes: Array.from(bytes) })
  return `![${displayName(fileName)}](devdrivr-asset:${asset.id})`
}

export async function resolveNoteAssetMarkdown(content: string): Promise<string> {
  const ids = collectNoteAssetIds([content])
  if (ids.length === 0) return content
  const resolved = new Map<string, string | null>()
  await Promise.all(
    ids.map(async (id) => {
      try {
        const asset = await invoke<NoteAsset>('note_asset_resolve', { id })
        resolved.set(id, convertFileSrc(asset.path))
      } catch {
        resolved.set(id, null)
      }
    })
  )
  ASSET_IMAGE_PATTERN.lastIndex = 0
  return content.replace(ASSET_IMAGE_PATTERN, (_match, alt: string, id: string) => {
    const url = resolved.get(id)
    return url ? `![${alt}](${url})` : `**[Missing image: ${alt || 'image'}]**`
  })
}

export async function createNotesBackup(notes: Note[]): Promise<string> {
  const ids = collectNoteAssetIds(notes.map((note) => note.content))
  const assets = await invoke<NoteAssetBackup[]>('note_assets_export', { ids })
  const entries: NoteBackupEntry[] = notes.map((note) => ({
    title: note.title,
    content: note.content,
    color: note.color,
    pinned: note.pinned,
    tags: note.tags,
    ...(note.taskStatus ? { taskStatus: note.taskStatus } : {}),
    ...(note.taskPriority ? { taskPriority: note.taskPriority } : {}),
    ...(note.taskDueDate ? { taskDueDate: note.taskDueDate } : {}),
  }))
  const backup: NotesBackup = {
    format: 'devdrivr-notes',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: entries,
    assets,
  }
  return JSON.stringify(backup, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNote(value: unknown): NoteBackupEntry {
  if (!isRecord(value)) throw new Error('Backup contains an invalid note')
  if (
    typeof value.title !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.color !== 'string' ||
    !VALID_NOTE_COLORS.has(value.color) ||
    typeof value.pinned !== 'boolean' ||
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === 'string')
  ) {
    throw new Error('Backup contains an invalid note')
  }
  if (value.taskStatus !== undefined && !TASK_STATUSES.has(value.taskStatus as TaskStatus)) {
    throw new Error('Backup contains an invalid task status')
  }
  if (
    value.taskPriority !== undefined &&
    !TASK_PRIORITIES.has(value.taskPriority as TaskPriority)
  ) {
    throw new Error('Backup contains an invalid task priority')
  }
  if (value.taskDueDate !== undefined && typeof value.taskDueDate !== 'string') {
    throw new Error('Backup contains an invalid task due date')
  }
  return {
    title: value.title,
    content: value.content,
    color: value.color as NoteColor,
    pinned: value.pinned,
    tags: [...value.tags],
    ...(value.taskStatus ? { taskStatus: value.taskStatus as TaskStatus } : {}),
    ...(value.taskPriority ? { taskPriority: value.taskPriority as TaskPriority } : {}),
    ...(value.taskDueDate ? { taskDueDate: value.taskDueDate } : {}),
  }
}

function parseAssets(values: unknown[]): NoteAssetBackup[] {
  if (values.length > MAX_BACKUP_ASSETS) throw new Error('Backup contains too many note assets')
  let totalBytes = 0
  const ids = new Set<string>()
  return values.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !ASSET_ID_PATTERN.test(value.id) ||
      typeof value.fileName !== 'string' ||
      typeof value.mimeType !== 'string' ||
      !Array.isArray(value.bytes)
    ) {
      throw new Error('Backup contains an invalid note asset')
    }
    const extension = MIME_EXTENSIONS.get(value.mimeType)
    if (!extension || value.fileName !== `${value.id}.${extension}` || ids.has(value.id)) {
      throw new Error('Backup contains invalid note asset metadata')
    }
    if (
      value.bytes.length === 0 ||
      value.bytes.length > MAX_ASSET_BYTES ||
      !value.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      throw new Error('Backup contains invalid note asset bytes')
    }
    ids.add(value.id)
    totalBytes += value.bytes.length
    if (totalBytes > MAX_BACKUP_BYTES) throw new Error('Backup note assets are too large')
    return {
      id: value.id,
      fileName: value.fileName,
      mimeType: value.mimeType,
      bytes: value.bytes,
    }
  })
}

export async function restoreNotesBackup(content: string): Promise<NoteBackupEntry[]> {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('Notes backup is not valid JSON')
  }
  if (
    !isRecord(value) ||
    value.format !== 'devdrivr-notes' ||
    value.version !== 1 ||
    !Array.isArray(value.notes) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('Unsupported notes backup')
  }
  if (value.notes.length > 10_000) throw new Error('Backup contains too many notes')
  const notes = value.notes.map(parseNote)
  const assets = parseAssets(value.assets)
  await invoke<number>('note_assets_restore', { assets })
  return notes
}

export async function findOrphanNoteAssets(referencedIds: string[]): Promise<NoteAsset[]> {
  return invoke<NoteAsset[]>('note_assets_find_orphans', { referencedIds })
}

export async function deleteOrphanNoteAssets(
  ids: string[],
  referencedIds: string[]
): Promise<number> {
  return invoke<number>('note_assets_delete_orphans', { ids, referencedIds })
}
