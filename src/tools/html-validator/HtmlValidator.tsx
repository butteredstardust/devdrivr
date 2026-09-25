import { useCallback, useRef, useState } from 'react'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { SplitPane } from '@/components/shared/SplitPane'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useMonaco } from '@/hooks/useMonaco'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useToolState } from '@/hooks/useToolState'
import { useValidatorDocument } from '@/hooks/useValidatorDocument'
import { useWorker } from '@/hooks/useWorker'
import { useUiStore } from '@/stores/ui.store'
import { HtmlEditorPane } from '@/tools/html-validator/components/HtmlEditorPane'
import { HtmlPreviewPane } from '@/tools/html-validator/components/HtmlPreviewPane'
import { HtmlToolbar } from '@/tools/html-validator/components/HtmlToolbar'
import { ResultsPanel } from '@/tools/html-validator/components/ResultsPanel'
import {
  TEMPLATES,
  countRuleOverrides,
  toggleRule,
  type RuleConfig,
} from '@/tools/html-validator/html-helpers'
import type { HtmlValidatorState, ViewMode } from '@/tools/html-validator/html-validator-types'
import { useHtmlDocument } from '@/tools/html-validator/hooks/useHtmlDocument'
import { useHtmlPreview } from '@/tools/html-validator/hooks/useHtmlPreview'
import { useHtmlValidation } from '@/tools/html-validator/hooks/useHtmlValidation'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import type { HtmlWorker } from '@/workers/html.worker'
import HtmlWorkerFactory from '@/workers/html.worker?worker'

