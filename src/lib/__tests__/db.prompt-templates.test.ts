import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptTemplate } from '@/types/models'

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

type BatchPayload = { statements: Array<{ sql: string; params: unknown[] }>; immediate: boolean }

function makeTemplate(id: string): PromptTemplate {
  return {
    id,
    name: `Template ${id}`,
    description: '',
    category: 'productivity',
    tags: [],
    prompt: 'Do {{task}}',
    variables: [{ name: 'task', label: 'Task', type: 'text', required: true }],
    estimatedTokens: 3,
    optimizedFor: 'Generic',
    author: 'user',
    version: '1.0.0',
    tips: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('prompt template DB helpers', () => {
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

  it('sends a batch template save as one atomic command', async () => {
    const { saveUserPromptTemplates } = await import('@/lib/db')

    await saveUserPromptTemplates([makeTemplate('a'), makeTemplate('b')])

    expect(coreMock.invoke).toHaveBeenCalledTimes(1)
    const [command, payload] = coreMock.invoke.mock.calls[0] as [string, BatchPayload]
    expect(command).toBe('db_execute_batch')
    expect(payload.immediate).toBe(false)
    expect(payload.statements).toHaveLength(2)
    expect(payload.statements[0]?.params[0]).toBe('a')
    expect(payload.statements[1]?.params[0]).toBe('b')
    // Nothing reaches the plugin pool, so there is no split-connection transaction.
    expect(sqlMock.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_prompt_templates'),
      expect.anything()
    )
  })

  it('surfaces a failed batch and issues no JS-side rollback', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('Batch statement failed: insert failed'))
    const { saveUserPromptTemplates } = await import('@/lib/db')

    await expect(saveUserPromptTemplates([makeTemplate('a'), makeTemplate('b')])).rejects.toThrow(
      'insert failed'
    )

    const statements = sqlMock.execute.mock.calls.map(([sql]) => sql)
    expect(statements).not.toContain('BEGIN TRANSACTION')
    expect(statements).not.toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })

  it('seeds builtin templates through the same atomic batch path', async () => {
    const { seedBuiltinPromptTemplates } = await import('@/lib/db')

    await seedBuiltinPromptTemplates([makeTemplate('a')])

    const [command, payload] = coreMock.invoke.mock.calls[0] as [string, BatchPayload]
    expect(command).toBe('db_execute_batch')
    expect(payload.statements[0]?.sql).toContain("author = 'builtin'")
  })

  it('removes a builtin that is no longer shipped', async () => {
    // The upsert only ever adds. Without this delete a retired builtin stays in the library
    // forever, because nothing else removes it.
    const { seedBuiltinPromptTemplates } = await import('@/lib/db')

    await seedBuiltinPromptTemplates([makeTemplate('a'), makeTemplate('b')])

    const [, payload] = coreMock.invoke.mock.calls[0] as [string, BatchPayload]
    const remove = payload.statements.at(-1)
    expect(remove?.sql).toContain('DELETE FROM user_prompt_templates')
    expect(remove?.sql).toContain("author = 'builtin'")
    expect(remove?.sql).toContain('id NOT IN ($1, $2)')
    expect(remove?.params).toEqual(['a', 'b'])
  })

  it('never empties the library when the shipped set is empty', async () => {
    // `NOT IN ()` is a syntax error, and an empty set is a build fault rather than an
    // instruction to delete every builtin.
    const { seedBuiltinPromptTemplates } = await import('@/lib/db')

    await seedBuiltinPromptTemplates([])

    expect(coreMock.invoke).not.toHaveBeenCalled()
  })

  it('leaves user templates alone while removing retired builtins', async () => {
    const { seedBuiltinPromptTemplates } = await import('@/lib/db')

    await seedBuiltinPromptTemplates([makeTemplate('a')])

    const [, payload] = coreMock.invoke.mock.calls[0] as [string, BatchPayload]
    // A user's own template is author 'user', so the scoped delete cannot reach it.
    expect(payload.statements.at(-1)?.sql).not.toContain("author = 'user'")
  })

  it('still writes a single template through the plugin connection', async () => {
    const { saveUserPromptTemplate } = await import('@/lib/db')

    await saveUserPromptTemplate(makeTemplate('a'))

    expect(coreMock.invoke).not.toHaveBeenCalled()
    expect(sqlMock.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_prompt_templates'),
      expect.arrayContaining(['a'])
    )
  })
})
