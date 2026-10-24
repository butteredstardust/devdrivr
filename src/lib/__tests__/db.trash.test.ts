import { describe, expect, it, vi } from 'vitest'
import type { ApiCollection, ApiRequest, Note, ResourceFolder, Snippet } from '@/types/models'
import { useSqliteTestDatabase } from '@/test-utils/sqlite-db'

vi.mock(
  '@tauri-apps/plugin-sql',
  async () => (await import('@/test-utils/sqlite-db')).sqlitePluginModule
)
vi.mock(
  '@tauri-apps/api/core',
  async () => (await import('@/test-utils/sqlite-db')).sqliteCoreModule
)

const database = useSqliteTestDatabase()

function folder(id: string, kind: ResourceFolder['kind'], parentId: string | null): ResourceFolder {
  return { id, name: id, parentId, kind, sortOrder: 1_000, createdAt: 1, updatedAt: 1 }
}

function note(id: string, folderId: string): Note {
  return {
    id,
    title: id,
    content: '',
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    tags: [],
    sortOrder: 1_000,
    folderId,
    createdAt: 1,
    updatedAt: 2,
  }
}

function snippet(id: string, folderId: string): Snippet {
  return {
    id,
    title: id,
    content: 'body',
    language: 'text',
    tags: [],
    favorite: false,
    folder: '',
    folderId,
    createdAt: 1,
    updatedAt: 2,
  }
}

function request(id: string, collectionId: string): ApiRequest {
  return {
    id,
    collectionId,
    name: id,
    method: 'GET',
    url: 'https://example.com',
    headers: [],
    body: '',
    bodyMode: 'none',
    auth: { type: 'none' },
    createdAt: 1,
    updatedAt: 2,
  }
}

async function deletedAt(table: string, id: string): Promise<number | null | undefined> {
  const rows = await database().connection.select<Array<{ deleted_at: number | null }>>(
    `SELECT deleted_at FROM ${table} WHERE id = $1`,
    [id]
  )
  return rows[0]?.deleted_at
}