export default function HtmlValidator() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const { record } = useToolHistory({ toolId: 'html-validator' })
  // Session state: the rules surface floats over the editor, so restoring it open would
  // hide the document the moment the tool loads.
  const [rulesOpen, setRulesOpen] = useState(false)

  const [state, updateState] = useToolState<HtmlValidatorState>('html-validator', {
    input: '',
    fileName: null,
    filePath: null,
    savedContent: null,
    viewMode: 'split',
    templateId: TEMPLATES[0]?.id ?? 'minimal',
    panel: 'problems',
    panelOpen: true,
    disabledRules: [],
    enabledRules: [],
  })

  const formatter = useWorker<FormatterWorker>(() => new FormatterWorkerFactory(), ['format'])
  const validator = useWorker<HtmlWorker>(() => new HtmlWorkerFactory(), ['validateHtml'])
  const [isPopoutOpen, setIsPopoutOpen] = useState(false)

  /**
   * `useToolState` hydrates asynchronously, so the first validation of a restored
   * document looks exactly like one the user triggered. Only typing and explicit
   * buffer swaps set this, and only it lets a run reach history.
   */
  const input = state.input ?? ''
  const inputRef = useRef(input)
  inputRef.current = input
  const { hasInput, isDirty, userEditedRef } = useValidatorDocument(input, state.savedContent)
  const { disabledRules, enabledRules } = state
  // Treat unknown values, including the compatible `edit` value, as editor mode. This prevents a
  // restored session from rendering neither pane.
  const viewMode: ViewMode =
    state.viewMode === 'preview' || state.viewMode === 'split' ? state.viewMode : 'editor'
  const showEditor = viewMode === 'editor' || viewMode === 'split'
  const showPreview = viewMode === 'preview' || viewMode === 'split'

  const {
    issues,
    stats,
    isValidating,
    hasValidated,
    errorCount,
    warningCount,
    outlineIssues,
    handleEditorMount,
    goToIssue,
  } = useHtmlValidation({
    input,
    hasInput,
    disabledRules,
    enabledRules,
    validator,
    userEditedRef,
    record,
    viewMode,
    updateState,
  })

  const previewHtml = useHtmlPreview(input, hasInput)
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
  } = useHtmlDocument({ state, updateState, inputRef, userEditedRef, isDirty, formatter })

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
      requestDocument({
        input: content,
        fileName: filename,
        filePath: path,
        savedContent: content,
        successMessage: `Reloaded ${filename} from disk`,
      })
    },
  })

  // --- Global tool actions ---------------------------------------------

  useToolAction((action) => {
    if (action.type === 'open-file') {
      requestDocument({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied HTML', failure: 'Copy failed' })
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
    : isValidating && !hasValidated
      ? 'Checking…'
      : issues.length === 0
        ? `No problems · ${stats?.elements ?? 0} element${stats?.elements === 1 ? '' : 's'} · depth ${stats?.depth ?? 0}`
        : `${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  // Each pane renders identically whether it's alone or beside the other, so it's defined once
  // here and placed by the layout below rather than written out under both branches.
  const sourcePane = (
    <HtmlEditorPane
      theme={monacoTheme}
      input={input}
      hasInput={hasInput}
      onChange={handleChange}
      onMount={handleEditorMount}
      options={monacoOptions}
      onLoadSample={handleLoadSample}
    />
  )

  const previewPane = (
    <HtmlPreviewPane
      previewHtml={previewHtml}
      hasInput={hasInput}
      onExpand={() => setIsPopoutOpen(true)}
    />
  )

  return (
    <ToolLayout fullBleed>
      <HtmlToolbar
        state={state}
        updateState={updateState}
        viewMode={viewMode}
        isDirty={isDirty}
        status={status}
        hasInput={hasInput}
        hasValidated={hasValidated}
        issuesLength={issues.length}
        errorCount={errorCount}
        warningCount={warningCount}
        isFormatting={isFormatting}
        input={input}
        rulesOpen={rulesOpen}
        onRulesOpenChange={setRulesOpen}
        overrideCount={overrideCount}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onLoadTemplate={handleLoadTemplate}
        onFormat={handleFormat}
        onToggleRule={handleToggleRule}
        onResetRules={handleResetRules}
      />

      {formatError && (
        <Alert
          variant="error"
          className="max-h-24 overflow-auto rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          <pre className="whitespace-pre-wrap">{formatError}</pre>
        </Alert>
      )}

      {/* Split mode goes through SplitPane; the single-pane modes are a plain full-width box.
          Below ~900px SplitPane stacks them, because a 50/50 split there leaves two unusable
          columns. */}
      {showEditor && showPreview ? (
        <SplitPane
          storageKey="html-validator"
          stackBelow={900}
          aria-label="Resize source and preview"
        >
          {sourcePane}
          {previewPane}
        </SplitPane>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showEditor ? sourcePane : previewPane}
        </div>
      )}

      <ResultsPanel
        panel={state.panel}
        open={state.panelOpen}
        onPanelChange={(next) => updateState({ panel: next, panelOpen: true })}
        onToggleOpen={() => updateState({ panelOpen: !state.panelOpen })}
        issues={issues}
        errorCount={errorCount}
        warningCount={warningCount}
        isValidating={isValidating}
        hasValidated={hasValidated}
        hasInput={hasInput}
        headings={stats?.headings ?? []}
        outlineIssues={outlineIssues}
        onGoToIssue={goToIssue}
        onGoToHeading={(heading) =>
          goToIssue({
            type: 'warning',
            rule: 'outline',
            message: heading.text,
            line: heading.line ?? 1,
            col: heading.column ?? 1,
          })
        }
      />

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>
          {stats
            ? `${stats.elements} element${stats.elements === 1 ? '' : 's'} · depth ${stats.depth} · ${stats.headings.length} heading${stats.headings.length === 1 ? '' : 's'}`
            : 'Empty document'}
        </span>
        {stats && stats.styleAttributes > 0 && (
          <span>{stats.styleAttributes} style attributes</span>
        )}
        {stats && stats.scripts > 0 && (
          <span>
            {stats.scripts} script{stats.scripts === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </footer>

      {isPopoutOpen && (
        <Dialog
          title="HTML preview"
          onClose={() => setIsPopoutOpen(false)}
          closeLabel="Close the full-size preview"
          size="none"
          className="h-[90vh] w-[min(95vw,80rem)]"
          bodyClassName="p-0"
        >
          {/* Same deliberate palette exception as the inline preview above. */}
          <iframe
            title="HTML preview (full size)"
            sandbox=""
            srcDoc={previewHtml}
            className="h-full w-full border-none bg-white"
          />
        </Dialog>
      )}

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
            The current document has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}
