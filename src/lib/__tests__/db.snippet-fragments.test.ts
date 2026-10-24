import { describe, expect, it, vi } from 'vitest'
import type { ResourceFolder, Snippet } from '@/types/models'
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

function snippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snippet-1',
    title: 'Client examples',
    content: 'fetch(url)',
    language: 'typescript',
    description: 'Use these together.',
    fragments: [
      {
        id: 'fragment-1',
        name: 'client.ts',
        content: 'fetch(url)',
        language: 'typescript',
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'fragment-2',
        name: 'styles.css',
        content: '.root {}',
        language: 'css',
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    tags: [],
    favorite: false,
    folder: '',
    folderId: 'snippets-inbox',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

describe('snippet fragments', () => {
  it('round-trips a snippet with its ordered fragments and description', async () => {
    const { loadSnippet, saveSnippet } = await import('@/lib/db')

    await saveSnippet(snippet())

    const loaded = await loadSnippet('snippet-1')
    expect(loaded?.description).toBe('Use these together.')
    expect(loaded?.fragments?.map((fragment) => fragment.name)).toEqual(['client.ts', 'styles.css'])
  })

  it('mirrors the first fragment into the legacy content and language columns', async () => {
    const { loadSnippets, saveSnippet } = await import('@/lib/db')

    await saveSnippet(snippet({ content: 'stale mirror', language: 'text' }))

    const [loaded] = await loadSnippets()
    expect(loaded).toMatchObject({ content: 'fetch(url)', language: 'typescript' })
  })

  it('replaces the fragment set on save, dropping a removed fragment', async () => {
    const { loadSnippet, saveSnippet } = await import('@/lib/db')
    const original = snippet()
    await saveSnippet(original)

    await saveSnippet({ ...original, fragments: original.fragments?.slice(1) ?? [] })

    expect((await loadSnippet('snippet-1'))?.fragments?.map((fragment) => fragment.id)).toEqual([
      'fragment-2',
    ])
    const rows = await database().connection.select<Array<{ id: string }>>(
      'SELECT id FROM snippet_fragments WHERE snippet_id = $1',
      ['snippet-1']
    )
    expect(rows.map((row) => row.id)).toEqual(['fragment-2'])
  })

  it('imports folders and snippets together', async () => {
    const folder: ResourceFolder = {
      id: 'folder-1',
      name: 'Work',
      parentId: null,
      kind: 'snippets',
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    const { loadResourceFolders, loadSnippets, saveSnippetImport } = await import('@/lib/db')

    await saveSnippetImport([folder], [snippet({ folderId: folder.id, folder: folder.name })])

    expect((await loadResourceFolders()).map((entry) => entry.id)).toContain('folder-1')
    expect((await loadSnippets()).map((entry) => entry.folderId)).toEqual(['folder-1'])
  })
})
