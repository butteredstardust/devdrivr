import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ApiCollection,
  ApiEnvironment,
  ApiRequest,
  HistoryEntry,
  Note,
  PromptTemplate,
  ResourceFolder,
  Snippet,
} from '@/types/models'
import { createSqliteTestDatabase, type SqliteTestDatabase } from '@/test-utils/sqlite-db'

const sqliteMock = vi.hoisted(() => ({
  database: undefined as SqliteTestDatabase | undefined,
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: async () => {
      if (!sqliteMock.database) throw new Error('SQLite test database is not ready')
      return sqliteMock.database.connection
    },
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, payload?: unknown) => {
    if (!sqliteMock.database) throw new Error('SQLite test database is not ready')
    return sqliteMock.database.invoke(command, payload)
  },
}))

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: `Note ${id}`,
    content: '',
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    createdAt: 10,
    updatedAt: 20,
    tags: [],
    sortOrder: 1_000,
    folderId: 'notes-inbox',
    ...overrides,
  }
}

describe('db.ts with SQLite', () => {
  beforeEach(() => {
    vi.resetModules()
    sqliteMock.database = createSqliteTestDatabase()
  })

  afterEach(() => {
    sqliteMock.database?.close()
    sqliteMock.database = undefined
  })

  it('binds numbered parameters by index and rolls back failed batches', async () => {
    const database = sqliteMock.database
    if (!database) throw new Error('SQLite test database is not ready')

    await database.connection.execute('INSERT INTO settings (key, value) VALUES ($2, $1)', [
      'stored-value',
      'stored-key',
    ])
    await expect(
      database.connection.select<Array<{ key: string; value: string }>>(
        'SELECT key, value FROM settings'
      )
    ).resolves.toEqual([{ key: 'stored-key', value: 'stored-value' }])

    await expect(
      database.invoke('db_execute_batch', {
        statements: [
          {
            sql: 'INSERT INTO settings (key, value) VALUES ($1, $2)',
            params: ['rolled-back', 'first'],
          },
          {
            sql: 'INSERT INTO settings (key, value) VALUES ($1, $2)',
            params: ['stored-key', 'duplicate'],
          },
        ],
        immediate: true,
      })
    ).rejects.toThrow('Batch statement failed')
    await expect(
      database.connection.select<Array<{ key: string }>>(
        'SELECT key FROM settings WHERE key = $1',
        ['rolled-back']
      )
    ).resolves.toEqual([])
  })

  it('round-trips settings and tool state', async () => {
    const { deleteToolState, getSetting, loadToolState, saveToolState, setSetting } =
      await import('@/lib/db')

    await setSetting('editor', { fontSize: 15, wrap: true })
    await expect(getSetting('editor', null)).resolves.toEqual({ fontSize: 15, wrap: true })
    await expect(getSetting('missing', 'fallback')).resolves.toBe('fallback')

    await saveToolState('json-tools#one', { source: 'λ', enabled: false })
    await expect(loadToolState('json-tools#one')).resolves.toEqual({
      source: 'λ',
      enabled: false,
    })
    await deleteToolState('json-tools#one')
    await expect(loadToolState('json-tools#one')).resolves.toBeNull()
  })

  it('round-trips note fields, order, links, and durable trash', async () => {
    const {
      deleteNote,
      loadNotes,
      loadTrashedNotes,
      permanentlyDeleteNote,
      restoreNote,
      saveNote,
      saveNotesOrder,
    } = await import('@/lib/db')

    await saveNote(
      note('first', {
        content: 'See [[snippet:snippet-1|Parser]] and [[note:second|Next]].',
        tags: ['work', 'unicode-λ'],
        taskStatus: 'in_progress',
        taskPriority: 'high',
        taskDueDate: '2026-09-24',
        windowBounds: { x: 1, y: 2, width: 640, height: 480 },
      })
    )
    await saveNote(note('second', { sortOrder: 2_000 }))
    await saveNotesOrder([
      { id: 'first', sortOrder: 3_000 },
      { id: 'second', sortOrder: 1_000 },
    ])

    const saved = await loadNotes()
    expect(saved.map((item) => item.id)).toEqual(['second', 'first'])
    expect(saved[1]).toEqual(
      expect.objectContaining({
        tags: ['work', 'unicode-λ'],
        taskStatus: 'in_progress',
        taskPriority: 'high',
        taskDueDate: '2026-09-24',
        windowBounds: { x: 1, y: 2, width: 640, height: 480 },
      })
    )

    const links = await sqliteMock.database?.connection.select<
      Array<{ source_note_id: string; target_kind: string; target_id: string }>
    >(
      'SELECT source_note_id, target_kind, target_id FROM note_links ORDER BY target_kind, target_id'
    )
    expect(links).toEqual([
      { source_note_id: 'first', target_kind: 'note', target_id: 'second' },
      { source_note_id: 'first', target_kind: 'snippet', target_id: 'snippet-1' },
    ])

    await deleteNote('first')
    await expect(loadNotes()).resolves.toHaveLength(1)
    await expect(loadTrashedNotes()).resolves.toEqual([
      expect.objectContaining({ id: 'first', deletedAt: expect.any(Number) }),
    ])
    await restoreNote('first')
    await expect(loadNotes()).resolves.toHaveLength(2)
    await deleteNote('first')
    await permanentlyDeleteNote('first')
    await expect(loadTrashedNotes()).resolves.toEqual([])
  })

  it('round-trips snippets with ordered fragments and durable trash', async () => {
    const {
      deleteSnippet,
      loadSnippets,
      loadTrashedSnippets,
      permanentlyDeleteSnippet,
      restoreSnippet,
      saveSnippet,
    } = await import('@/lib/db')
    const snippet: Snippet = {
      id: 'snippet-1',
      title: 'Parser',
      content: 'legacy',
      language: 'text',
      description: 'Two-file example',
      fragments: [
        {
          id: 'fragment-b',
          name: 'test',
          content: 'expect(parse()).toBe(true)',
          language: 'typescript',
          sortOrder: 20,
          createdAt: 3,
          updatedAt: 4,
        },
        {
          id: 'fragment-a',
          name: 'main',
          content: 'export const parse = () => true',
          language: 'typescript',
          sortOrder: 10,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      tags: ['parser'],
      favorite: true,
      folder: '',
      folderId: 'snippets-inbox',
      createdAt: 1,
      updatedAt: 4,
    }

    await saveSnippet(snippet)
    const [saved] = await loadSnippets()
    expect(saved).toEqual(
      expect.objectContaining({
        id: snippet.id,
        content: 'expect(parse()).toBe(true)',
        description: 'Two-file example',
        favorite: true,
        tags: ['parser'],
      })
    )
    expect(saved?.fragments?.map((fragment) => fragment.name)).toEqual(['test', 'main'])

    await deleteSnippet(snippet.id)
    await expect(loadTrashedSnippets()).resolves.toEqual([
      expect.objectContaining({ id: snippet.id, deletedAt: expect.any(Number) }),
    ])
    await restoreSnippet(snippet.id)
    await expect(loadSnippets()).resolves.toHaveLength(1)
    await deleteSnippet(snippet.id)
    await permanentlyDeleteSnippet(snippet.id)
    await expect(loadTrashedSnippets()).resolves.toEqual([])
  })

  it('round-trips history metadata and prunes older rows', async () => {
    const { addHistoryEntry, clearAllHistory, loadHistory, pruneHistory } = await import('@/lib/db')
    const first: HistoryEntry = {
      id: 'history-1',
      tool: 'api-client',
      subTab: 'response',
      input: 'GET /one',
      output: 'ok',
      timestamp: 100,
      durationMs: 12,
      success: true,
      outputSize: 2,
      starred: true,
      responseBody: '{"ok":true}',
      responseMimeType: 'application/json',
      responseStatus: 200,
      responseStatusText: 'OK',
    }
    const second: HistoryEntry = { ...first, id: 'history-2', timestamp: 200 }

    await addHistoryEntry(first)
    await addHistoryEntry(second)
    await expect(loadHistory('api-client')).resolves.toEqual([second, first])
    await pruneHistory('api-client', 1)
    await expect(loadHistory()).resolves.toEqual([second])
    await clearAllHistory()
    await expect(loadHistory()).resolves.toEqual([])
  })

  it('round-trips API collections, requests, and environments', async () => {
    const {
      deleteApiCollection,
      deleteApiEnvironment,
      deleteApiRequest,
      loadApiCollections,
      loadApiEnvironments,
      loadApiRequests,
      loadTrashedApiCollections,
      loadTrashedApiRequests,
      restoreApiCollection,
      restoreApiRequest,
      saveApiCollection,
      saveApiEnvironment,
      saveApiRequest,
    } = await import('@/lib/db')
    const environment: ApiEnvironment = {
      id: 'environment-1',
      name: 'Local',
      variables: { baseUrl: 'http://localhost:3000', enabled: 'true' },
      createdAt: 1,
      updatedAt: 2,
    }
    const collection: ApiCollection = {
      id: 'collection-1',
      name: 'Users',
      parentId: 'api-requests-inbox',
      sortOrder: 100,
      defaultLanguage: 'json',
      createdAt: 3,
      updatedAt: 4,
    }
    const request: ApiRequest = {
      id: 'request-1',
      collectionId: collection.id,
      name: 'Create user',
      method: 'POST',
      url: '{{baseUrl}}/users',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: '{"name":"Ada"}',
      bodyMode: 'json',
      auth: { type: 'bearer', token: '{{token}}' },
      createdAt: 5,
      updatedAt: 6,
    }

    await saveApiEnvironment(environment)
    await saveApiCollection(collection)
    await saveApiRequest(request)
    await expect(loadApiEnvironments()).resolves.toEqual([environment])
    await expect(loadApiCollections()).resolves.toContainEqual(collection)
    await expect(loadApiRequests()).resolves.toEqual([request])

    await deleteApiRequest(request.id)
    await expect(loadTrashedApiRequests()).resolves.toEqual([
      expect.objectContaining({ id: request.id, deletedAt: expect.any(Number) }),
    ])
    await restoreApiRequest(request.id)
    await deleteApiCollection(collection.id)
    await expect(loadTrashedApiCollections()).resolves.toEqual([
      expect.objectContaining({ id: collection.id, deletedAt: expect.any(Number) }),
    ])
    await expect(loadTrashedApiRequests()).resolves.toEqual([
      expect.objectContaining({ id: request.id, deletedAt: expect.any(Number) }),
    ])
    await restoreApiCollection(collection.id)
    await expect(loadApiRequests()).resolves.toEqual([request])
    await deleteApiEnvironment(environment.id)
    await expect(loadApiEnvironments()).resolves.toEqual([])
  })

  it('round-trips user prompt templates', async () => {
    const { deleteUserPromptTemplate, loadUserPromptTemplates, saveUserPromptTemplate } =
      await import('@/lib/db')
    const template: PromptTemplate = {
      id: 'template-1',
      name: 'Review',
      description: 'Review a change',
      category: 'code-review',
      tags: ['quality'],
      prompt: 'Review {{code}}',
      variables: [
        {
          name: 'code',
          label: 'Code',
          type: 'textarea',
          required: true,
          example: 'const answer = 42',
        },
      ],
      estimatedTokens: 120,
      optimizedFor: 'Generic',
      author: 'user',
      version: '1.0.0',
      tips: ['Include context'],
      createdAt: 1,
      updatedAt: 2,
    }

    await saveUserPromptTemplate(template)
    await expect(loadUserPromptTemplates()).resolves.toEqual([template])
    await deleteUserPromptTemplate(template.id)
    await expect(loadUserPromptTemplates()).resolves.toEqual([])
  })

  it('round-trips resource folders, order, and subtree trash state', async () => {
    const {
      loadResourceFolders,
      loadTrashedResourceFolders,
      permanentlyDeleteResourceFolderSubtree,
      restoreResourceFolderSubtree,
      saveResourceFolder,
      saveResourceFolderOrder,
      trashResourceFolderSubtree,
    } = await import('@/lib/db')
    const parent: ResourceFolder = {
      id: 'notes-project',
      name: 'Project',
      parentId: 'notes-inbox',
      kind: 'notes',
      sortOrder: 2_000,
      createdAt: 1,
      updatedAt: 2,
    }
    const child: ResourceFolder = {
      id: 'notes-project-child',
      name: 'Child',
      parentId: parent.id,
      kind: 'notes',
      sortOrder: 1_000,
      createdAt: 3,
      updatedAt: 4,
    }

    await saveResourceFolder(parent)
    await saveResourceFolder(child)
    await saveResourceFolderOrder([
      { id: parent.id, sortOrder: 500 },
      { id: child.id, sortOrder: 250 },
    ])
    expect(await loadResourceFolders()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: parent.id, sortOrder: 500 }),
        expect.objectContaining({ id: child.id, parentId: parent.id, sortOrder: 250 }),
      ])
    )

    await trashResourceFolderSubtree(parent.id)
    expect((await loadTrashedResourceFolders()).map((folder) => folder.id)).toEqual(
      expect.arrayContaining([parent.id, child.id])
    )
    await restoreResourceFolderSubtree(parent.id)
    expect((await loadResourceFolders()).map((folder) => folder.id)).toEqual(
      expect.arrayContaining([parent.id, child.id])
    )
    await trashResourceFolderSubtree(parent.id)
    await permanentlyDeleteResourceFolderSubtree(parent.id)
    expect((await loadTrashedResourceFolders()).map((folder) => folder.id)).not.toContain(parent.id)
  })
})
