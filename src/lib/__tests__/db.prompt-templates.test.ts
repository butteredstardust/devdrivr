import { describe, expect, it, vi } from 'vitest'
import type { PromptTemplate } from '@/types/models'
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

function makeTemplate(id: string, overrides: Partial<PromptTemplate> = {}): PromptTemplate {
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
    ...overrides,
  }
}

async function rows(): Promise<Array<{ id: string; author: string; name: string }>> {
  return database().connection.select(
    'SELECT id, author, name FROM user_prompt_templates ORDER BY id'
  )
}

describe('prompt templates', () => {
  it('round-trips a user template', async () => {
    const { loadUserPromptTemplates, saveUserPromptTemplate } = await import('@/lib/db')
    const template = makeTemplate('a', {
      category: 'security',
      tags: ['owasp'],
      tips: ['Be brief'],
    })

    await saveUserPromptTemplate(template)

    await expect(loadUserPromptTemplates()).resolves.toEqual([template])
  })

  it('saves a batch of templates together', async () => {
    const { loadUserPromptTemplates, saveUserPromptTemplates } = await import('@/lib/db')

    await saveUserPromptTemplates([makeTemplate('a'), makeTemplate('b')])

    expect((await loadUserPromptTemplates()).map((t) => t.id).sort()).toEqual(['a', 'b'])
  })

  it('writes nothing from a batch when one template fails', async () => {
    const { saveUserPromptTemplates } = await import('@/lib/db')
    const broken = makeTemplate('b', { name: null as unknown as string })

    await expect(saveUserPromptTemplates([makeTemplate('a'), broken])).rejects.toThrow(
      'NOT NULL constraint failed'
    )

    expect(await rows()).toEqual([])
  })

  it('seeds builtins, removes retired ones, and leaves user templates alone', async () => {
    const { saveUserPromptTemplate, seedBuiltinPromptTemplates } = await import('@/lib/db')
    await saveUserPromptTemplate(makeTemplate('mine'))
    await seedBuiltinPromptTemplates([makeTemplate('kept'), makeTemplate('retired')])

    await seedBuiltinPromptTemplates([makeTemplate('kept', { name: 'Kept, renamed' })])

    expect(await rows()).toEqual([
      { id: 'kept', author: 'builtin', name: 'Kept, renamed' },
      { id: 'mine', author: 'user', name: 'Template mine' },
    ])
  })

  it('never overwrites a user template that shares a builtin id', async () => {
    const { saveUserPromptTemplate, seedBuiltinPromptTemplates } = await import('@/lib/db')
    await saveUserPromptTemplate(makeTemplate('shared', { name: 'My version' }))

    await seedBuiltinPromptTemplates([makeTemplate('shared', { name: 'Shipped version' })])

    expect(await rows()).toEqual([{ id: 'shared', author: 'user', name: 'My version' }])
  })

  it('never empties the library when the shipped set is empty', async () => {
    // `NOT IN ()` is a syntax error, and an empty set is a build fault rather than an
    // instruction to delete every builtin.
    const { seedBuiltinPromptTemplates } = await import('@/lib/db')
    await seedBuiltinPromptTemplates([makeTemplate('kept')])

    await seedBuiltinPromptTemplates([])

    expect((await rows()).map((row) => row.id)).toEqual(['kept'])
  })
})
