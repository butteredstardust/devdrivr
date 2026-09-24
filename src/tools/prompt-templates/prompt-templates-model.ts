import type { PromptTemplateDraft } from '@/lib/prompt-template-transfer'
import { isPlainObject } from '@/lib/tool-state-merge'
import {
  BUILTIN_PROMPT_TEMPLATES,
  CATEGORY_LABELS,
} from '@/tools/prompt-templates/builtin-templates'
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateVariableType,
  PromptTemplateValues,
  TokenTone,
} from '@/tools/prompt-templates/types'

export type CategoryFilter = PromptTemplateCategory | 'all'

export type PromptTemplatesState = {
  search: string
  category: CategoryFilter
  selectedId: string
  inputsByTemplate: Record<string, PromptTemplateValues>
  overrides: Record<string, PromptTemplateDraft>
  handoffContent: string
  handoffLanguage: string
}

export const DEFAULT_STATE: PromptTemplatesState = {
  search: '',
  category: 'all',
  selectedId: BUILTIN_PROMPT_TEMPLATES[0]?.id ?? '',
  inputsByTemplate: {},
  overrides: {},
  handoffContent: '',
  handoffLanguage: '',
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isPromptVariable(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  return (
    typeof value.name === 'string' &&
    typeof value.label === 'string' &&
    (value.type === 'text' || value.type === 'textarea' || value.type === 'select') &&
    (value.placeholder === undefined || typeof value.placeholder === 'string') &&
    (value.description === undefined || typeof value.description === 'string') &&
    (value.example === undefined || typeof value.example === 'string') &&
    (value.required === undefined || typeof value.required === 'boolean') &&
    (value.options === undefined ||
      (Array.isArray(value.options) && value.options.every((option) => typeof option === 'string')))
  )
}

function isPromptTemplateDraft(value: unknown): value is PromptTemplateDraft {
  if (!isPlainObject(value)) return false
  return (
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    Object.hasOwn(CATEGORY_LABELS, value.category) &&
    typeof value.prompt === 'string' &&
    (value.optimizedFor === 'Claude' ||
      value.optimizedFor === 'ChatGPT' ||
      value.optimizedFor === 'Cursor' ||
      value.optimizedFor === 'Generic') &&
    typeof value.version === 'string' &&
    typeof value.estimatedTokens === 'number' &&
    Number.isFinite(value.estimatedTokens) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    Array.isArray(value.tips) &&
    value.tips.every((tip) => typeof tip === 'string') &&
    Array.isArray(value.variables) &&
    value.variables.every(isPromptVariable)
  )
}

function filterRecord<T>(
  value: Record<string, unknown>,
  accepts: (item: unknown) => item is T
): Record<string, T> {
  const filtered: Record<string, T> = {}
  for (const [key, item] of Object.entries(value)) {
    if (accepts(item)) filtered[key] = item
  }
  return filtered
}

export function validatePromptTemplatesState(state: PromptTemplatesState): PromptTemplatesState {
  const inputsByTemplate = filterRecord(state.inputsByTemplate, isStringRecord)
  const overrides = filterRecord(state.overrides, isPromptTemplateDraft)
  if (
    Object.keys(inputsByTemplate).length === Object.keys(state.inputsByTemplate).length &&
    Object.keys(overrides).length === Object.keys(state.overrides).length
  ) {
    return state
  }
  return { ...state, inputsByTemplate, overrides }
}

export const FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id: id as PromptTemplateCategory,
    label,
  })),
]

export const OPTIMIZED_FOR_OPTIONS: PromptTemplate['optimizedFor'][] = [
  'Claude',
  'ChatGPT',
  'Cursor',
  'Generic',
]

export const VARIABLE_TYPE_OPTIONS: PromptTemplateVariableType[] = ['text', 'textarea', 'select']

export function tokenClass(tone: TokenTone): string {
  if (tone === 'error') return 'border-[var(--color-error)] text-[var(--color-error)]'
  if (tone === 'warning') return 'border-[var(--color-warning)] text-[var(--color-warning)]'
  return 'border-[var(--color-success)] text-[var(--color-success)]'
}

export function categoryCount(category: CategoryFilter, templates: PromptTemplate[]): number {
  if (category === 'all') return templates.length
  return templates.filter((template) => template.category === category).length
}

export function shouldIgnoreGlobalEnter(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as Element & { isContentEditable?: boolean }
  if (element.isContentEditable) return true
  return typeof element.closest === 'function'
    ? element.closest('input, textarea, select, button, a, [role="button"]') !== null
    : false
}

export function getTemplateById(id: string, templates: PromptTemplate[]): PromptTemplate {
  const fallbackTemplate = templates[0]
  if (!fallbackTemplate) {
    throw new Error('No prompt templates configured')
  }
  return templates.find((template) => template.id === id) ?? fallbackTemplate
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinList(value: string[]): string {
  return value.join(', ')
}
