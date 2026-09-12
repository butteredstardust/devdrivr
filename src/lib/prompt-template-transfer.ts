import { z } from 'zod'
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateVariable,
  PromptTemplateVariableType,
} from '@/types/models'

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

/** Apply each limit before database writes start. */
export const MAX_PROMPT_TEMPLATE_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_PROMPT_TEMPLATE_IMPORT_ITEMS = 1000
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

export type PromptTemplateDraft = {
  name: string
  description: string
  category: PromptTemplateCategory
  tags: string[]
  prompt: string
  variables: PromptTemplateVariable[]
  estimatedTokens: number
  optimizedFor: PromptTemplate['optimizedFor']
  version: string
  tips: string[]
}

export type PromptTemplateImportSource = 'clipboard' | 'file'

function estimateTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function variableLabel(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function createVariableFromName(name: string): PromptTemplateVariable {
  const lower = name.toLowerCase()
  const type: PromptTemplateVariableType =
    lower.includes('code') ||
    lower.includes('context') ||
    lower.includes('logs') ||
    lower.includes('json') ||
    lower.includes('trace')
      ? 'textarea'
      : 'text'
  return { name, label: variableLabel(name), type, required: true }
}

function syncVariablesToPrompt(
  prompt: string,
  existingVariables: PromptTemplateVariable[]
): PromptTemplateVariable[] {
  const names = new Set<string>()
  for (const match of prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    const name = match[1]?.trim()
    if (name) names.add(name)
  }
  const existingByName = new Map(existingVariables.map((variable) => [variable.name, variable]))
  return [...names].map((name) => {
    const existing = existingByName.get(name)
    if (!existing) return createVariableFromName(name)
    if (existing.type === 'select') {
      const options = existing.options?.map((option) => option.trim()).filter(Boolean) ?? []
      return { ...existing, options: options.length > 0 ? options : ['Option'] }
    }
    return {
      name: existing.name,
      label: existing.label,
      type: existing.type,
      ...(existing.placeholder ? { placeholder: existing.placeholder } : {}),
      ...(existing.required !== undefined ? { required: existing.required } : {}),
    }
  })
}

export function templateToDraft(template?: PromptTemplate): PromptTemplateDraft {
  if (!template) {
    return {
      name: '',
      description: '',
      category: 'productivity',
      tags: [],
      prompt: 'Use the following context to help with {{task}}:\n\n{{context}}',
      variables: [
        { name: 'task', label: 'Task', type: 'text', required: true },
        { name: 'context', label: 'Context', type: 'textarea', required: true },
      ],
      estimatedTokens: 14,
      optimizedFor: 'Generic',
      version: '1.0.0',
      tips: [],
    }
  }

  return {
    name: template.author === 'builtin' ? `${template.name} (custom)` : template.name,
    description: template.description,
    category: template.category,
    tags: [...template.tags],
    prompt: template.prompt,
    variables: template.variables.map((variable) => ({
      ...variable,
      ...(variable.options ? { options: [...variable.options] } : {}),
    })),
    estimatedTokens: template.estimatedTokens,
    optimizedFor: template.optimizedFor,
    version: template.version,
    tips: [...(template.tips ?? [])],
  }
}

export function parsePromptTemplateImport(
  text: string,
  source: PromptTemplateImportSource = 'clipboard'
): PromptTemplateDraft[] {
  const sourceLabel = source === 'file' ? 'the selected file' : 'the clipboard'
  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_PROMPT_TEMPLATE_IMPORT_BYTES) {
    throw new Error(
      `Import failed: ${sourceLabel} is larger than the ${Math.round(MAX_PROMPT_TEMPLATE_IMPORT_BYTES / 1024 / 1024)} MB limit`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Import failed: ${sourceLabel} does not contain valid JSON`)
  }

  const envelope =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  const payload = Array.isArray(parsed)
    ? parsed
    : envelope?.['format'] === 'devdrivr-prompt-templates' &&
        envelope['version'] === 1 &&
        Array.isArray(envelope['templates'])
      ? envelope['templates']
      : [parsed]
  if (payload.length > MAX_PROMPT_TEMPLATE_IMPORT_ITEMS) {
    throw new Error(
      `Import failed: ${payload.length} templates exceeds the ${MAX_PROMPT_TEMPLATE_IMPORT_ITEMS} template limit`
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
  return JSON.stringify(
    {
      format: 'devdrivr-prompt-templates',
      version: 1,
      exportedAt: new Date().toISOString(),
      templates,
    },
    null,
    2
  )
}
