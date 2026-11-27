import { isMonacoLanguageReady, loadMonacoLanguage } from '@/lib/monaco-runtime'
import Editor, { type EditorProps, type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'

/**
 * Let Monaco own its live model while always reflecting genuine external value changes.
 *
 * Passing `value` through makes @monaco-editor/react controlled. In WKWebView, feeding that value
 * back during the native input callback disconnects the hidden textarea from macOS's first
 * responder: the first character is accepted and later keys are ignored. Monaco has already
 * applied editor-originated changes to its model, so only push into that model when its current
 * value differs (selection changes, format actions, tool handoffs, and other external updates).
 */
export function MonacoEditor({
  value,
  defaultValue,
  language,
  defaultLanguage,
  onChange,
  onMount,
  ...props
}: EditorProps) {
  const requestedLanguage = language ?? defaultLanguage
  const languageReady = !requestedLanguage || isMonacoLanguageReady(requestedLanguage)
  const [, setLoadedLanguage] = useState<string>()
  const onChangeRef = useRef(onChange)
  const onMountRef = useRef(onMount)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const initialValueRef = useRef(value ?? defaultValue)
  const valueRef = useRef(value)
  onChangeRef.current = onChange
  onMountRef.current = onMount
  valueRef.current = value

  useEffect(() => {
    if (!requestedLanguage || languageReady) return
    let active = true
    void loadMonacoLanguage(requestedLanguage).then(
      () => {
        if (active) setLoadedLanguage(requestedLanguage)
      },
      (error: unknown) => {
        if (active) console.error('[monaco] Failed to load language', requestedLanguage, error)
      }
    )
    return () => {
      active = false
    }
  }, [languageReady, requestedLanguage])

  const handleMount = useCallback<OnMount>((instance, monaco) => {
    editorRef.current = instance
    const nextValue = valueRef.current
    const model = instance.getModel()
    if (nextValue !== undefined && model && model.getValue() !== nextValue) {
      model.setValue(nextValue)
    }
    onMountRef.current?.(instance, monaco)
  }, [])

  const handleChange = useCallback<NonNullable<EditorProps['onChange']>>((value, event) => {
    onChangeRef.current?.(value, event)
  }, [])

  useEffect(() => {
    if (value === undefined) return
    const model = editorRef.current?.getModel()
    if (model && model.getValue() !== value) model.setValue(value)
  }, [props.path, value])

  // The lightweight Vitest editor has no Monaco model lifecycle to synchronize through.
  const testValueProps = import.meta.env.MODE === 'test' && value !== undefined ? { value } : {}

  return (
    <Editor
      {...props}
      {...(requestedLanguage ? { language: languageReady ? requestedLanguage : 'plaintext' } : {})}
      {...(initialValueRef.current !== undefined ? { defaultValue: initialValueRef.current } : {})}
      {...testValueProps}
      onMount={handleMount}
      {...(onChange ? { onChange: handleChange } : {})}
    />
  )
}
