import type { BeforeMount } from '@monaco-editor/react'
import type { languages } from 'monaco-editor'

let registered = false

export const LOG_LANGUAGE_ID = 'devdrivr-log'

/**
 * Monarch rules for log text: timestamps, URLs, UUIDs, IP addresses, quoted strings, numbers and
 * `key=` names.
 *
 * The rules use token names that every editor theme colours. Level words get their colour from
 * decorations instead, because the themes have no error or warning token colour. See
 * `LogViewer.tsx`.
 *
 * Call before the editor mounts. A model created with an unregistered language stays plain text.
 */
export const LOG_TOKENS: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.log',
  months: /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/,
  tokenizer: {
    root: [
      // 2026-09-27T14:03:11.402Z, 2026-09-27 14:03:11,402 +02:00
      [
        /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|\s?[+-]\d{2}:?\d{2})?)?/,
        'type',
      ],
      // Sep 27 14:03:11 (syslog), 27/Sep/2026:14:03:11 +0000 (access logs)
      [/@months\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/, 'type'],
      [/\d{1,2}\/@months\/\d{4}:\d{2}:\d{2}:\d{2}(?:\s[+-]\d{4})?/, 'type'],
      [/\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/, 'type'],
      [/[a-zA-Z][\w+.-]*:\/\/[^\s"'<>)\]]+/, 'tag'],
      [/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/, 'number.hex'],
      [/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/, 'number.hex'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/[A-Za-z_][\w.-]*(?==)/, 'attribute.name'],
      [/\d+(?:\.\d+)?/, 'number'],
      // Consume a word whole, so a number rule cannot match inside it.
      [/[A-Za-z_]\w*/, ''],
    ],
  },
}

export const registerLogLanguage: BeforeMount = (monaco) => {
  if (registered) return
  registered = true
  monaco.languages.register({ id: LOG_LANGUAGE_ID, aliases: ['Log'] })
  monaco.languages.setMonarchTokensProvider(LOG_LANGUAGE_ID, LOG_TOKENS)
}
