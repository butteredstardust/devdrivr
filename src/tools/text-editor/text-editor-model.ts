export type TextEditorLanguage = {
  id: string
  label: string
}

export const TEXT_EDITOR_LANGUAGES: TextEditorLanguage[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'mdx', label: 'MDX' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'XML' },
  { id: 'python', label: 'Python' },
  { id: 'shell', label: 'Shell' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'bat', label: 'Batch' },
  { id: 'ini', label: 'INI / Config' },
  { id: 'toml', label: 'TOML' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'sql', label: 'SQL' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'cpp', label: 'C / C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'swift', label: 'Swift' },
  { id: 'dart', label: 'Dart' },
  { id: 'lua', label: 'Lua' },
  { id: 'perl', label: 'Perl' },
  { id: 'r', label: 'R' },
  { id: 'hcl', label: 'HCL / Terraform' },
]

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'shell',
  bat: 'bat',
  cjs: 'javascript',
  c: 'cpp',
  cc: 'cpp',
  cfg: 'ini',
  conf: 'ini',
  cpp: 'cpp',
  cs: 'csharp',
  cts: 'typescript',
  css: 'css',
  dart: 'dart',
  env: 'ini',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  h: 'cpp',
  hpp: 'cpp',
  hcl: 'hcl',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  mjs: 'javascript',
  mts: 'typescript',
  md: 'markdown',
  mdx: 'mdx',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'shell',
  sql: 'sql',
  swift: 'swift',
  tf: 'hcl',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shell',
}

const LANGUAGE_BY_FILENAME: Record<string, string> = {
  '.bash_profile': 'shell',
  '.bashrc': 'shell',
  '.editorconfig': 'ini',
  '.env': 'ini',
  '.gitattributes': 'plaintext',
  '.gitignore': 'plaintext',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
  '.zprofile': 'shell',
  '.zshrc': 'shell',
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  makefile: 'plaintext',
  procfile: 'shell',
}

export function detectTextEditorLanguage(filename: string | null): string {
  if (!filename) return 'plaintext'
  const base = filename.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  const exact = LANGUAGE_BY_FILENAME[base]
  if (exact) return exact
  const dot = base.lastIndexOf('.')
  if (dot < 0 || dot === base.length - 1) return 'plaintext'
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1)] ?? 'plaintext'
}

export type LineEnding = 'LF' | 'CRLF'

/** Selected character count across all cursors. `selections` counts every cursor. */
export type SelectionSummary = { characters: number; selections: number }

export function lineEndingLabel(content: string): LineEnding {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

export function countLines(content: string): number {
  return content.length === 0 ? 1 : content.split(/\r\n|\r|\n/).length
}
