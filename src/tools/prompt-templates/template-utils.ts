import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateValues,
  PromptTemplateVariable,
  PromptTemplateVariableType,
  TokenTone,
} from './types'

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

export function estimateTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

export function tokenTone(tokens: number): TokenTone {
  if (tokens > 4000) return 'error'
  if (tokens > 2000) return 'warning'
  return 'success'
}

export function renderPrompt(template: PromptTemplate, values: PromptTemplateValues): string {
  return template.prompt.replace(PLACEHOLDER_PATTERN, (_, name: string) => values[name] ?? '')
}

export function getDefaultValue(variable: PromptTemplateVariable): string {
  if (variable.type === 'select') return variable.options?.[0] ?? ''
  return ''
}

export function getDefaultValues(template: PromptTemplate): PromptTemplateValues {
  return Object.fromEntries(
    template.variables.map((variable) => [variable.name, getDefaultValue(variable)])
  )
}

export function mergeDefaultValues(
  template: PromptTemplate,
  values: PromptTemplateValues | undefined
): PromptTemplateValues {
  return { ...getDefaultValues(template), ...(values ?? {}) }
}

export function missingRequiredVariables(
  template: PromptTemplate,
  values: PromptTemplateValues
): string[] {
  return template.variables
    .filter((variable) => variable.required && !values[variable.name]?.trim())
    .map((variable) => variable.label)
}

export function templateSearchText(template: PromptTemplate): string {
  return [
    template.name,
    template.description,
    template.category,
    template.optimizedFor,
    ...template.tags,
    template.prompt,
  ]
    .join(' ')
    .toLowerCase()
}

export function extractPlaceholderNames(prompt: string): string[] {
  const names = new Set<string>()
  for (const match of prompt.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]?.trim()
    if (name) names.add(name)
  }
  return [...names]
}

export function variableLabel(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function createVariableFromName(name: string): PromptTemplateVariable {
  const lower = name.toLowerCase()
  const type: PromptTemplateVariableType =
    lower.includes('code') ||
    lower.includes('context') ||
    lower.includes('logs') ||
    lower.includes('json') ||
    lower.includes('trace')
      ? 'textarea'
      : 'text'

  return {
    name,
    label: variableLabel(name),
    type,
    required: true,
  }
}

export function syncVariablesToPrompt(
  prompt: string,
  existingVariables: PromptTemplateVariable[]
): PromptTemplateVariable[] {
  const existingByName = new Map(existingVariables.map((variable) => [variable.name, variable]))
  return extractPlaceholderNames(prompt).map((name) => {
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
    variables: template.variables.map((variable) => {
      const draftVariable: PromptTemplateVariable = { ...variable }
      if (variable.options) draftVariable.options = [...variable.options]
      return draftVariable
    }),
    estimatedTokens: template.estimatedTokens,
    optimizedFor: template.optimizedFor,
    version: template.version,
    tips: [...(template.tips ?? [])],
  }
}
