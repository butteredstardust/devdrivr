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

const importTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(PROMPT_TEMPLATE_CATEGORY_VALUES).default('productivity'),
  tags: z.array(z.string()).optional(),
  prompt: z.string().min(1),
  variables: z.array(importVariableSchema).optional(),
  estimatedTokens: z.number().optional(),
  optimizedFor: z.enum(['Claude', 'ChatGPT', 'Cursor', 'Generic']).default('Generic'),
  version: z.string().optional(),
  tips: z.array(z.string()).optional(),
})

export function parsePromptTemplateImport(text: string): PromptTemplateDraft[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Import failed: clipboard does not contain valid JSON')
  }

  const payload = Array.isArray(parsed) ? parsed : [parsed]
  const result = z.array(importTemplateSchema).safeParse(payload)
  if (!result.success) {
    throw new Error('Import failed: JSON does not match the prompt template format')
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
