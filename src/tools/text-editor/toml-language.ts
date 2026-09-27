import type { BeforeMount } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'

let registered = false

/**
 * Monarch rules for TOML. Monaco has no TOML grammar, and the INI grammar marks arrays, inline
 * tables and multi-line strings as errors.
 *
 * Call before the editor mounts. A model created with an unregistered language stays plain text.
 */
export const TOML_TOKENS: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.toml',
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      // [table] and [[array.of.tables]] at the start of a line.
      [/^(\s*)(\[\[?)([^\]#]*)(\]\]?)/, ['', 'delimiter.bracket', 'type', 'delimiter.bracket']],
      [/"""/, 'string', '@multiBasic'],
      [/'''/, 'string', '@multiLiteral'],
      [/"/, 'string', '@basic'],
      [/'[^']*'/, 'string'],
      // Offset date-time, local date-time, local date and local time.
      [
        /\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?/,
        'number',
      ],
      [/\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/, 'number'],
      [/[+-]?(?:inf|nan)\b/, 'number'],
      [/0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+/, 'number'],
      [/[+-]?\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false)\b/, 'keyword'],
      // A bare key, before `=` or before the `.` of a dotted key.
      [/[A-Za-z0-9_-]+(?=\s*[=.])/, 'key'],
      [/=/, 'delimiter'],
      [/[[\]{}]/, 'delimiter.bracket'],
      [/[.,]/, 'delimiter'],
    ],
    basic: [
      [/[^"\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    multiBasic: [
      [/[^"\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"""/, 'string', '@pop'],
      [/"/, 'string'],
    ],
    multiLiteral: [
      [/[^']+/, 'string'],
      [/'''/, 'string', '@pop'],
      [/'/, 'string'],
    ],
  },
}

export const registerTomlLanguage: BeforeMount = (monaco) => {
  if (registered) return
  registered = true
  monaco.languages.register({ id: 'toml', extensions: ['.toml'], aliases: ['TOML'] })
  monaco.languages.setMonarchTokensProvider('toml', TOML_TOKENS)
  monaco.languages.setLanguageConfiguration('toml', {
    comments: { lineComment: '#' },
    brackets: [
      ['[', ']'],
      ['{', '}'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string'] },
    ],
  })
}
