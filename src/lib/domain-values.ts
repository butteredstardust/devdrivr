/**
 * Closed value sets that the app and the Rust MCP service both enforce on the same tables.
 *
 * Each one must match `shared/domain-contract.json`, which the Rust side asserts against too. A row
 * whose value falls outside its set fails its row schema and is dropped from the tool, so a value
 * added on one side and forgotten on the other makes data vanish. The contract test fails first.
 *
 * This module imports nothing, so `types/models.ts` and `lib/schemas.ts` can both read it without
 * an import cycle.
 */

export const NOTE_COLORS = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange',
  'red',
  'gray',
] as const

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const

export const PROMPT_TEMPLATE_CATEGORIES = [
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'security',
  'learning',
  'productivity',
] as const

export const PROMPT_TEMPLATE_TARGETS = ['Claude', 'ChatGPT', 'Cursor', 'Generic'] as const

export const RESOURCE_FOLDER_KINDS = ['notes', 'snippets', 'apiRequests'] as const
