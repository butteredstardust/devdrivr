import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '@/types/models'

const sqlMock = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), load: vi.fn() }))
const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: sqlMock.load } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

function note(id: string, content: string): Note {
  return {
    id,
    title: id,
    content,
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    tags: [],
    sortOrder: 0,
    folderId: 'notes-inbox',
    createdAt: 1,
    updatedAt: 2,
  }
}

describe('wiki link persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.select.mockResolvedValue([])
    sqlMock.load.mockResolvedValue({ execute: sqlMock.execute, select: sqlMock.select })
    coreMock.invoke.mockResolvedValue(undefined)
  })

  it('saves a note and replaces its deduplicated outgoing-link index atomically', async () => {
    const { saveNote } = await import('@/lib/db')
    await saveNote(
      note(
        'source',
        '[[note:target|Plan]] [[snippet:helper|Helper]] [[note:target|Renamed plan]] [[Legacy]]'
      )
    )

    const [, payload] = coreMock.invoke.mock.calls[0] as [
      string,
      { immediate: boolean; statements: Array<{ sql: string; params: unknown[] }> },
    ]
    expect(payload.immediate).toBe(true)
    expect(payload.statements[0]?.sql).toContain('INSERT INTO notes')
    expect(payload.statements[1]).toEqual({
      sql: 'DELETE FROM note_links WHERE source_note_id = $1',
      params: ['source'],
    })
    expect(payload.statements.slice(2).map((statement) => statement.params.slice(0, 3))).toEqual([
      ['source', 'note', 'target'],
      ['source', 'snippet', 'helper'],
    ])
  })

  it('rebuilds legacy stable-link content while ignoring title-only brackets', async () => {
    const { rebuildNoteLinks } = await import('@/lib/db')
    await rebuildNoteLinks([
      note('one', '[[api-request:req-1|Users]]'),
      note('two', 'Legacy [[Users]]'),
    ])

    const [, payload] = coreMock.invoke.mock.calls[0] as [
      string,
      { statements: Array<{ sql: string; params: unknown[] }> },
    ]
    expect(payload.statements[0]).toEqual({ sql: 'DELETE FROM note_links', params: [] })
    expect(payload.statements).toHaveLength(2)
    expect(payload.statements[1]?.params.slice(0, 3)).toEqual(['one', 'api-request', 'req-1'])
  })
})
