import { useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'

const LANGUAGES = [
  'javascript', 'typescript', 'json', 'css', 'scss', 'less',
  'html', 'markdown', 'yaml', 'xml', 'sql', 'graphql',
]

type CodeFormatterState = {
  input: string
  language: string
  tabWidth: number
  singleQuote: boolean
  trailingComma: 'all' | 'es5' | 'none'
  semi: boolean
}

export default function CodeFormatter() {
  useMonacoTheme()
  const [state, updateState] = useToolState<CodeFormatterState>('code-formatter', {
    input: '',
    language: 'javascript',
    tabWidth: 2,
    singleQuote: true,
    trailingComma: 'es5',
    semi: false,
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)

  const handleFormat = useCallback(async () => {
    if (!formatter || !state.input.trim()) return
    try {
      const result = await formatter.format(state.input, {
        language: state.language,
        tabWidth: state.tabWidth,
        singleQuote: state.singleQuote,
        trailingComma: state.trailingComma,
        semi: state.semi,
      })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted', 'success')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Format error', 'error')
    }
  }, [formatter, state, updateState, setLastAction])

  const handleAutoDetect = useCallback(async () => {
    if (!formatter || !state.input.trim()) return
    const detected = await formatter.detectLanguage(state.input)
    updateState({ language: detected })
    setLastAction(`Detected: ${detected}`, 'info')
  }, [formatter, state.input, updateState, setLastAction])

  // Cmd/Ctrl+Enter to format
  useKeyboardShortcut({ key: 'Enter', mod: true }, handleFormat)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <button
          onClick={handleFormat}
          className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
        >
          Format
        </button>
        <select
          value={state.language}
          onChange={(e) => updateState({ language: e.target.value })}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        <button
          onClick={handleAutoDetect}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Auto-detect
        </button>
        <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Indent
          <select
            value={state.tabWidth}
            onChange={(e) => updateState({ tabWidth: Number(e.target.value) })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.singleQuote}
            onChange={(e) => updateState({ singleQuote: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Single quotes
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.semi}
            onChange={(e) => updateState({ semi: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Semicolons
        </label>
        <div className="ml-auto">
          <CopyButton text={state.input} />
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}
      <div className="flex-1">
        <Editor
          language={state.language}
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  )
}
