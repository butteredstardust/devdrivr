import { describe, expect, it, vi } from 'vitest'
import type { ResourceFolder } from '@/types/models'
import { useSqliteTestDatabase } from '@/test-utils/sqlite-db'

vi.mock(
  '@tauri-apps/plugin-sql',
  async () => (await import('@/test-utils/sqlite-db')).sqlitePluginModule
)
vi.mock(
  '@tauri-apps/api/core',
  async () => (await import('@/test-utils/sqlite-db')).sqliteCoreModule
)

useSqliteTestDatabase()

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

describe('resource folders', () => {
  it('round-trips a typed folder with a nullable parent and default language', async () => {
    const { loadResourceFolders, saveResourceFolder } = await import('@/lib/db')

    await saveResourceFolder(folder)

    const loaded = await loadResourceFolders()
    expect(loaded.find((entry) => entry.id === folder.id)).toEqual(folder)
  })

  it('persists a sibling reorder', async () => {
    const { loadResourceFolders, saveResourceFolder, saveResourceFolderOrder } =
      await import('@/lib/db')
    await saveResourceFolder(folder)
    await saveResourceFolder({ ...folder, id: 'snippets-javascript', name: 'JavaScript' })

    await saveResourceFolderOrder([
      { id: 'snippets-javascript', sortOrder: 1_000 },
      { id: folder.id, sortOrder: 2_000 },
    ])

    const order = Object.fromEntries(
      (await loadResourceFolders()).map((entry) => [entry.id, entry.sortOrder])
    )
    expect(order).toMatchObject({ 'snippets-javascript': 1_000, [folder.id]: 2_000 })
  })
})
