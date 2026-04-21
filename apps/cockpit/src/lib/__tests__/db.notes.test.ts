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
    sqlMock.load.mockResolvedValue({
      execute: sqlMock.execute,
      select: sqlMock.select,
    })
  })

  it('serializes note order transactions on the shared connection', async () => {
    const firstUpdate = deferred<void>()
    let updateCount = 0
    sqlMock.execute.mockImplementation((sql: string) => {
      if (sql === 'UPDATE notes SET sort_order = $1 WHERE id = $2') {
        updateCount += 1
        if (updateCount === 1) return firstUpdate.promise
      }
      return Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
    })

    const { saveNotesOrder } = await import('@/lib/db')

    const firstSave = saveNotesOrder([{ id: 'a', sortOrder: 1024 }])
    await waitForAssertion(() => expect(updateCount).toBe(1))

    const secondSave = saveNotesOrder([{ id: 'b', sortOrder: 2048 }])
    await new Promise((resolve) => setTimeout(resolve, 0))

    const statementsBeforeCommit = sqlMock.execute.mock.calls.map(([sql]) => sql)
    expect(statementsBeforeCommit.filter((sql) => sql === 'BEGIN IMMEDIATE')).toHaveLength(1)

    firstUpdate.resolve()
    await Promise.all([firstSave, secondSave])

    const statements = sqlMock.execute.mock.calls.map(([sql]) => sql)
    const firstCommit = statements.indexOf('COMMIT')
    const secondBegin = statements.indexOf(
      'BEGIN IMMEDIATE',
      statements.indexOf('BEGIN IMMEDIATE') + 1
    )

    expect(firstCommit).toBeGreaterThan(-1)
    expect(secondBegin).toBeGreaterThan(-1)
    expect(firstCommit).toBeLessThan(secondBegin)
  })
})
