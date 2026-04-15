export const PROMPT_TEMPLATE_CATEGORIES = [
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'learning',
  'productivity',
] as const

export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number]

export type PromptTemplateVariableType = 'text' | 'textarea' | 'select'

export type PromptTemplateVariable = {
  name: string
  label: string
  type: PromptTemplateVariableType
  placeholder?: string
  options?: string[]
  required?: boolean
}

export type PromptTemplate = {
  id: string
  name: string
  description: string
  category: PromptTemplateCategory
  tags: string[]
  prompt: string
  variables: PromptTemplateVariable[]
  estimatedTokens: number
  optimizedFor: 'Claude' | 'ChatGPT' | 'Cursor' | 'Generic'
  author: 'builtin' | 'user'
  version: string
  tips?: string[]
}

export type PromptTemplateValues = Record<string, string>

export type TokenTone = 'success' | 'warning' | 'error'
