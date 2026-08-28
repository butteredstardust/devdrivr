import { z } from 'zod'
import { estimateTokens, syncVariablesToPrompt, type PromptTemplateDraft } from './template-utils'
import type { PromptTemplateVariable } from './types'

const PROMPT_TEMPLATE_CATEGORY_VALUES = [
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'learning',
  'productivity',
] as const

const importVariableSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1).optional(),
    type: z.enum(['text', 'textarea', 'select']).default('text'),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional(),
  })
  .superRefine((variable, ctx) => {
    const hasOption = variable.options?.some((option) => option.trim()) ?? false
    if (variable.type === 'select' && !hasOption) {
      ctx.addIssue({
        code: 'custom',
        message: 'Select variables require at least one option',
        path: ['options'],
      })
    }
  })

/**
 * Import limits. An import file is arbitrary local data mapped into renderer memory and then
 * written to the database in one batch, so the budget is enforced before parsing rather than
 * after a memory spike or a database rejection.
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_TEMPLATES = 1000
const MAX_PROMPT_CHARS = 100_000
const MAX_FIELD_CHARS = 2_000
const MAX_LIST_ITEMS = 100

const importTemplateSchema = z.object({
  name: z.string().min(1).max(MAX_FIELD_CHARS),
  description: z.string().max(MAX_FIELD_CHARS).optional(),
  category: z.enum(PROMPT_TEMPLATE_CATEGORY_VALUES).default('productivity'),
  tags: z.array(z.string().max(MAX_FIELD_CHARS)).max(MAX_LIST_ITEMS).optional(),
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  variables: z.array(importVariableSchema).max(MAX_LIST_ITEMS).optional(),
  estimatedTokens: z.number().optional(),
  optimizedFor: z.enum(['Claude', 'ChatGPT', 'Cursor', 'Generic']).default('Generic'),
  version: z.string().max(MAX_FIELD_CHARS).optional(),
  tips: z.array(z.string().max(MAX_FIELD_CHARS)).max(MAX_LIST_ITEMS).optional(),
})

/** Where the payload came from, so a failure sends the user to the right recovery path. */
export type ImportSource = 'clipboard' | 'file'

export function parsePromptTemplateImport(
  text: string,
  source: ImportSource = 'clipboard'
): PromptTemplateDraft[] {
  const sourceLabel = source === 'file' ? 'the selected file' : 'the clipboard'

  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_IMPORT_BYTES) {
    throw new Error(
      `Import failed: ${sourceLabel} is larger than the ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB limit`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Import failed: ${sourceLabel} does not contain valid JSON`)
  }

  const payload = Array.isArray(parsed) ? parsed : [parsed]
  if (payload.length > MAX_IMPORT_TEMPLATES) {
    throw new Error(
      `Import failed: ${payload.length} templates exceeds the ${MAX_IMPORT_TEMPLATES} template limit`
    )
  }

  const result = z.array(importTemplateSchema).safeParse(payload)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(
      issue
        ? `Import failed: ${issue.path.join('.') || 'payload'} — ${issue.message}`
        : 'Import failed: JSON does not match the prompt template format'
    )
  }

  return result.data.map((template) => {
    const prompt = template.prompt.trim()
    const variables = syncVariablesToPrompt(
      prompt,
      (template.variables ?? []).map((variable) => {
        const nextVariable: PromptTemplateVariable = {
          name: variable.name,
          label: variable.label ?? variable.name,
          type: variable.type,
        }
        if (variable.placeholder) nextVariable.placeholder = variable.placeholder
        const options = variable.options?.map((option) => option.trim()).filter(Boolean)
        if (options && options.length > 0) nextVariable.options = options
        if (variable.required !== undefined) nextVariable.required = variable.required
        return nextVariable
      })
    )

    return {
      name: template.name.trim(),
      description: template.description?.trim() ?? '',
      category: template.category,
      tags: template.tags ?? [],
      prompt,
      variables,
      estimatedTokens: template.estimatedTokens ?? estimateTokens(prompt),
      optimizedFor: template.optimizedFor,
      version: template.version?.trim() || '1.0.0',
      tips: template.tips ?? [],
    }
  })
}

export function serializePromptTemplateExport(templates: PromptTemplateDraft[]): string {
  return JSON.stringify(templates, null, 2)
}
