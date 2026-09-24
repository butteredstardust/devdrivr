import { isPlainObject } from '@/lib/tool-state-merge'

export const FAVORITE_TAG = '⭐'

export type SnippetsToolState = {
  handoff: { title: string; content: string; language: string } | null
  wikiTargetId: string | null
  backlinkNoteId: string | null
  activeFragmentIds: Record<string, string>
}

function isSnippetHandoff(value: unknown): value is NonNullable<SnippetsToolState['handoff']> {
  return (
    isPlainObject(value) &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.language === 'string'
  )
}

export function validateSnippetsToolState(state: SnippetsToolState): SnippetsToolState {
  const handoff = isSnippetHandoff(state.handoff) ? state.handoff : null
  const wikiTargetId = typeof state.wikiTargetId === 'string' ? state.wikiTargetId : null
  const backlinkNoteId = typeof state.backlinkNoteId === 'string' ? state.backlinkNoteId : null
  const activeFragmentIds = Object.fromEntries(
    Object.entries(state.activeFragmentIds).filter(([, id]) => typeof id === 'string')
  )
  if (
    handoff === state.handoff &&
    wikiTargetId === state.wikiTargetId &&
    backlinkNoteId === state.backlinkNoteId &&
    Object.keys(activeFragmentIds).length === Object.keys(state.activeFragmentIds).length
  ) {
    return state
  }
  return { ...state, handoff, wikiTargetId, backlinkNoteId, activeFragmentIds }
}

export const LANGUAGES = [
  'javascript',
  'typescript',
  'json',
  'css',
  'html',
  'markdown',
  'sql',
  'python',
  'yaml',
  'xml',
  'bash',
  'go',
  'rust',
  'ruby',
  'php',
  'java',
  'c',
  'cpp',
  'csharp',
  'swift',
  'kotlin',
  'dockerfile',
  'graphql',
  'toml',
  'text',
]

export const LANG_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  css: 'css',
  html: 'html',
  markdown: 'md',
  sql: 'sql',
  python: 'py',
  bash: 'sh',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  swift: 'swift',
  kotlin: 'kt',
  yaml: 'yml',
  xml: 'xml',
  toml: 'toml',
  dockerfile: 'dockerfile',
  graphql: 'gql',
  text: 'txt',
}

export type LangTone = 'accent' | 'success' | 'warning' | 'info' | 'error' | 'muted'

export const LANG_TONES: Record<string, LangTone> = {
  javascript: 'warning',
  typescript: 'info',
  python: 'success',
  rust: 'warning',
  go: 'info',
  sql: 'accent',
  bash: 'success',
  json: 'warning',
  css: 'warning',
  html: 'error',
  markdown: 'muted',
  yaml: 'warning',
  dockerfile: 'info',
  ruby: 'error',
  php: 'accent',
  java: 'warning',
  kotlin: 'accent',
  swift: 'warning',
  graphql: 'accent',
  cpp: 'info',
  csharp: 'accent',
  c: 'info',
  xml: 'muted',
  toml: 'warning',
}

export const LANG_TONE_CLASSES: Record<LangTone, string> = {
  accent: 'bg-[color-mix(in_oklab,var(--color-accent)_18%,transparent)] text-[var(--color-accent)]',
  success:
    'bg-[color-mix(in_oklab,var(--color-success)_18%,transparent)] text-[var(--color-success)]',
  warning:
    'bg-[color-mix(in_oklab,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]',
  info: 'bg-[color-mix(in_oklab,var(--color-info)_18%,transparent)] text-[var(--color-info)]',
  error: 'bg-[color-mix(in_oklab,var(--color-error)_18%,transparent)] text-[var(--color-error)]',
  muted: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]',
}

export type SortMode = 'updated' | 'created' | 'title' | 'language'

export interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}

export function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function contentPreview(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim()) ?? ''
  return firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine
}

export function visibleTags(tags: string[]): string[] {
  return tags.filter((tag) => tag !== FAVORITE_TAG)
}

export function isFavorite(tags: string[], favorite = false): boolean {
  return favorite || tags.includes(FAVORITE_TAG)
}

export function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}
