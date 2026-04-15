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
    sqlMock.load.mockResolvedValue({
      execute: sqlMock.execute,
      select: sqlMock.select,
    })
  })

  it('rolls back batch prompt template saves when one insert fails', async () => {
    let insertCount = 0
    sqlMock.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('INSERT INTO user_prompt_templates')) {
        insertCount += 1
        if (insertCount === 2) return Promise.reject(new Error('insert failed'))
      }
      return Promise.resolve({ rowsAffected: 0, lastInsertId: 0 })
    })

    const { saveUserPromptTemplates } = await import('@/lib/db')

    await expect(saveUserPromptTemplates([makeTemplate('a'), makeTemplate('b')])).rejects.toThrow(
      'insert failed'
    )

    const statements = sqlMock.execute.mock.calls.map(([sql]) => sql)
    expect(statements).toContain('BEGIN TRANSACTION')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })
})
