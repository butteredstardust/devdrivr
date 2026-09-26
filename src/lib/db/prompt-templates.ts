import type { PromptTemplate } from '@/types/models'
import { promptTemplateRowSchema } from '@/lib/schemas'
import { enqueueWrite, getDb, runBatch } from './core'
import type { BatchStatement } from './core'

// --- Prompt Templates ---

type PromptTemplateRow = {
  id: string
  name: string
  description: string
  category: string
  tags: string
  prompt: string
  variables_schema: string
  estimated_tokens: number
  optimized_for: string
  author: string
  version: string
  tips: string
  created_at: number
  updated_at: number
}

function rowToPromptTemplate(row: PromptTemplateRow): PromptTemplate | null {
  const result = promptTemplateRowSchema.safeParse(row)
  if (!result.success) {
    console.warn('[db] rowToPromptTemplate: invalid row, skipping', result.error.issues)
    return null
  }
  return result.data
}

export async function loadUserPromptTemplates(): Promise<PromptTemplate[]> {
  const conn = await getDb()
  const rows = await conn.select<PromptTemplateRow[]>(
    "SELECT * FROM user_prompt_templates WHERE author = 'user' ORDER BY updated_at DESC"
  )
  return rows
    .map(rowToPromptTemplate)
    .filter((template): template is PromptTemplate => template !== null)
}

function buildSaveUserPromptTemplate(template: PromptTemplate): BatchStatement {
  return {
    sql: `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author=$10, version=$11, tips=$12, updated_at=$14`,
    params: [
      template.id,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.tags),
      template.prompt,
      JSON.stringify(template.variables),
      template.estimatedTokens,
      template.optimizedFor,
      template.author,
      template.version,
      JSON.stringify(template.tips ?? []),
      template.createdAt ?? Date.now(),
      template.updatedAt ?? Date.now(),
    ],
  }
}

function buildSeedBuiltinPromptTemplate(template: PromptTemplate): BatchStatement {
  return {
    sql: `INSERT INTO user_prompt_templates
      (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'builtin', $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET
      name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7,
      estimated_tokens=$8, optimized_for=$9, author='builtin', version=$10, tips=$11, updated_at=$13
     WHERE author = 'builtin'`,
    params: [
      template.id,
      template.name,
      template.description,
      template.category,
      JSON.stringify(template.tags),
      template.prompt,
      JSON.stringify(template.variables),
      template.estimatedTokens,
      template.optimizedFor,
      template.version,
      JSON.stringify(template.tips ?? []),
      template.createdAt ?? Date.now(),
      template.updatedAt ?? Date.now(),
    ],
  }
}

export async function saveUserPromptTemplate(template: PromptTemplate): Promise<void> {
  const statement = buildSaveUserPromptTemplate(template)
  await enqueueWrite((conn) => conn.execute(statement.sql, statement.params))
}

export async function saveUserPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  await runBatch(templates.map(buildSaveUserPromptTemplate))
}

export async function deleteUserPromptTemplate(id: string): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute("DELETE FROM user_prompt_templates WHERE id = $1 AND author = 'user'", [id])
  )
}

/**
 * Write the shipped built-in templates, and remove any built-in row no longer shipped.
 *
 * The upsert alone only ever adds. A built-in retired in a later release would otherwise stay in
 * the library forever, because nothing else deletes it. The delete is scoped to `author='builtin'`,
 * so a template the user wrote is never touched — those are saved as `author='user'`.
 */
export async function seedBuiltinPromptTemplates(templates: PromptTemplate[]): Promise<void> {
  const ids = templates.map((template) => template.id)
  // An empty shipped set is a build error, not an instruction to empty the library.
  if (ids.length === 0) return
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ')
  const removeRetired: BatchStatement = {
    sql: `DELETE FROM user_prompt_templates WHERE author = 'builtin' AND id NOT IN (${placeholders})`,
    params: ids,
  }
  await runBatch([...templates.map(buildSeedBuiltinPromptTemplate), removeRetired])
}

/**
 * WARNING: removes user prompt templates permanently. This table has no Trash column, so there is
 * no restore path. Built-in templates are untouched.
 */
export async function clearAllUserPromptTemplates(): Promise<void> {
  await enqueueWrite((conn) =>
    conn.execute("DELETE FROM user_prompt_templates WHERE author = 'user'")
  )
}
