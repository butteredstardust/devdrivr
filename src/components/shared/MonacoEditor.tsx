// Side-effect import: points the loader at the bundled Monaco. See `monaco-runtime.ts`.
import '@/lib/monaco-runtime'
import Editor, { type EditorProps } from '@monaco-editor/react'
import { useCallback } from 'react'
import { flushSync } from 'react-dom'

/**
 * Monaco's model changes synchronously, while a controlled React `value` prop normally commits on
 * a later render. A second input event can arrive in that gap and see the stale prop reapplied,
 * dropping characters during fast typing or key repeat. Commit only editor-originated changes
 * synchronously; programmatic tool-state updates keep React's normal scheduling.
 */
export function MonacoEditor({ onChange, ...props }: EditorProps) {
  const handleChange = useCallback<NonNullable<EditorProps['onChange']>>(
    (value, event) => {
      if (!onChange) return
      flushSync(() => onChange(value, event))
    },
    [onChange]
  )

  return <Editor {...props} {...(onChange ? { onChange: handleChange } : {})} />
}
