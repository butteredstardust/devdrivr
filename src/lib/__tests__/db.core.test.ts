import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: sqlMock.load,
  },
}))

function createConnection() {
  return {
    execute: sqlMock.execute,
    select: sqlMock.select,
  }
}

describe('core DB helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.resetModules()
    sqlMock.execute.mockReset()
    sqlMock.select.mockReset()
    sqlMock.load.mockReset()
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.load.mockResolvedValue(createConnection())
  })

  it('shares one initialized connection across concurrent getDb calls', async () => {
    const { getDb } = await import('@/lib/db')

    const first = getDb()
    const second = getDb()

    expect(first).toBe(second)
    await expect(first).resolves.toBe(await second)
    expect(sqlMock.load).toHaveBeenCalledOnce()
    expect(sqlMock.load).toHaveBeenCalledWith('sqlite:cockpit.db')
    expect(sqlMock.execute.mock.calls.map(([sql]) => sql)).toEqual([
      'PRAGMA journal_mode=WAL',
      'PRAGMA busy_timeout=5000',
    ])
  })

  it('clears the cached connection promise when Database.load() rejects, so a later getDb() call retries', async () => {
    sqlMock.load.mockRejectedValueOnce(new Error('db locked'))
    const { getDb } = await import('@/lib/db')

    await expect(getDb()).rejects.toThrow('db locked')

    sqlMock.load.mockResolvedValueOnce(createConnection())
    await expect(getDb()).resolves.toBeDefined()

    expect(sqlMock.load).toHaveBeenCalledTimes(2)
  })

  it('clears the cached connection promise when a PRAGMA execute() call rejects, so a later getDb() call retries', async () => {
    sqlMock.load.mockResolvedValueOnce(createConnection())
    sqlMock.execute.mockRejectedValueOnce(new Error('pragma failed'))
    const { getDb } = await import('@/lib/db')

    await expect(getDb()).rejects.toThrow('pragma failed')

    sqlMock.load.mockResolvedValueOnce(createConnection())
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    await expect(getDb()).resolves.toBeDefined()

    expect(sqlMock.load).toHaveBeenCalledTimes(2)
  })

  it('continues queued writes after an earlier write fails', async () => {
    sqlMock.execute.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.startsWith('INSERT INTO settings') && params?.[0] === 'first') {
        return Promise.reject(new Error('write failed'))
      }
      return Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
    })
    const { setSetting } = await import('@/lib/db')

    const first = setSetting('first', true)
    const second = setSetting('second', true)

    await expect(first).rejects.toThrow('write failed')
    await expect(second).resolves.toBeUndefined()
    expect(sqlMock.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO settings'), [
      'second',
      'true',
    ])
  })

  it('uses safe fallbacks for malformed persisted JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    sqlMock.select
      .mockResolvedValueOnce([{ value: '{invalid' }])
      .mockResolvedValueOnce([{ state: '{invalid' }])
    const { getSetting, loadToolState } = await import('@/lib/db')

    await expect(getSetting('theme', 'system')).resolves.toBe('system')
    await expect(loadToolState('json-tools')).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('skips invalid schema rows while retaining valid persisted records', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const validNote = {
      id: 'valid',
      title: 'Title',
      content: 'Content',
      color: 'yellow',
      pinned: 0,
      popped_out: 0,
      window_x: null,
      window_y: null,
      window_width: null,
      window_height: null,
      created_at: 1,
      updated_at: 2,
      tags: '["quality"]',
      sort_order: 1024,
    }
    const validSnippet = {
      id: 'snippet',
      title: 'Snippet',
      content: 'const value = true',
      language: 'typescript',
      tags: '{invalid',
      folder: '',
      created_at: 1,
      updated_at: 2,
    }
    sqlMock.select
      .mockResolvedValueOnce([
        validNote,
        { ...validNote, id: 42 },
        { ...validNote, id: 'bad-color', color: 'ultraviolet' },
      ])
      .mockResolvedValueOnce([validSnippet, { ...validSnippet, created_at: 'yesterday' }])
    const { loadNotes, loadSnippets } = await import('@/lib/db')

    await expect(loadNotes()).resolves.toEqual([
      expect.objectContaining({ id: 'valid', tags: ['quality'], sortOrder: 1024 }),
    ])
    await expect(loadSnippets()).resolves.toEqual([
      expect.objectContaining({ id: 'snippet', tags: [], folder: '' }),
    ])
    expect(console.warn).toHaveBeenCalledTimes(3)
  })
})
