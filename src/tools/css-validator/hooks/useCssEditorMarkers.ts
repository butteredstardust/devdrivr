import { useCallback, useEffect, useRef } from 'react'
import { type OnMount } from '@monaco-editor/react'
import type { CssIssue } from '@/tools/css-validator/css-helpers'

export function useCssEditorMarkers(issues: CssIssue[]) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)

  // --- Editor markers --------------------------------------------------

  const syncMarkers = useCallback((current: CssIssue[]) => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    const lineCount = model.getLineCount()
    monaco.editor.setModelMarkers(
      model,
      'css-validator',
      current.map((issue) => {
        // A line from a since-shortened stylesheet would make Monaco throw.
        const line = Math.min(Math.max(issue.line, 1), lineCount)
        return {
          severity:
            issue.type === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: `${issue.message} (${issue.rule})`,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: Math.max(issue.column, 1),
          endColumn: model.getLineMaxColumn(line),
        }
      })
    )
  }, [])

  // Use Monaco markers so issues include hover severity, minimap indicators, and overview-ruler
  // indicators. Markers also apply when the editor mounts later.
  const issuesRef = useRef<CssIssue[]>(issues)
  issuesRef.current = issues

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      syncMarkers(issuesRef.current)
    },
    [syncMarkers]
  )

  useEffect(() => {
    syncMarkers(issues)
  }, [issues, syncMarkers])

  // Markers live on the model, which outlives this component.
  useEffect(() => () => syncMarkers([]), [syncMarkers])

  const goToPosition = useCallback((line: number, column: number) => {
    const editor = editorRef.current
    // A disposed editor is still truthy but every call on it no-ops, so the
    // jump has to be judged on the model.
    if (!editor || !editor.getModel()) return
    const position = { lineNumber: Math.max(line, 1), column: Math.max(column, 1) }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [])

  return { handleEditorMount, goToPosition }
}