describe('durable trash', () => {
  it('moves records between the live and trashed lists', async () => {
    const db = await import('@/lib/db')
    await db.saveNote(note('note-1', 'notes-inbox'))
    await db.saveSnippet(snippet('snippet-1', 'snippets-inbox'))
    await db.saveApiRequest(request('request-1', 'api-requests-inbox'))

    await db.deleteNote('note-1')
    await db.deleteSnippet('snippet-1')
    await db.deleteApiRequest('request-1')

    expect(await db.loadNotes()).toEqual([])
    expect((await db.loadTrashedNotes()).map((n) => n.id)).toEqual(['note-1'])
    expect(await db.loadSnippets()).toEqual([])
    expect((await db.loadTrashedSnippets()).map((s) => s.id)).toEqual(['snippet-1'])
    expect(await db.loadApiRequests()).toEqual([])
    expect((await db.loadTrashedApiRequests()).map((r) => r.id)).toEqual(['request-1'])
  })

  it('restores a record to its folder, or to Inbox when the folder is gone', async () => {
    const db = await import('@/lib/db')
    await db.saveResourceFolder(folder('kept', 'notes', null))
    await db.saveResourceFolder(folder('trashed', 'notes', null))
    await db.saveNote(note('in-kept', 'kept'))
    await db.saveNote(note('in-trashed', 'trashed'))
    await db.deleteNote('in-kept')
    await db.deleteNote('in-trashed')
    await db.trashResourceFolderSubtree('trashed')

    await db.restoreNote('in-kept')
    await db.restoreNote('in-trashed')

    const restored = Object.fromEntries((await db.loadNotes()).map((n) => [n.id, n.folderId]))
    expect(restored).toEqual({ 'in-kept': 'kept', 'in-trashed': 'notes-inbox' })
  })

  it('restores snippets and API requests to Inbox when their folder is gone', async () => {
    const db = await import('@/lib/db')
    await db.saveResourceFolder(folder('snippet-folder', 'snippets', null))
    await db.saveApiCollection({ id: 'collection', name: 'Collection', createdAt: 1, updatedAt: 1 })
    await db.saveSnippet(snippet('snippet-1', 'snippet-folder'))
    await db.saveApiRequest(request('request-1', 'collection'))
    await db.deleteSnippet('snippet-1')
    await db.deleteApiRequest('request-1')
    await db.trashResourceFolderSubtree('snippet-folder')
    await db.trashResourceFolderSubtree('collection')

    await db.restoreSnippet('snippet-1')
    await db.restoreApiRequest('request-1')

    expect((await db.loadSnippets()).map((s) => s.folderId)).toEqual(['snippets-inbox'])
    expect((await db.loadApiRequests()).map((r) => r.collectionId)).toEqual(['api-requests-inbox'])
  })

  it('trashes a folder subtree and its contents with one timestamp, and restores only those', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const db = await import('@/lib/db')
    await db.saveResourceFolder(folder('root', 'notes', null))
    await db.saveResourceFolder(folder('child', 'notes', 'root'))
    await db.saveNote(note('in-child', 'child'))
    await db.saveNote(note('already-trashed', 'child'))
    await db.deleteNote('already-trashed')

    vi.spyOn(Date, 'now').mockReturnValue(456)
    await db.trashResourceFolderSubtree('root')

    expect(await deletedAt('resource_folders', 'root')).toBe(456)
    expect(await deletedAt('resource_folders', 'child')).toBe(456)
    expect(await deletedAt('notes', 'in-child')).toBe(456)
    // Trashed before the folder: the folder deletion must not claim it.
    expect(await deletedAt('notes', 'already-trashed')).toBe(100)

    await db.restoreResourceFolderSubtree('root')

    expect(await deletedAt('resource_folders', 'root')).toBeNull()
    expect(await deletedAt('resource_folders', 'child')).toBeNull()
    expect(await deletedAt('notes', 'in-child')).toBeNull()
    expect(await deletedAt('notes', 'already-trashed')).toBe(100)
  })

  it('permanently deletes only what is already in Trash', async () => {
    const db = await import('@/lib/db')
    await db.saveNote(note('live', 'notes-inbox'))
    await db.saveNote(note('trashed', 'notes-inbox'))
    await db.saveSnippet(snippet('live-snippet', 'snippets-inbox'))
    await db.saveApiRequest(request('live-request', 'api-requests-inbox'))
    await db.deleteNote('trashed')

    await db.permanentlyDeleteNote('live')
    await db.permanentlyDeleteNote('trashed')
    await db.permanentlyDeleteSnippet('live-snippet')
    await db.permanentlyDeleteApiRequest('live-request')

    expect(await deletedAt('notes', 'live')).toBeNull()
    expect(await deletedAt('notes', 'trashed')).toBeUndefined()
    expect(await deletedAt('snippets', 'live-snippet')).toBeNull()
    expect(await deletedAt('api_requests', 'live-request')).toBeNull()
  })

  it('permanently deletes a trashed folder subtree, children before parents', async () => {
    const db = await import('@/lib/db')
    await db.saveResourceFolder(folder('root', 'notes', null))
    await db.saveResourceFolder(folder('child', 'notes', 'root'))
    await db.saveResourceFolder(folder('grandchild', 'notes', 'child'))
    await db.saveNote(note('deep', 'grandchild'))
    await db.trashResourceFolderSubtree('root')

    await db.permanentlyDeleteResourceFolderSubtree('root')

    expect(await db.loadTrashedResourceFolders()).toEqual([])
    expect(await db.loadTrashedNotes()).toEqual([])
  })

  it('empties Trash for one resource kind and leaves the others', async () => {
    const db = await import('@/lib/db')
    const parent: ApiCollection = { id: 'api-parent', name: 'Parent', createdAt: 1, updatedAt: 1 }
    const child: ApiCollection = { ...parent, id: 'api-child', parentId: 'api-parent' }
    await db.saveApiCollection(parent)
    await db.saveApiCollection(child)
    await db.saveApiRequest(request('request-1', 'api-child'))
    await db.saveNote(note('trashed-note', 'notes-inbox'))
    await db.deleteNote('trashed-note')
    await db.trashResourceFolderSubtree('api-parent')

    await db.emptyResourceTrash('apiRequests')

    expect(await db.loadTrashedApiCollections()).toEqual([])
    expect(await db.loadTrashedApiRequests()).toEqual([])
    expect((await db.loadTrashedNotes()).map((n) => n.id)).toEqual(['trashed-note'])
  })
})
