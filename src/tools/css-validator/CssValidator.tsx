import { useCallback, useRef, useState } from 'react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { FileCssIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolAction } from '@/hooks/useToolAction'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useValidatorDocument } from '@/hooks/useValidatorDocument'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useUiStore } from '@/stores/ui.store'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import {
  TEMPLATES,
  countRuleOverrides,
  toggleRule,
  type RuleConfig,
} from '@/tools/css-validator/css-helpers'
import {
  syntaxFromFilename,
  type CssValidatorState,
} from '@/tools/css-validator/css-validator-types'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { CssValidatorToolbar } from '@/tools/css-validator/components/CssValidatorToolbar'
import { ResultsPanel } from '@/tools/css-validator/components/ResultsPanel'
import { useCssAnalysis } from '@/tools/css-validator/hooks/useCssAnalysis'
import { useCssDocumentActions } from '@/tools/css-validator/hooks/useCssDocumentActions'
import { useCssEditorMarkers } from '@/tools/css-validator/hooks/useCssEditorMarkers'

export default function CssValidator() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const { record } = useToolHistory({ toolId: 'css-validator' })
  // Session state: the rules surface floats over the editor, so restoring it open would
  // hide the document the moment the tool loads.
  const [rulesOpen, setRulesOpen] = useState(false)

  const [state, updateState] = useToolState<CssValidatorState>('css-validator', {
    input: '',
    fileName: null,
    filePath: null,
    savedContent: null,
    templateId: TEMPLATES[0]?.id ?? 'flexbox',
    panel: 'problems',
    panelOpen: true,
    disabledRules: [],
    enabledRules: [],
    syntax: 'css',
  })

  const formatter = useWorker<FormatterWorker>(() => new FormatterWorkerFactory(), ['format'])
  /**
   * `useToolState` hydrates asynchronously, so the first run over a restored
   * stylesheet is indistinguishable from one the user triggered. Only typing
   * and explicit buffer swaps set this, and only it lets a run reach history.
   */
  const input = state.input ?? ''
  const inputRef = useRef(input)
  inputRef.current = input
  const { hasInput, isDirty, userEditedRef } = useValidatorDocument(input, state.savedContent)
  const { disabledRules, enabledRules } = state
  const {
    issues,
    stats,
    selectors,
    isAnalyzing,
    hasAnalyzed,
    errorCount,
    warningCount,
    rankedSelectors,
    listedIssues,
  } = useCssAnalysis({
    input,
    hasInput,
    syntax: state.syntax,
    disabledRules,
    enabledRules,
    userEditedRef,
    record,
  })
  const { handleEditorMount, goToPosition } = useCssEditorMarkers(issues)
  const {
    isFormatting,
    formatError,
    pendingDocument,
    setPendingDocument,
    applyDocument,
    requestDocument,
    handleNew,
    handleLoadTemplate,
    handleLoadSample,
    handleChange,
    handleOpen,
    handleSaveAs,
    handleSave,
    handleFormat,
  } = useCssDocumentActions({
    state,
    updateState,
    formatter,
    inputRef,
    userEditedRef,
    isDirty,
    setLastAction,
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void handleFormat()
    }, [handleFormat])
  )

  useReloadOnFileChange({
    filePath: state.filePath,
    getContent: () => inputRef.current,
    onReload: ({ content, filename, path }) => {
      const syntax = syntaxFromFilename(filename)
      requestDocument({
        input: content,
        fileName: filename,
        filePath: path,
        savedContent: content,
        ...(syntax ? { syntax } : {}),
        successMessage: `Reloaded ${filename} from disk`,
      })
    },
  })

  // --- Global tool actions ---------------------------------------------

  useToolAction((action) => {
    if (action.type === 'open-file') {
      const syntax = syntaxFromFilename(action.filename)
      requestDocument({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        ...(syntax ? { syntax } : {}),
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied CSS', failure: 'Copy failed' })
    }
  })

  // --- Rules -----------------------------------------------------------

  const overrideCount = countRuleOverrides(disabledRules, enabledRules)

  const handleToggleRule = useCallback(
    (rule: RuleConfig, next: boolean) => {
      updateState(toggleRule(rule, disabledRules, enabledRules, next))
    },
    [disabledRules, enabledRules, updateState]
  )

  const handleResetRules = useCallback(() => {
    updateState({ disabledRules: [], enabledRules: [] })
    setLastAction('Rules reset to defaults', 'success')
  }, [updateState, setLastAction])

  // --- Status ----------------------------------------------------------

  const status = !hasInput
    ? 'Nothing to check yet'
    : isAnalyzing && !hasAnalyzed
      ? 'Checking…'
      : issues.length === 0
        ? `No problems · ${stats?.rules ?? 0} rule${stats?.rules === 1 ? '' : 's'}`
        : `${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  return (
    <ToolLayout fullBleed>
      <CssValidatorToolbar
        state={state}
        updateState={updateState}
        input={input}
        hasInput={hasInput}
        isDirty={isDirty}
        isFormatting={isFormatting}
        formatterAvailable={Boolean(formatter)}
        status={status}
        hasAnalyzed={hasAnalyzed}
        issueCount={issues.length}
        errorCount={errorCount}
        warningCount={warningCount}
        rulesOpen={rulesOpen}
        onRulesOpenChange={setRulesOpen}
        overrideCount={overrideCount}
        onToggleRule={handleToggleRule}
        onResetRules={handleResetRules}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onLoadTemplate={handleLoadTemplate}
        onFormat={handleFormat}
      />

      {formatError && (
        <Alert
          variant="error"
          className="max-h-24 overflow-auto rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          <pre className="whitespace-pre-wrap">{formatError}</pre>
        </Alert>
      )}

      <section aria-label="CSS source" className="relative min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language={state.syntax}
          value={input}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={monacoOptions}
        />
        {!hasInput && (
          // Click-through: the hint must never sit between the user and the caret.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <EmptyState
              icon={FileCssIcon}
              title="Paste or open a stylesheet"
              description={`It is checked against the CSS specification as you type, and reformatted with ${formatShortcut('mod+enter')}.`}
              action={
                TOOL_SAMPLES['css-validator'] ? (
                  <span className="pointer-events-auto">
                    <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                      Load sample
                    </Button>
                  </span>
                ) : undefined
              }
            />
          </div>
        )}
      </section>

      <ResultsPanel
        panel={state.panel}
        open={state.panelOpen}
        onPanelChange={(next) => updateState({ panel: next, panelOpen: true })}
        onToggleOpen={() => updateState({ panelOpen: !state.panelOpen })}
        issues={listedIssues}
        totalIssues={issues.length}
        errorCount={errorCount}
        warningCount={warningCount}
        isAnalyzing={isAnalyzing}
        hasAnalyzed={hasAnalyzed}
        hasInput={hasInput}
        selectors={rankedSelectors}
        totalSelectors={selectors.length}
        onGoTo={goToPosition}
      />

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>
          {stats
            ? `${stats.rules} rule${stats.rules === 1 ? '' : 's'} · ${stats.selectors} selector${stats.selectors === 1 ? '' : 's'} · ${stats.declarations} declaration${stats.declarations === 1 ? '' : 's'}`
            : 'Empty stylesheet'}
        </span>
        {stats && stats.customProperties > 0 && <span>{stats.customProperties} custom props</span>}
        {stats && stats.mediaQueries > 0 && <span>{stats.mediaQueries} media queries</span>}
        {stats && stats.idSelectors > 0 && (
          <span className="text-[var(--color-warning)]">
            {stats.idSelectors} ID selector{stats.idSelectors === 1 ? '' : 's'}
          </span>
        )}
        {stats && stats.importants > 0 && (
          <span className="text-[var(--color-warning)]">{stats.importants} !important</span>
        )}
        <span className="ml-auto">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </footer>

      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          size="md"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                Discard changes
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            The current stylesheet has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}
