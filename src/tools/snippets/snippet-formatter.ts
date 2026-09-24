import type { OnMount } from '@monaco-editor/react'
import { LANGUAGES as FORMATTER_LANGUAGE_OPTIONS } from '@/tools/code-formatter/languages'

export type SnippetEditor = Parameters<OnMount>[0]

export const FORMATTER_LANGUAGES = new Set(
  FORMATTER_LANGUAGE_OPTIONS.map((language) => language.id)
)

export function hasRegisteredDocumentFormatter(editor: SnippetEditor | null): boolean {
  return editor?.getAction('editor.action.formatDocument')?.isSupported() === true
}

export async function runRegisteredDocumentFormatter(editor: SnippetEditor): Promise<boolean> {
  const action = editor.getAction('editor.action.formatDocument')
  if (!action?.isSupported()) return false
  await action.run()
  return true
}
