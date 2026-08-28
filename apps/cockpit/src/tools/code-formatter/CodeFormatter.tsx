import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import {
  ArrowCounterClockwiseIcon,
  BroomIcon,
  CheckIcon,
  CheckCircleIcon,
  CodeBlockIcon,
  GitDiffIcon,
  MagicWandIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useTextDocumentFileActions } from '@/hooks/useTextDocumentFileActions'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { SettingsPopover, SettingsRow, SettingsSection } from '@/components/shared/SettingsPopover'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'
import { formatShortcut } from '@/lib/shortcut-label'
import {
  LANGUAGES,
  extensionForLanguage,
  languageFromFilename,
  languageLabel,
  supportsJsStyleOptions,
  supportsQuoteStyle,
} from '@/tools/code-formatter/languages'
import { CODE_FORMATTER_SAMPLES } from '@/lib/tool-samples'
import { ProblemsList, type ProblemItem } from '@/components/shared/ProblemsList'

type CodeFormatterState = {
  input: string
  fileName: string | null
  filePath: string | null
  language: string
  tabWidth: number
  useTabs: boolean
  printWidth: number
  singleQuote: boolean
  trailingComma: 'all' | 'es5' | 'none'
  semi: boolean
  /** Opt-in because formatting incomplete code while typing can be surprising. */
  autoFormat: boolean
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
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<CodeFormatterState>('code-formatter', {
    input: '',
    fileName: null,
    filePath: null,
    language: 'javascript',
    tabWidth: 2,
    useTabs: false,
    printWidth: 80,
    singleQuote: true,
    trailingComma: 'es5',
    semi: false,
    autoFormat: false,
    lastFormat: null,
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    FORMATTER_WORKER_METHODS
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingFormat, setPendingFormat] = useState<{ before: string; after: string } | null>(null)
  const formattingRef = useRef(false)
  // A request that arrives mid-run is remembered rather than dropped: with auto-format on, the
  // newest input would otherwise stay unformatted until the user happened to type again.
  const queuedFormatRef = useRef<{ showPreview: boolean } | null>(null)
  const handleFormatRef = useRef<((showPreview?: boolean) => Promise<void>) | null>(null)
  // Session state, deliberately not persisted: a floating surface that reopened itself on
  // launch would cover the document before the user had asked for anything.
  const [optionsOpen, setOptionsOpen] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  // `state` as a whole changes on every keystroke; the format call only cares
  // about these six fields, so memoising them keeps the callback (and the
  // ⌘↵ shortcut registration that depends on it) stable while typing.
  const {
    input,
    language,
    tabWidth,
    useTabs,
    printWidth,
    singleQuote,
    trailingComma,
    semi,
    lastFormat,
  } = state
  const formatOptions = useMemo(
    () => ({ language, tabWidth, useTabs, printWidth, singleQuote, trailingComma, semi }),
    [language, tabWidth, useTabs, printWidth, singleQuote, trailingComma, semi]
  )
  const optionsRef = useRef(formatOptions)
  optionsRef.current = formatOptions
  const inputRef = useRef(input)
  inputRef.current = input

  const hasCode = input.trim().length > 0
  const formatProblem = useMemo<ProblemItem | null>(() => {
    if (!error) return null
    const location = error.match(/(?:\(|\[|\b)(\d+):(\d+)(?:\)|\]|\b)/)
    return {
      id: 'format-error',
      message: error,
      severity: 'error',
      ...(location?.[1] ? { line: Number(location[1]) } : {}),
      ...(location?.[2] ? { column: Number(location[2]) } : {}),
    }
  }, [error])

  const goToProblem = useCallback((problem: ProblemItem) => {
    const editor = editorRef.current
    if (!editor || problem.line === undefined) return
    const position = { lineNumber: problem.line, column: problem.column ?? 1 }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [])

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

  const handleFormat = useCallback(
    async (showPreview = true) => {
      const source = inputRef.current
      if (!formatter || !source.trim()) return
      if (formattingRef.current) {
        // Repeated requests collapse into one re-run against whatever the newest input is by then.
        queuedFormatRef.current = { showPreview }
        return
      }
      formattingRef.current = true
      setIsFormatting(true)
      try {
        const result = await formatter.format(source, optionsRef.current)
        // A slow formatter result must never replace edits made while it was running.
        if (inputRef.current !== source) return
        if (showPreview && result !== source) {
          setPendingFormat({ before: source, after: result })
          setPreviewOpen(true)
          setError(null)
          setLastAction('Format preview ready', 'success')
          return
        }
        updateState({
          input: result,
          lastFormat:
            source.length > MAX_SNAPSHOT_LENGTH ? null : { before: source, after: result },
        })
        setError(null)
        setPendingFormat(null)
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
        const queued = queuedFormatRef.current
        if (queued) {
          queuedFormatRef.current = null
          void handleFormatRef.current?.(queued.showPreview)
        }
      }
    },
    [formatter, updateState, setLastAction]
  )
  handleFormatRef.current = handleFormat

  const handleRevert = useCallback(() => {
    if (!lastFormat) return
    updateState({ input: lastFormat.before, lastFormat: null })
    setError(null)
    setPreviewOpen(false)
    setPendingFormat(null)
    setLastAction('Reverted to unformatted code', 'info')
  }, [lastFormat, updateState, setLastAction])

  const handleAcceptPreview = useCallback(() => {
    if (!pendingFormat || inputRef.current !== pendingFormat.before) return
    updateState({
      input: pendingFormat.after,
      lastFormat: pendingFormat.before.length > MAX_SNAPSHOT_LENGTH ? null : pendingFormat,
    })
    setPendingFormat(null)
    setPreviewOpen(false)
    setLastAction('Formatted', 'success')
  }, [pendingFormat, updateState, setLastAction])

  useEffect(() => {
    if (!state.autoFormat || !hasCode || pendingFormat || input === lastFormat?.after) return
    const timer = window.setTimeout(() => {
      void handleFormat(false)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [state.autoFormat, hasCode, input, pendingFormat, lastFormat?.after, handleFormat])

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

  const { handleOpen, handleSave, handleSaveAs } = useTextDocumentFileActions({
    getContent: () => inputRef.current,
    filePath: state.filePath ?? null,
    fileName: state.fileName ?? null,
    defaultFileName: () => `formatted.${extensionForLanguage(optionsRef.current.language)}`,
    onSaved: updateState,
  })

  useToolAction((action) => {
    if (action.type === 'open-file') {
      // The extension is a much stronger signal than content heuristics, so it
      // wins outright; only extensionless files fall back to the worker's guess.
      const fromName = languageFromFilename(action.filename)
      const languageAtOpen = fromName ?? optionsRef.current.language
      updateState({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
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
    if (action.type === 'save-file') void handleSave()
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
        <DocumentToolbar border aria-label="Code formatting actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled'}
            icon={
              <CodeBlockIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            status={isFormatting ? 'Formatting…' : describeStatus(status)}
            statusIcon={
              status === 'formatted' ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : status === 'modified' ? (
                <PencilSimpleIcon size={12} aria-hidden="true" className="shrink-0" />
              ) : undefined
            }
          />

          <DocumentFileActions
            open={{
              label: 'Open code file',
              title: `Open a code file (${formatShortcut('mod+o')})`,
              onClick: () => void handleOpen(),
            }}
            save={{
              label: 'Save code file',
              title: `Save the code (${formatShortcut('mod+s')})`,
              onClick: () => void handleSave(),
              disabled: !hasCode,
            }}
            saveAs={{
              label: 'Save code file as',
              onClick: () => void handleSaveAs(),
              disabled: !hasCode,
            }}
          />

          {stats && (
            <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
              {stats.lines} line{stats.lines === 1 ? '' : 's'} · {stats.characters} character
              {stats.characters === 1 ? '' : 's'}
            </span>
          )}

          {/* Two groups so a narrow window breaks between "what to format" and
                "act on it" rather than orphaning a single icon on its own row. */}
          <ToolbarGroup label="Formatting options" separated>
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
              <MagicWandIcon size={14} aria-hidden="true" />
              Auto-detect
            </Button>
            <SettingsPopover
              label="Style"
              open={optionsOpen}
              onOpenChange={setOptionsOpen}
              description={
                jsOptions && quoteStyle
                  ? undefined
                  : `Greyed-out options have no effect on ${languageLabel(state.language)}.`
              }
            >
              <SettingsSection>
                <SettingsRow label="Indent">
                  <Select
                    value={state.tabWidth}
                    onChange={(e) => updateState({ tabWidth: Number(e.target.value) })}
                  >
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </Select>
                </SettingsRow>
                <SettingsRow label="Use tabs">
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.useTabs}
                      onChange={(checked) => updateState({ useTabs: checked })}
                    />
                  )}
                </SettingsRow>
                <SettingsRow label="Print width">
                  <Select
                    value={state.printWidth}
                    onChange={(e) => updateState({ printWidth: Number(e.target.value) })}
                  >
                    <option value={80}>80</option>
                    <option value={100}>100</option>
                    <option value={120}>120</option>
                  </Select>
                </SettingsRow>
                <SettingsRow label="Single quotes" disabled={!quoteStyle}>
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.singleQuote}
                      disabled={!quoteStyle}
                      onChange={(checked) => updateState({ singleQuote: checked })}
                    />
                  )}
                </SettingsRow>
                <SettingsRow label="Semicolons" disabled={!jsOptions}>
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.semi}
                      disabled={!jsOptions}
                      onChange={(checked) => updateState({ semi: checked })}
                    />
                  )}
                </SettingsRow>
                <SettingsRow label="Trailing commas" disabled={!jsOptions}>
                  <Select
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
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Behaviour">
                <SettingsRow
                  label="Auto-format"
                  hint="Reformat as you type, without pressing Format."
                >
                  {({ labelId }) => (
                    <Toggle
                      aria-labelledby={labelId}
                      checked={state.autoFormat}
                      onChange={(checked) => updateState({ autoFormat: checked })}
                    />
                  )}
                </SettingsRow>
              </SettingsSection>
            </SettingsPopover>
          </ToolbarGroup>

          <ToolbarGroup label="Document actions" separated>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleFormat()}
              disabled={!canFormat}
              loading={isFormatting}
              title={`Format the code (${formatShortcut('mod+enter')})`}
            >
              <BroomIcon size={14} aria-hidden="true" />
              Format
              <Kbd keys="mod+enter" variant="inline" className="ml-1" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRevert}
              disabled={!canRevert}
              title="Restore the code as it was before formatting"
              className="gap-1"
            >
              <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
              Revert
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewOpen((open) => !open)}
              disabled={!pendingFormat && (!lastFormat || lastFormat.before === lastFormat.after)}
              aria-pressed={previewOpen}
              title="Compare the source before and after formatting"
            >
              <GitDiffIcon size={14} aria-hidden="true" />
              Diff
            </Button>
            {pendingFormat && (
              <>
                <Button variant="primary" size="sm" onClick={handleAcceptPreview} className="gap-1">
                  <CheckIcon size={14} aria-hidden="true" />
                  Apply format
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingFormat(null)
                    setPreviewOpen(false)
                  }}
                >
                  <XIcon size={14} aria-hidden="true" />
                  Discard preview
                </Button>
              </>
            )}
            <CopyButton text={input} />
          </ToolbarGroup>
        </DocumentToolbar>
      }
    >
      {formatProblem && (
        <div className="max-h-28 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <ProblemsList items={[formatProblem]} onSelect={goToProblem} />
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {previewOpen && (pendingFormat || lastFormat) ? (
          <DiffEditor
            theme={monacoTheme}
            language={state.language}
            original={(pendingFormat ?? lastFormat)?.before ?? ''}
            modified={(pendingFormat ?? lastFormat)?.after ?? ''}
            options={{ ...monacoOptions, readOnly: true, renderSideBySide: true }}
          />
        ) : (
          <Editor
            theme={monacoTheme}
            language={state.language}
            value={input}
            onChange={(v) => updateState({ input: v ?? '' })}
            options={monacoOptions}
            onMount={(editor) => {
              editorRef.current = editor
            }}
          />
        )}
        {!hasCode && (
          // Non-interactive so clicks fall through to the editor underneath —
          // the hint must never stand between the user and the caret.
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center text-[var(--color-text-muted)]">
            <CodeBlockIcon size={36} weight="light" aria-hidden="true" />
            <p className="text-sm text-[var(--color-text)]">Paste or type code to format</p>
            <p className="max-w-sm text-xs">
              {LANGUAGES.length} languages supported. Press <Kbd keys="mod+enter" /> to format, or
              open a file with <Kbd keys="mod+o" />.
            </p>
            {/* Keyed to the selected language, not a single JavaScript snippet:
                loading JS into a buffer set to SQL would format it as SQL and
                make the formatter look broken. Every sample is deliberately
                mis-formatted, because one that came in already tidy would make
                pressing Format appear to do nothing. */}
            {CODE_FORMATTER_SAMPLES[state.language] && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  updateState({
                    input: CODE_FORMATTER_SAMPLES[state.language] ?? '',
                    fileName: null,
                    filePath: null,
                  })
                }
                className="pointer-events-auto"
              >
                Load {languageLabel(state.language)} sample
              </Button>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  )
}
