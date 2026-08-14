import { useCallback, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { saveFileDialog } from '@/lib/file-io'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'

const LANGUAGES = [
  'javascript',
  'typescript',
  'json',
  'css',
  'scss',
  'less',
  'html',
  'markdown',
  'yaml',
  'xml',
  'sql',
  'graphql',
]
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  markdown: 'md',
  yaml: 'yml',
  graphql: 'graphql',
}

type CodeFormatterState = {
  input: string
  fileName: string | null
  language: string
  tabWidth: number
  singleQuote: boolean
  trailingComma: 'all' | 'es5' | 'none'
  semi: boolean
}

export default function CodeFormatter() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<CodeFormatterState>('code-formatter', {
    input: '',
    fileName: null,
    language: 'javascript',
    tabWidth: 2,
    singleQuote: true,
    trailingComma: 'es5',
    semi: false,
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    FORMATTER_WORKER_METHODS
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const formattingRef = useRef(false)

  const handleFormat = useCallback(async () => {
    if (!formatter || !state.input.trim() || formattingRef.current) return
    formattingRef.current = true
    setIsFormatting(true)
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
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, state, updateState, setLastAction])

  const handleAutoDetect = useCallback(async () => {
    if (!formatter || !state.input.trim()) return
    try {
      const detected = await formatter.detectLanguage(state.input)
      setError(null)
      updateState({ language: detected })
      setLastAction(`Detected: ${detected}`, 'info')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Auto-detect failed', 'error')
    }
  }, [formatter, state.input, updateState, setLastAction])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({ input: action.content, fileName: action.filename })
      if (formatter) {
        void formatter
          .detectLanguage(action.content)
          .then((language) => updateState({ language }))
          .catch(() => setLastAction(`Opened ${action.filename}`, 'success'))
      }
    }
    if (action.type === 'save-file') {
      const extension = LANGUAGE_EXTENSIONS[state.language] ?? state.language
      const defaultName = state.fileName ?? `formatted.${extension}`
      void saveFileDialog(state.input, defaultName).then(
        (path) =>
          setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
        (err: unknown) =>
          setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      )
    }
  })

  // Cmd/Ctrl+Enter to format
  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleFormat()}
            disabled={!state.input.trim()}
            loading={isFormatting}
          >
            Format
          </Button>
          <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>
          <Select
            value={state.language}
            onChange={(e) => updateState({ language: e.target.value })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => void handleAutoDetect()}>
            Auto-detect
          </Button>
          <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            Indent
            <Select
              value={state.tabWidth}
              onChange={(e) => updateState({ tabWidth: Number(e.target.value) })}
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
            </Select>
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
      }
    >
      {error && (
        <Alert
          variant="error"
          className="border-b border-[var(--color-border)] rounded-none px-4 py-2"
        >
          {error}
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language={state.language}
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={monacoOptions}
        />
      </div>
    </ToolLayout>
  )
}
