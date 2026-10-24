import { describe, expect, it, vi } from 'vitest'
import type { Note } from '@/types/models'
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

async function links(): Promise<Array<[string, string, string]>> {
  const rows = await database().connection.select<
    Array<{ source_note_id: string; target_kind: string; target_id: string }>
  >(
    'SELECT source_note_id, target_kind, target_id FROM note_links ORDER BY source_note_id, target_kind, target_id'
  )
  return rows.map((row) => [row.source_note_id, row.target_kind, row.target_id])
}

describe('wiki link index', () => {
  it('indexes each stable target once and ignores title-only links', async () => {
    const { saveNote } = await import('@/lib/db')

    await saveNote(
      note(
        'source',
        '[[note:target|Plan]] [[snippet:helper|Helper]] [[note:target|Renamed plan]] [[Legacy]]'
      )
    )

    expect(await links()).toEqual([
      ['source', 'note', 'target'],
      ['source', 'snippet', 'helper'],
    ])
  })

  it('replaces a note’s links when it is saved again', async () => {
    const { saveNote } = await import('@/lib/db')
    await saveNote(note('source', '[[note:old|Old]]'))

    await saveNote(note('source', '[[snippet:new|New]]'))

    expect(await links()).toEqual([['source', 'snippet', 'new']])
  })

  it('rebuilds the whole index from note content', async () => {
    const { rebuildNoteLinks, saveNote } = await import('@/lib/db')
    const one = note('one', '[[api-request:req-1|Users]]')
    const two = note('two', 'Legacy [[Users]]')
    await saveNote(note('stale', '[[note:gone|Gone]]'))
    await saveNote(one)
    await saveNote(two)

    await rebuildNoteLinks([one, two])

    expect(await links()).toEqual([['one', 'api-request', 'req-1']])
  })
})
