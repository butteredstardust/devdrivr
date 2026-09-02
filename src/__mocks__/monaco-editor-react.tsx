interface EditorProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string | undefined) => void
  options?: Record<string, unknown>
  onMount?: (editor: unknown) => void
  [key: string]: unknown
}

interface DiffEditorProps {
  original?: string
  modified?: string
  [key: string]: unknown
}

function Editor({ value, defaultValue, onChange, options }: EditorProps) {
  const readOnly = Boolean((options as Record<string, unknown> | undefined)?.readOnly)
  return (
    <textarea
      data-testid="monaco-editor"
      value={value ?? defaultValue ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      readOnly={readOnly}
    />
  )
}

export function DiffEditor({ original, modified }: DiffEditorProps) {
  return (
    <div data-testid="monaco-diff-editor">
      <textarea data-testid="original-editor" value={original ?? ''} readOnly />
      <textarea data-testid="modified-editor" value={modified ?? ''} readOnly />
    </div>
  )
}

export const loader = {
  init: () =>
    Promise.resolve({
      editor: {
        defineTheme: () => {},
        setTheme: () => {},
        updateOptions: () => {},
      },
    }),
  config: () => {},
}

export default Editor
