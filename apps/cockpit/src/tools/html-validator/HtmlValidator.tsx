import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type HtmlValidatorState = {
  input: string
}

type HtmlError = {
  message: string
  line: number
  col: number
  type: 'error' | 'warning'
  rule: string
}

// HTMLHint has its own ruleset — import dynamically to avoid bundling issues
async function validateHtml(html: string): Promise<HtmlError[]> {
  const { HTMLHint } = await import('htmlhint')
  const results = HTMLHint.verify(html, {
    'tagname-lowercase': true,
    'attr-lowercase': true,
    'attr-value-double-quotes': true,
    'doctype-first': false,
    'tag-pair': true,
    'spec-char-escape': true,
    'id-unique': true,
    'src-not-empty': true,
    'attr-no-duplication': true,
    'title-require': true,
    'alt-require': true,
    'id-class-value': 'dash',
    'tag-self-close': false,
    'head-script-disabled': false,
    'attr-unsafe-chars': true,
  })

  return results.map((r) => ({
    message: r.message,
    line: r.line,
    col: r.col,
    // ReportType is a const enum — compare against the string values at runtime
    type: (r.type as string) === 'error' ? ('error' as const) : ('warning' as const),
    rule: r.rule.id,
  }))
}

export default function HtmlValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<HtmlValidatorState>('html-validator', {
    input: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<HtmlError[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.input.trim()) {
      setErrors([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const errs = await validateHtml(state.input)
      setErrors(errs)
      const errorCount = errs.filter((e) => e.type === 'error').length
      const warnCount = errs.filter((e) => e.type === 'warning').length
      if (errs.length === 0) {
        setLastAction('Valid HTML', 'success')
      } else {
        setLastAction(`${errorCount} error(s), ${warnCount} warning(s)`, errorCount > 0 ? 'error' : 'info')
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, setLastAction])

  const errorCount = errors.filter((e) => e.type === 'error').length
  const warnCount = errors.filter((e) => e.type === 'warning').length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {state.input.trim() && errors.length === 0 && (
          <span className="text-xs text-[var(--color-success)]">✓ Valid HTML</span>
        )}
        {errorCount > 0 && <span className="text-xs text-[var(--color-error)]">✗ {errorCount} error(s)</span>}
        {warnCount > 0 && <span className="text-xs text-[var(--color-warning)]">⚠ {warnCount} warning(s)</span>}
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className={`text-xs ${e.type === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}>
              <span className="text-[var(--color-text-muted)]">Line {e.line}:{e.col}</span>{' '}
              <span className="text-[var(--color-text-muted)]">[{e.rule}]</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1">
        <Editor
          language="html"
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
