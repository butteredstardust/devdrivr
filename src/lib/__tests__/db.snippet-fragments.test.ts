import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snippet } from '@/types/models'

const sqlMock = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), load: vi.fn() }))
const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: sqlMock.load } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

function snippet(): Snippet {
  return {
    id: 'snippet-1',
    title: 'Client examples',
    content: 'legacy mirror',
    language: 'text',
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
  }
}

describe('snippet fragment persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.select.mockResolvedValue([])
    sqlMock.load.mockResolvedValue({ execute: sqlMock.execute, select: sqlMock.select })
    coreMock.invoke.mockResolvedValue(undefined)
  })

  it('saves the snippet and all ordered fragments atomically', async () => {
    const { saveSnippet } = await import('@/lib/db')
    await saveSnippet(snippet())

    const [, payload] = coreMock.invoke.mock.calls[0] as [
      string,
      { immediate: boolean; statements: Array<{ sql: string; params: unknown[] }> },
    ]
    expect(payload.immediate).toBe(true)
    expect(payload.statements[0]?.sql).toContain('description=$5')
    expect(payload.statements[0]?.params.slice(2, 6)).toEqual([
      'fetch(url)',
      'typescript',
      'Use these together.',
      '[]',
    ])
    expect(payload.statements[1]).toEqual({
      sql: 'DELETE FROM snippet_fragments WHERE snippet_id = $1',
      params: ['snippet-1'],
    })
    expect(payload.statements.slice(2).map((statement) => statement.params.slice(0, 6))).toEqual([
      ['fragment-1', 'snippet-1', 'client.ts', 'fetch(url)', 'typescript', 0],
      ['fragment-2', 'snippet-1', 'styles.css', '.root {}', 'css', 1],
    ])
  })

  it('loads fragments in persisted order and mirrors the first for legacy consumers', async () => {
    sqlMock.select
      .mockResolvedValueOnce([
        {
          id: 'snippet-1',
          title: 'Client examples',
          content: 'fetch(url)',
          language: 'typescript',
          description: 'Use these together.',
          tags: '[]',
          folder: '',
          folder_id: 'snippets-inbox',
          deleted_at: null,
          favorite: 0,
          created_at: 1,
          updated_at: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'fragment-2',
          snippet_id: 'snippet-1',
          name: 'styles.css',
          content: '.root {}',
          language: 'css',
          sort_order: 1,
          created_at: 1,
          updated_at: 2,
        },
        {
          id: 'fragment-1',
          snippet_id: 'snippet-1',
          name: 'client.ts',
          content: 'fetch(url)',
          language: 'typescript',
          sort_order: 0,
          created_at: 1,
          updated_at: 2,
        },
      ])
    const { loadSnippets } = await import('@/lib/db')

    const [loaded] = await loadSnippets()

    expect(loaded?.fragments?.map((fragment) => fragment.name)).toEqual(['client.ts', 'styles.css'])
    expect(loaded).toMatchObject({ content: 'fetch(url)', language: 'typescript' })
  })
})
