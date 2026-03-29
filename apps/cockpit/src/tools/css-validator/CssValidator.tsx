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

const SAMPLES: { label: string; css: string }[] = [
  {
    label: 'Flexbox Layout',
    css: `.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 100vh;
}

.container > .item {
  flex: 1 1 auto;
  padding: 1rem 2rem;
}`,
  },
  {
    label: 'CSS Grid',
    css: `.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  grid-template-rows: auto 1fr auto;
  gap: 1.5rem;
  padding: 2rem;
}

.grid-item {
  border-radius: 8px;
  background: #f9fafb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}`,
  },
  {
    label: 'Animation',
    css: `@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animated {
  animation: slide-in 0.3s ease-out forwards;
}

.animated:hover {
  transform: scale(1.02);
  transition: transform 0.15s ease;
}`,
  },
  {
    label: 'Media Queries',
    css: `.responsive {
  font-size: 1rem;
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .responsive {
    font-size: 0.875rem;
    padding: 0.75rem;
  }
}

@media (prefers-color-scheme: dark) {
  .responsive {
    background: #1a1a2e;
    color: #e0e0e0;
  }
}`,
  },
  {
    label: 'Custom Properties',
    css: `:root {
  --color-primary: #6366f1;
  --color-surface: #f8fafc;
  --radius: 0.5rem;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.card {
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.5rem;
}

.card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
  cursor: pointer;
}`,
  },
]

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
        <div className="ml-auto flex items-center gap-1">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => updateState({ input: s.css })}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              {s.label}
            </button>
          ))}
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
