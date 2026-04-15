import type {
  PromptTemplate,
  PromptTemplateValues,
  PromptTemplateVariable,
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
