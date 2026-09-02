/**
 * Language metadata for the formatter UI.
 *
 * Deliberately separate from `@/workers/formatter.api` — that module pulls in
 * the full prettier standalone bundle, which must stay on the worker thread.
 */

export type FormatterLanguage = {
  id: string
  label: string
  /** Extension used when saving, and matched when opening a file. */
  extension: string
  /** Extra extensions that map onto this language when opening a file. */
  aliases?: string[]
}

export const LANGUAGES: FormatterLanguage[] = [
  { id: 'javascript', label: 'JavaScript', extension: 'js', aliases: ['jsx', 'mjs', 'cjs'] },
  { id: 'typescript', label: 'TypeScript', extension: 'ts', aliases: ['tsx', 'mts', 'cts'] },
  { id: 'json', label: 'JSON', extension: 'json', aliases: ['jsonc'] },
  { id: 'css', label: 'CSS', extension: 'css' },
  { id: 'scss', label: 'SCSS', extension: 'scss' },
  { id: 'less', label: 'Less', extension: 'less' },
  { id: 'html', label: 'HTML', extension: 'html', aliases: ['htm'] },
  { id: 'markdown', label: 'Markdown', extension: 'md', aliases: ['markdown', 'mdx'] },
  { id: 'yaml', label: 'YAML', extension: 'yml', aliases: ['yaml'] },
  { id: 'xml', label: 'XML', extension: 'xml', aliases: ['svg'] },
  { id: 'sql', label: 'SQL', extension: 'sql' },
  { id: 'graphql', label: 'GraphQL', extension: 'graphql', aliases: ['gql'] },
]

/**
 * Semicolons and trailing commas are JavaScript-grammar options — prettier
 * ignores them for CSS, YAML, SQL and friends, so the controls are disabled
 * rather than silently doing nothing.
 */
const JS_FLAVOURED = new Set(['javascript', 'typescript'])

export function supportsJsStyleOptions(language: string): boolean {
  return JS_FLAVOURED.has(language)
}

/** Languages where prettier's `singleQuote` actually changes the output. */
const QUOTED = new Set(['javascript', 'typescript', 'css', 'scss', 'less', 'html', 'graphql'])

export function supportsQuoteStyle(language: string): boolean {
  return QUOTED.has(language)
}

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id
}

export function extensionForLanguage(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.extension ?? id
}

/**
 * Maps a filename onto a formatter language. The extension is a far stronger
 * signal than content heuristics, so opening `styles.scss` should never be
 * guessed as JavaScript.
 */
export function languageFromFilename(filename: string): string | null {
  const extension = filename.toLowerCase().split('.').pop()
  if (!extension || extension === filename.toLowerCase()) return null
  const match = LANGUAGES.find(
    (l) => l.extension === extension || l.aliases?.includes(extension) === true
  )
  return match?.id ?? null
}
