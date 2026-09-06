import { beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}))
const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: sqlMock.load } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

describe('durable trash DB helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.select.mockResolvedValue([])
    sqlMock.load.mockResolvedValue({ execute: sqlMock.execute, select: sqlMock.select })
    coreMock.invoke.mockResolvedValue(undefined)
  })

  it('loads live and trashed records separately', async () => {
    const {
      loadNotes,
      loadTrashedNotes,
      loadSnippets,
      loadTrashedSnippets,
      loadApiRequests,
      loadTrashedApiRequests,
      loadApiCollections,
      loadTrashedApiCollections,
      loadResourceFolders,
      loadTrashedResourceFolders,
    } = await import('@/lib/db')

    await Promise.all([
      loadNotes(),
      loadTrashedNotes(),
      loadSnippets(),
      loadTrashedSnippets(),
      loadApiRequests(),
      loadTrashedApiRequests(),
      loadApiCollections(),
      loadTrashedApiCollections(),
      loadResourceFolders(),
      loadTrashedResourceFolders(),
    ])

    const selects = sqlMock.select.mock.calls.map(([sql]) => String(sql))
    // Five top-level resource queries plus the snippet-fragment child query.
    expect(selects.filter((sql) => sql.includes('deleted_at IS NULL'))).toHaveLength(6)
    expect(selects.filter((sql) => sql.includes('deleted_at IS NOT NULL'))).toHaveLength(6)
  })

  it('soft deletes existing helpers and restores individual resources to Inbox only when needed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const {
      deleteNote,
      deleteSnippet,
      deleteApiRequest,
      restoreNote,
      restoreSnippet,
      restoreApiRequest,
    } = await import('@/lib/db')

    await deleteNote('note-1')
    await deleteSnippet('snippet-1')
    await deleteApiRequest('request-1')
    await restoreNote('note-1')
    await restoreSnippet('snippet-1')
    await restoreApiRequest('request-1')

    expect(sqlMock.execute).toHaveBeenCalledWith(
      'UPDATE notes SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL',
      [123, 'note-1']
    )
    expect(sqlMock.execute).toHaveBeenCalledWith(
      'UPDATE snippets SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL',
      [123, 'snippet-1']
    )
    expect(sqlMock.execute).toHaveBeenCalledWith(
      'UPDATE api_requests SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL',
      [123, 'request-1']
    )
    const restoreSql = sqlMock.execute.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(restoreSql).toContain("ELSE 'notes-inbox' END")
    expect(restoreSql).toContain("ELSE 'snippets-inbox' END")
    expect(restoreSql).toContain("ELSE 'api-requests-inbox' END")
  })

  it('soft deletes and restores folder subtrees atomically with one shared timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(456)
    const { trashResourceFolderSubtree, restoreResourceFolderSubtree } = await import('@/lib/db')

    await trashResourceFolderSubtree('folder-1')
    sqlMock.select.mockResolvedValueOnce([{ deleted_at: 456 }])
    await restoreResourceFolderSubtree('folder-1')

    expect(coreMock.invoke).toHaveBeenCalledTimes(2)
    const [, trashPayload] = coreMock.invoke.mock.calls[0] as [string, { statements: unknown[] }]
    expect(trashPayload.statements).toHaveLength(5)
    expect(JSON.stringify(trashPayload)).toContain('WITH RECURSIVE subtree')
    expect(JSON.stringify(trashPayload)).toContain('456')
    const [, restorePayload] = coreMock.invoke.mock.calls[1] as [string, { statements: unknown[] }]
    expect(JSON.stringify(restorePayload)).toContain('deleted_at = NULL')
  })

  it('hard deletes only trashed data and keeps permanent subtree bindings defined', async () => {
    const {
      permanentlyDeleteNote,
      permanentlyDeleteSnippet,
      permanentlyDeleteApiRequest,
      permanentlyDeleteResourceFolderSubtree,
      emptyResourceTrash,
    } = await import('@/lib/db')

    await permanentlyDeleteNote('note-1')
    await permanentlyDeleteSnippet('snippet-1')
    await permanentlyDeleteApiRequest('request-1')
    await permanentlyDeleteResourceFolderSubtree('folder-1')
    await emptyResourceTrash('apiRequests')

    const singleDeletes = sqlMock.execute.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(singleDeletes).toMatch(/DELETE FROM notes WHERE id = \$1 AND deleted_at IS NOT NULL/)
    expect(singleDeletes).toMatch(/DELETE FROM snippets WHERE id = \$1 AND deleted_at IS NOT NULL/)
    expect(singleDeletes).toMatch(
      /DELETE FROM api_requests WHERE id = \$1 AND deleted_at IS NOT NULL/
    )
    const [, subtreePayload] = coreMock.invoke.mock.calls[0] as [
      string,
      { statements: Array<{ params: unknown[] }> },
    ]
    expect(subtreePayload.statements.every((statement) => statement.params[0] === 'folder-1')).toBe(
      true
    )
    const [, emptyPayload] = coreMock.invoke.mock.calls[1] as [string, { statements: unknown[] }]
    expect(emptyPayload.statements).toHaveLength(3)
  })
})
