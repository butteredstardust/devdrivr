import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const coreMock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: coreMock.invoke }))

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolvePromise = res
    reject = rej
  })
  const resolve = (value?: T | PromiseLike<T>) => resolvePromise(value as T)
  return { promise, resolve, reject }
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  assertion()
}

describe('notes DB helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    sqlMock.execute.mockReset()
    sqlMock.select.mockReset()
    sqlMock.load.mockReset()
    coreMock.invoke.mockReset()
    coreMock.invoke.mockResolvedValue(undefined)
    sqlMock.execute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 })
    sqlMock.load.mockResolvedValue({
      execute: sqlMock.execute,
      select: sqlMock.select,
    })
  })

  it('sends the whole reorder as one immediate batch command', async () => {
    const { saveNotesOrder } = await import('@/lib/db')

    await saveNotesOrder([
      { id: 'a', sortOrder: 1024 },
      { id: 'b', sortOrder: 2048 },
    ])

    expect(coreMock.invoke).toHaveBeenCalledTimes(1)
    expect(coreMock.invoke).toHaveBeenCalledWith('db_execute_batch', {
      immediate: true,
      statements: [
        { sql: 'UPDATE notes SET sort_order = $1 WHERE id = $2', params: [1024, 'a'] },
        { sql: 'UPDATE notes SET sort_order = $1 WHERE id = $2', params: [2048, 'b'] },
      ],
    })
    // No JS-driven transaction control: it cannot be pinned to one pooled connection.
    const pluginStatements = sqlMock.execute.mock.calls.map(([sql]) => sql)
    expect(pluginStatements).not.toContain('BEGIN IMMEDIATE')
    expect(pluginStatements).not.toContain('COMMIT')
  })

  it('serializes reorder batches against other writes on the write queue', async () => {
    const firstBatch = deferred<void>()
    let batchCount = 0
    coreMock.invoke.mockImplementation(() => {
      batchCount += 1
      if (batchCount === 1) return firstBatch.promise
      return Promise.resolve()
    })

    const { saveNotesOrder } = await import('@/lib/db')

    const firstSave = saveNotesOrder([{ id: 'a', sortOrder: 1024 }])
    await waitForAssertion(() => expect(batchCount).toBe(1))

    const secondSave = saveNotesOrder([{ id: 'b', sortOrder: 2048 }])
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The second batch must not start until the first has settled.
    expect(batchCount).toBe(1)

    firstBatch.resolve()
    await Promise.all([firstSave, secondSave])
    expect(batchCount).toBe(2)
  })

  it('propagates batch failures to the caller', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('Batch statement failed: disk full'))
    const { saveNotesOrder } = await import('@/lib/db')

    await expect(saveNotesOrder([{ id: 'a', sortOrder: 1 }])).rejects.toThrow('disk full')
  })

  it('skips the batch command entirely for an empty reorder', async () => {
    const { saveNotesOrder } = await import('@/lib/db')

    await saveNotesOrder([])

    expect(coreMock.invoke).not.toHaveBeenCalled()
  })
})
