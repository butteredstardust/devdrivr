import { useCallback, useEffect, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { useWorker } from '@/hooks/useWorker'
import type { useMonaco } from '@/hooks/useMonaco'
import { formatShortcut } from '@/lib/shortcut-label'
import { fragmentsForSnippet } from '@/lib/snippet-fragments'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet, SnippetFragment } from '@/types/models'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import type { FormatterWorker } from '@/workers/formatter.worker'
import {
  FORMATTER_LANGUAGES,
  hasRegisteredDocumentFormatter,
  runRegisteredDocumentFormatter,
  type SnippetEditor,
} from '@/tools/snippets/snippet-formatter'

type SnippetFormattingInput = {
  selected: Snippet | null
  activeFragment: SnippetFragment | null
  monacoOptions: ReturnType<typeof useMonaco>['options']
}

// Format the active fragment. Prefer the formatter Monaco registers for the language, and fall
// back to the formatter worker. The worker loads on first use only.
export function useSnippetFormatting({
  selected,
  activeFragment,
  monacoOptions,
}: SnippetFormattingInput) {
  const updateSnippet = useSnippetsStore((state) => state.update)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const [formatterRequested, setFormatterRequested] = useState(false)
  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages'],
    formatterRequested
  )
  const [formatError, setFormatError] = useState<string | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [monacoFormatterAvailable, setMonacoFormatterAvailable] = useState(false)
  const editorRef = useRef<SnippetEditor | null>(null)
  const formattingRef = useRef(false)
  const pendingFormatRef = useRef<{
    snippetId: string
    fragmentId: string
    content: string
  } | null>(null)

  const fallbackFormatterAvailable = Boolean(
    activeFragment && FORMATTER_LANGUAGES.has(activeFragment.language)
  )
  const canFormat = Boolean(
    activeFragment?.content.trim() && (monacoFormatterAvailable || fallbackFormatterAvailable)
  )
  const formatDisabledReason = !activeFragment
    ? 'Select a fragment to format'
    : !activeFragment.content.trim()
      ? 'Add content before formatting'
      : !monacoFormatterAvailable && !fallbackFormatterAvailable
        ? `No formatter is available for ${activeFragment.language}`
        : formatting
          ? 'Formatting fragment…'
          : `Format fragment (${formatShortcut('mod+shift+f')})`

  useEffect(() => {
    setMonacoFormatterAvailable(hasRegisteredDocumentFormatter(editorRef.current))
    setFormatError(null)
  }, [activeFragment?.id, activeFragment?.language])

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    setMonacoFormatterAvailable(hasRegisteredDocumentFormatter(editor))
  }, [])

  const handleFormat = useCallback(async () => {
    if (!selected || !activeFragment || formattingRef.current || !activeFragment.content.trim()) {
      return
    }
    if (
      !hasRegisteredDocumentFormatter(editorRef.current) &&
      FORMATTER_LANGUAGES.has(activeFragment.language) &&
      !formatter
    ) {
      pendingFormatRef.current = {
        snippetId: selected.id,
        fragmentId: activeFragment.id,
        content: activeFragment.content,
      }
      setFormatting(true)
      setFormatterRequested(true)
      return
    }
    formattingRef.current = true
    setFormatting(true)
    setFormatError(null)
    const snippetId = selected.id
    const fragmentId = activeFragment.id
    const snapshot = activeFragment.content
    try {
      const editor = editorRef.current
      if (editor && hasRegisteredDocumentFormatter(editor)) {
        if (editor.getValue() !== snapshot) {
          setLastAction('Editor changed before formatting — format again', 'info')
          return
        }
        await runRegisteredDocumentFormatter(editor)
        if (editor.getValue() !== snapshot) {
          setLastAction(`Formatted ${activeFragment.name || 'fragment'} with Monaco`, 'success')
          return
        }
      }
      if (!formatter && FORMATTER_LANGUAGES.has(activeFragment.language)) {
        pendingFormatRef.current = { snippetId, fragmentId, content: snapshot }
        setFormatterRequested(true)
        return
      }
      if (!formatter) {
        throw new Error(`No formatter is available for ${activeFragment.language}`)
      }
      const tabSize =
        typeof monacoOptions.tabSize === 'number' && monacoOptions.tabSize > 0
          ? monacoOptions.tabSize
          : 2
      const result = await formatter.format(snapshot, {
        language: activeFragment.language,
        tabWidth: tabSize,
        useTabs: monacoOptions.insertSpaces === false,
      })
      const current = useSnippetsStore
        .getState()
        .snippets.find((snippet) => snippet.id === snippetId)
      const currentFragments = current ? fragmentsForSnippet(current) : []
      const currentFragment = currentFragments.find((fragment) => fragment.id === fragmentId)
      if (!currentFragment || currentFragment.content !== snapshot) {
        setLastAction('Fragment changed while formatting — format again', 'info')
        return
      }
      if (result === snapshot) {
        setLastAction('Fragment is already formatted', 'info')
        return
      }
      await updateSnippet(snippetId, {
        fragments: currentFragments.map((fragment) =>
          fragment.id === fragmentId
            ? { ...fragment, content: result, updatedAt: Date.now() }
            : fragment
        ),
      })
      setLastAction(`Formatted ${activeFragment.name || 'fragment'}`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setFormatError(message)
      setLastAction('Could not format fragment', 'error')
    } finally {
      formattingRef.current = false
      setFormatting(false)
    }
  }, [activeFragment, formatter, monacoOptions, selected, setLastAction, updateSnippet])

  useEffect(() => {
    const pending = pendingFormatRef.current
    if (!formatter || !pending) return
    pendingFormatRef.current = null
    setFormatting(false)
    if (
      selected?.id !== pending.snippetId ||
      activeFragment?.id !== pending.fragmentId ||
      activeFragment.content !== pending.content
    ) {
      setLastAction('Fragment changed while loading the formatter — format again', 'info')
      return
    }
    void handleFormat()
  }, [activeFragment, formatter, handleFormat, selected?.id, setLastAction])

  return {
    formatError,
    setFormatError,
    formatting,
    canFormat,
    formatDisabledReason,
    handleEditorMount,
    handleFormat,
  }
}
