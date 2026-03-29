import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import * as cssTree from 'css-tree'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CssValidatorState = {
  input: string
}

type CssError = {
  message: string
  line: number
  column: number
}

function validateCss(css: string): CssError[] {
  const errors: CssError[] = []
  try {
    cssTree.parse(css, {
      onParseError: (error) => {
        // css-tree's SyntaxParseError has line/column at runtime even though
        // @types/css-tree doesn't declare them on SyntaxParseError directly
        const err = error as cssTree.SyntaxParseError & { line?: number; column?: number }
        errors.push({
          message: error.message,
          line: err.line ?? 0,
          column: err.column ?? 0,
        })
      },
    })
  } catch (e) {
    errors.push({ message: (e as Error).message, line: 1, column: 1 })
  }
  return errors
}

export default function CssValidator() {
  const monacoTheme = useMonacoTheme()
  const [state, updateState] = useToolState<CssValidatorState>('css-validator', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<CssError[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.input.trim()) {
      setErrors([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const errs = validateCss(state.input)
      setErrors(errs)
      if (errs.length === 0) {
        setLastAction('Valid CSS', 'success')
      } else {
        setLastAction(`${errs.length} error(s)`, 'error')
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {state.input.trim() && errors.length === 0 && (
          <span className="text-xs text-[var(--color-success)]">✓ Valid CSS</span>
        )}
        {errors.length > 0 && (
          <span className="text-xs text-[var(--color-error)]">✗ {errors.length} error(s)</span>
        )}
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-[var(--color-error)]">
              <span className="text-[var(--color-text-muted)]">Line {e.line}:{e.column}</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1">
        <Editor
          theme={monacoTheme}
          language="css"
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
