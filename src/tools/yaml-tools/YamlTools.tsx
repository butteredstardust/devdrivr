import { useCallback, useId, useRef } from 'react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import {
  ArrowsInLineVerticalIcon,
  ArrowUUpLeftIcon,
  BracketsCurlyIcon,
  BroomIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  FileCodeIcon,
  MagnifyingGlassIcon,
  SortAscendingIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Input, Select } from '@/components/shared/Input'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import { documentsToJson, VIEW_OPTIONS, type YamlToolsState } from '@/tools/yaml-tools/yaml-helpers'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { sendToTool } from '@/lib/tool-handoff'
import { InspectorPane } from '@/tools/yaml-tools/components/InspectorPane'
import { useYamlDocumentActions } from '@/tools/yaml-tools/hooks/useYamlDocumentActions'
import { useYamlInspection } from '@/tools/yaml-tools/hooks/useYamlInspection'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function YamlTools() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<YamlToolsState>('yaml-tools', {
    input: '',
    fileName: null,
    filePath: null,
    view: 'source',
    tabWidth: 2,
    query: '',
    queryOpen: false,
  })
  const { record } = useToolHistory({ toolId: 'yaml-tools' })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )

  const queryId = useId()
  const copy = useCopyToClipboard()
  const { input, view, query } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0
  const { parsed, isValid, documents, queryResult, stats, status } = useYamlInspection(input, query)
  const {
    editorRef,
    error,
    setError,
    isFormatting,
    undoBuffer,
    setUndoBuffer,
    jsonDraft,
    setJsonDraft,
    handleFormat,
    handleSortKeys,
    handleCompact,
    handleApplyJson,
    handleUndo,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleGoToError,
  } = useYamlDocumentActions({
    state,
    updateState,
    formatter,
    inputRef,
    parsed,
    record,
    copy,
  })

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
        // No seam: nothing stacks under the toolbar inside this wrapper, so a border here would
        // be the single-row divider the toolbar primitive dropped, moved onto the wrapper.
        <div>
          <DocumentToolbar aria-label="YAML document actions">
            <DocumentIdentity
              title={state.fileName ?? 'Untitled'}
              titleTooltip={state.filePath ?? state.fileName ?? 'Untitled'}
              icon={
                <FileCodeIcon
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-text-muted)]"
                />
              }
              status={isFormatting ? 'Formatting…' : status}
              statusIcon={
                isValid ? (
                  <CheckCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-success)]"
                  />
                ) : parsed.status === 'invalid' ? (
                  <WarningCircleIcon
                    size={12}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-error)]"
                  />
                ) : undefined
              }
            />
            <DocumentFileActions
              open={{
                label: 'Open YAML file',
                title: `Open a YAML file (${formatShortcut('mod+o')})`,
                onClick: () => void handleOpen(),
              }}
              save={{
                label: 'Save YAML file',
                title: `Save the YAML (${formatShortcut('mod+s')})`,
                onClick: () => void handleSave(),
                disabled: !hasInput,
              }}
              saveAs={{
                label: 'Save YAML file as',
                onClick: () => void handleSaveAs(),
                disabled: !hasInput,
              }}
            />
            {parsed.status === 'invalid' && parsed.location && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleGoToError}
                title="Move the cursor to the parse error"
                className="shrink-0 gap-1"
              >
                <CrosshairSimpleIcon size={12} aria-hidden="true" />
                Go to error
              </Button>
            )}

            <ToolbarGroup label="View options" separated>
              <SegmentedControl
                aria-label="View"
                value={view}
                onChange={(next) => updateState({ view: next })}
                options={VIEW_OPTIONS}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState({ queryOpen: !state.queryOpen })}
                aria-expanded={state.queryOpen}
                // The query row only exists while open, so naming it when closed points at
                // nothing. `aria-expanded` alone carries the collapsed state.
                {...(state.queryOpen ? { 'aria-controls': queryId } : {})}
                className="gap-1"
              >
                <MagnifyingGlassIcon size={14} aria-hidden="true" />
                Path
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                Indent
                <Select
                  aria-label="YAML indent width"
                  value={state.tabWidth ?? 2}
                  onChange={(event) => updateState({ tabWidth: Number(event.target.value) })}
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                  <option value={8}>8 spaces</option>
                </Select>
              </label>
            </ToolbarGroup>

            <ToolbarGroup label="Document actions" separated>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFormat()}
                disabled={!hasInput || isFormatting}
                loading={isFormatting}
                title={`Format the document (${formatShortcut('mod+enter')})`}
              >
                <BroomIcon size={14} aria-hidden="true" />
                Format
                <Kbd keys="mod+enter" variant="inline" className="ml-1" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSortKeys}
                disabled={!hasInput}
                className="gap-1"
              >
                <SortAscendingIcon size={14} aria-hidden="true" />
                Sort keys
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCompact}
                disabled={!hasInput}
                className="gap-1"
              >
                <ArrowsInLineVerticalIcon size={14} aria-hidden="true" />
                Compact
              </Button>
              {undoBuffer && (
                <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
                  <ArrowUUpLeftIcon size={14} aria-hidden="true" />
                  Undo {undoBuffer.label.toLowerCase()}
                </Button>
              )}
              <CopyButton text={input} label="Copy YAML" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  sendToTool(
                    'json-tools',
                    { input: documentsToJson(documents), view: 'source' },
                    { documentKeys: ['input'] }
                  )
                }
                disabled={!isValid}
                title="Open this YAML as JSON"
              >
                <BracketsCurlyIcon size={14} aria-hidden="true" />
                JSON
              </Button>
            </ToolbarGroup>
          </DocumentToolbar>
          {state.queryOpen && (
            <div
              id={queryId}
              className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 text-2xs text-[var(--color-text-muted)]">
                Path
                <Input
                  aria-label="YAML path"
                  value={query}
                  onChange={(event) => updateState({ query: event.target.value })}
                  placeholder="$.spec.template.spec.containers[*].name"
                  monospace
                  className="min-w-0 flex-1"
                />
              </label>
              <output className="w-full font-mono text-xs text-[var(--color-text)]">
                {!isValid
                  ? 'Fix the YAML to run a path query.'
                  : !query.trim()
                    ? 'Dot, wildcard, slice, and filter paths are supported.'
                    : queryResult?.found
                      ? JSON.stringify(queryResult.value, null, 2)
                      : 'No match for this path'}
              </output>
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
      <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
        <section
          aria-label="YAML source"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Editor
            theme={monacoTheme}
            language="yaml"
            value={input}
            onChange={(v) => {
              updateState({ input: v ?? '' })
              // Reverting to a snapshot taken before the last few minutes of
              // typing would throw that typing away, so the offer expires on
              // the first manual edit.
              setUndoBuffer(null)
              // The banner reports a failed action on the *old* text; leaving it
              // up contradicts the status line as soon as the user fixes things.
              setError(null)
            }}
            options={monacoOptions}
            onMount={(editor) => {
              editorRef.current = editor
            }}
          />
          {!hasInput && (
            // Click-through: the hint must never sit between the user and the caret.
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <EmptyState
                icon={FileCodeIcon}
                title="Paste or open a YAML document"
                description={`Format with ${formatShortcut('mod+enter')}, inspect it as a tree, and read it as JSON — multi-document streams included.`}
                action={
                  TOOL_SAMPLES['yaml-tools'] ? (
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateState({
                            input: TOOL_SAMPLES['yaml-tools'] ?? '',
                            fileName: null,
                            filePath: null,
                          })
                        }
                      >
                        Load sample
                      </Button>
                    </span>
                  ) : undefined
                }
              />
            </div>
          )}
        </section>

        {view !== 'source' && (
          <InspectorPane
            view={view}
            parsed={parsed}
            keyCount={stats?.keys ?? 0}
            monacoTheme={monacoTheme}
            monacoOptions={monacoOptions}
            jsonDraft={jsonDraft}
            onJsonDraftChange={setJsonDraft}
            onApplyJson={handleApplyJson}
            queryResult={queryResult}
            query={query}
          />
        )}
      </div>
    </ToolLayout>
  )
}
