import { useCallback, useId, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CodeBlockIcon,
  FloppyDiskIcon,
  MagicWandIcon,
  PencilSimpleIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react'
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
import { Toggle } from '@/components/shared/Toggle'
import { ToolLayout } from '@/components/shared/ToolLayout'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'
import {
  LANGUAGES,
  extensionForLanguage,
  languageFromFilename,
  languageLabel,
  supportsJsStyleOptions,
  supportsQuoteStyle,
} from '@/tools/code-formatter/languages'

type CodeFormatterState = {
  input: string
  fileName: string | null
  language: string
  tabWidth: number
  singleQuote: boolean
  trailingComma: 'all' | 'es5' | 'none'
  semi: boolean
  /** Style options are collapsed by default — persisted so the choice sticks. */
  optionsOpen: boolean
  /**
   * Both sides of the last format. Persisted alongside the buffer: the buffer
   * survives a tool switch, so a status badge and a Revert button derived from
   * session-only state would start contradicting the document the user sees.
   * `before` is dropped above the cap rather than doubling a large payload.
   */
  lastFormat: { before: string; after: string } | null
}

/** Largest pre-format snapshot worth persisting for Revert (~200KB of source). */
const MAX_SNAPSHOT_LENGTH = 200_000

/** Formatting rewrites the buffer in place, so the document has four states. */
type FormatStatus = 'empty' | 'unformatted' | 'formatted' | 'modified'

function describeStatus(status: FormatStatus): string {
  switch (status) {
    case 'empty':
      return 'Nothing to format yet'
    case 'formatted':
      return 'Formatted'
    case 'modified':
      return 'Edited since last format'
    case 'unformatted':
      return 'Not formatted yet'
  }
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
    optionsOpen: false,
    lastFormat: null,
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    FORMATTER_WORKER_METHODS
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const formattingRef = useRef(false)
  const optionsId = useId()

  // `state` as a whole changes on every keystroke; the format call only cares
  // about these six fields, so memoising them keeps the callback (and the
  // ⌘↵ shortcut registration that depends on it) stable while typing.
  const { input, language, tabWidth, singleQuote, trailingComma, semi, lastFormat } = state
  const formatOptions = useMemo(
    () => ({ language, tabWidth, singleQuote, trailingComma, semi }),
    [language, tabWidth, singleQuote, trailingComma, semi]
  )
  const optionsRef = useRef(formatOptions)
  optionsRef.current = formatOptions
  const inputRef = useRef(input)
  inputRef.current = input

  const hasCode = input.trim().length > 0

  const status: FormatStatus = !hasCode
    ? 'empty'
    : !lastFormat
      ? 'unformatted'
      : input === lastFormat.after
        ? 'formatted'
        : 'modified'

  // Reverting only makes sense while the buffer still holds the format's output
  // and the format actually changed something.
  const canRevert =
    lastFormat !== null && input === lastFormat.after && lastFormat.before !== lastFormat.after

  const stats = useMemo(() => {
    if (!input.trim()) return null
    return { lines: input.split('\n').length, characters: input.length }
  }, [input])

  const handleFormat = useCallback(async () => {
    const source = inputRef.current
    if (!formatter || !source.trim() || formattingRef.current) return
    formattingRef.current = true
    setIsFormatting(true)
    try {
      const result = await formatter.format(source, optionsRef.current)
      updateState({
        input: result,
        lastFormat: source.length > MAX_SNAPSHOT_LENGTH ? null : { before: source, after: result },
      })
      setError(null)
      setLastAction(
        result === source ? 'Already formatted' : 'Formatted',
        result === source ? 'info' : 'success'
      )
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      setLastAction('Format error', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, updateState, setLastAction])

  const handleRevert = useCallback(() => {
    if (!lastFormat) return
    updateState({ input: lastFormat.before, lastFormat: null })
    setError(null)
    setLastAction('Reverted to unformatted code', 'info')
  }, [lastFormat, updateState, setLastAction])

  const handleAutoDetect = useCallback(async () => {
    if (!formatter || !inputRef.current.trim()) return
    try {
      const detected = await formatter.detectLanguage(inputRef.current)
      setError(null)
      updateState({ language: detected })
      setLastAction(`Detected: ${languageLabel(detected)}`, 'info')
    } catch (e) {
      setError((e as Error).message)
      setLastAction('Auto-detect failed', 'error')
    }
  }, [formatter, updateState, setLastAction])

  const handleSave = useCallback(() => {
    const defaultName = state.fileName ?? `formatted.${extensionForLanguage(state.language)}`
    void saveFileDialog(inputRef.current, defaultName).then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [state.fileName, state.language, setLastAction])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      // The extension is a much stronger signal than content heuristics, so it
      // wins outright; only extensionless files fall back to the worker's guess.
      const fromName = languageFromFilename(action.filename)
      const languageAtOpen = fromName ?? optionsRef.current.language
      updateState({
        input: action.content,
        fileName: action.filename,
        lastFormat: null,
        ...(fromName ? { language: fromName } : {}),
      })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
      if (!fromName && formatter) {
        void formatter
          .detectLanguage(action.content)
          .then((detected) => {
            // The round trip is async: if the user opened something else or
            // picked a language meanwhile, that choice wins over the guess.
            const stale =
              inputRef.current !== action.content || optionsRef.current.language !== languageAtOpen
            if (!stale) updateState({ language: detected })
          })
          .catch(() => {
            /* keep whatever language is selected */
          })
      }
    }
    if (action.type === 'save-file') handleSave()
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  const jsOptions = supportsJsStyleOptions(state.language)
  const quoteStyle = supportsQuoteStyle(state.language)
  const canFormat = Boolean(input.trim()) && !isFormatting

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <div className="border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            {/* Document identity — what am I looking at, and is it formatted? */}
            <div className="flex min-w-0 items-center gap-2">
              <CodeBlockIcon
                size={15}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <span className="font-ui truncate text-xs font-semibold text-[var(--color-text)]">
                {state.fileName ?? 'Untitled'}
              </span>
              <span
                role="status"
                aria-live="polite"
                className="flex shrink-0 items-center gap-1 text-2xs text-[var(--color-text-muted)]"
              >
                {status === 'formatted' && (
                  <CheckCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="text-[var(--color-success)]"
                  />
                )}
                {status === 'modified' && <PencilSimpleIcon size={12} aria-hidden="true" />}
                {isFormatting ? 'Formatting…' : describeStatus(status)}
              </span>
            </div>

            {/* Two groups so a narrow window breaks between "what to format" and
                "act on it" rather than orphaning a single icon on its own row. */}
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span className="max-[900px]:hidden">Language</span>
                <Select
                  aria-label="Language"
                  value={state.language}
                  onChange={(e) => updateState({ language: e.target.value })}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label}
                    </option>
                  ))}
                </Select>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleAutoDetect()}
                disabled={!hasCode}
                title="Guess the language from the code"
                className="gap-1"
              >
                <MagicWandIcon size={13} aria-hidden="true" />
                Auto-detect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ optionsOpen: !state.optionsOpen })}
                aria-expanded={state.optionsOpen}
                // Only advertise the relationship while the panel exists in the DOM.
                {...(state.optionsOpen ? { 'aria-controls': optionsId } : {})}
                className="gap-1"
              >
                <SlidersHorizontalIcon size={13} aria-hidden="true" />
                Style
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFormat()}
                disabled={!canFormat}
                loading={isFormatting}
                title="Format the code (⌘↵)"
              >
                Format
                <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                  ⌘↵
                </span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRevert}
                disabled={!canRevert}
                title="Restore the code as it was before formatting"
                className="gap-1"
              >
                <ArrowCounterClockwiseIcon size={13} aria-hidden="true" />
                Revert
              </Button>
              <CopyButton text={input} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={!hasCode}
                title="Save to a file (⌘S)"
                aria-label="Save to file"
              >
                <FloppyDiskIcon size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {state.optionsOpen && (
            <div
              id={optionsId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2"
            >
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Indent
                <Select
                  aria-label="Indent width"
                  value={state.tabWidth}
                  onChange={(e) => updateState({ tabWidth: Number(e.target.value) })}
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={8}>8 spaces</option>
                </Select>
              </label>
              <Toggle
                label="Single quotes"
                checked={state.singleQuote}
                disabled={!quoteStyle}
                onChange={(checked) => updateState({ singleQuote: checked })}
              />
              <Toggle
                label="Semicolons"
                checked={state.semi}
                disabled={!jsOptions}
                onChange={(checked) => updateState({ semi: checked })}
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Trailing commas
                <Select
                  aria-label="Trailing commas"
                  value={state.trailingComma}
                  disabled={!jsOptions}
                  onChange={(e) =>
                    updateState({
                      trailingComma: e.target.value as CodeFormatterState['trailingComma'],
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="es5">ES5</option>
                  <option value="all">All</option>
                </Select>
              </label>
              {(!jsOptions || !quoteStyle) && (
                <span className="text-2xs text-[var(--color-text-muted)]">
                  Greyed-out options have no effect on {languageLabel(state.language)}.
                </span>
              )}
              {stats && (
                <span className="ml-auto text-2xs text-[var(--color-text-muted)]">
                  {stats.lines} line{stats.lines === 1 ? '' : 's'} · {stats.characters} character
                  {stats.characters === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
        </div>
      }
    >
      {error && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {error}
        </Alert>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language={state.language}
          value={input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={monacoOptions}
        />
        {!hasCode && (
          // Non-interactive so clicks fall through to the editor underneath —
          // the hint must never stand between the user and the caret.
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-[var(--color-text-muted)]">
            <CodeBlockIcon size={36} weight="light" aria-hidden="true" />
            <p className="text-sm">Paste or type code to format</p>
            <p className="max-w-sm text-xs opacity-60">
              {LANGUAGES.length} languages supported. Press ⌘↵ to format, or open a file with ⌘O.
            </p>
          </div>
        )}
      </div>
    </ToolLayout>
  )
}
