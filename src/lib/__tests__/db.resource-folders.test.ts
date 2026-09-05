import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResourceFolder } from '@/types/models'

const sqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}))
const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: sqlMock.load } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

const folder: ResourceFolder = {
  id: 'snippets-typescript',
  name: 'TypeScript',
  parentId: null,
  kind: 'snippets',
  sortOrder: 1_000,
  defaultLanguage: 'typescript',
  createdAt: 1,
  updatedAt: 2,
}

describe('resource folder DB helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.load.mockResolvedValue({ execute: sqlMock.execute, select: sqlMock.select })
    coreMock.invoke.mockResolvedValue(undefined)
  })

  it('loads typed folders and preserves nullable parents', async () => {
    sqlMock.select.mockResolvedValueOnce([
      {
        id: folder.id,
        name: folder.name,
        parent_id: null,
        kind: folder.kind,
        sort_order: folder.sortOrder,
        default_language: folder.defaultLanguage,
        created_at: folder.createdAt,
        updated_at: folder.updatedAt,
      },
    ])
    const { loadResourceFolders } = await import('@/lib/db')

    await expect(loadResourceFolders()).resolves.toEqual([folder])
  })

  it('persists a folder and batches sibling ordering updates', async () => {
    const { saveResourceFolder, saveResourceFolderOrder } = await import('@/lib/db')

    await saveResourceFolder(folder)
    await saveResourceFolderOrder([
      { id: folder.id, sortOrder: 1_000 },
      { id: 'snippets-javascript', sortOrder: 2_000 },
    ])

    expect(sqlMock.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO resource_folders'),
      [
        folder.id,
        folder.name,
        folder.parentId,
        folder.kind,
        folder.sortOrder,
        folder.defaultLanguage,
        folder.createdAt,
        folder.updatedAt,
      ]
    )
    expect(coreMock.invoke).toHaveBeenCalledWith('db_execute_batch', {
      statements: [
        {
          sql: 'UPDATE resource_folders SET sort_order = $1 WHERE id = $2',
          params: [1_000, folder.id],
        },
        {
          sql: 'UPDATE resource_folders SET sort_order = $1 WHERE id = $2',
          params: [2_000, 'snippets-javascript'],
        },
      ],
      immediate: true,
    })
  })
})
