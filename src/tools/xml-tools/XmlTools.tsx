import { useRef } from 'react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import {
  ArrowsInLineVerticalIcon,
  BracketsAngleIcon,
  BroomIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { XmlWorker } from '@/workers/xml.worker'
import XmlWorkerFactory from '@/workers/xml.worker?worker'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { ProblemsList } from '@/components/shared/ProblemsList'
import { InspectorPane } from '@/tools/xml-tools/components/InspectorPane'
import { useXmlDocumentActions } from '@/tools/xml-tools/hooks/useXmlDocumentActions'
import { useXmlInspection } from '@/tools/xml-tools/hooks/useXmlInspection'
import {
  describeIssue,
  VIEW_OPTIONS,
  type XmlToolsState,
} from '@/tools/xml-tools/xml-tools-helpers'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function XmlTools() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<XmlToolsState>('xml-tools', {
    input: '',
    fileName: null,
    filePath: null,
    view: 'source',
    xpath: '',
    indent: 2,
  })
  const { record } = useToolHistory({ toolId: 'xml-tools' })

  const worker = useWorker<XmlWorker>(
    () => new XmlWorkerFactory(),
    ['validate', 'format', 'minify', 'toJson', 'fromJson', 'stats', 'inspect', 'tree', 'queryXPath']
  )

  const copy = useCopyToClipboard()

  const { input, view, xpath, indent } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0
  const { inspection, isValid, blockingIssue } = useXmlInspection(input, worker)
  const {
    editorRef,
    error,
    setError,
    isBusy,
    runTransform,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleGoToIssue,
    handleApplyJson,
  } = useXmlDocumentActions({
    state,
    updateState,
    worker,
    inputRef,
    blockingIssue,
    record,
    copy,
  })

  const status = !hasInput
    ? 'Nothing to inspect yet'
    : !inspection
      ? 'Checking…'
      : blockingIssue
        ? `Invalid XML — ${describeIssue(blockingIssue)}`
        : `Valid XML · ${inspection.stats.elements} element${inspection.stats.elements === 1 ? '' : 's'} · ${inspection.stats.attributes} attribute${inspection.stats.attributes === 1 ? '' : 's'} · depth ${inspection.stats.depth} · XSD not checked`

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <DocumentToolbar aria-label="XML document actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled'}
            icon={
              <BracketsAngleIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            status={status}
            statusIcon={
              hasInput && isValid ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : blockingIssue ? (
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
              label: 'Open XML file',
              title: `Open an XML file (${formatShortcut('mod+o')})`,
              onClick: () => void handleOpen(),
            }}
            save={{
              label: 'Save XML file',
              title: `Save the XML (${formatShortcut('mod+s')})`,
              onClick: () => void handleSave(),
              disabled: !hasInput,
            }}
            saveAs={{
              label: 'Save XML file as',
              onClick: () => void handleSaveAs(),
              disabled: !hasInput,
            }}
          />
          {blockingIssue?.line !== undefined && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleGoToIssue()}
              title="Move the cursor to the parse error"
              className="gap-1"
            >
              <CrosshairSimpleIcon size={12} aria-hidden="true" />
              Go to error
            </Button>
          )}

          <ToolbarGroup label="XML view options" separated>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="max-[900px]:hidden">Indent</span>
              <Select
                aria-label="Indent width"
                value={indent}
                onChange={(e) => updateState({ indent: Number(e.target.value) })}
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
              </Select>
            </label>
            <SegmentedControl
              aria-label="View"
              value={view}
              onChange={(next) => updateState({ view: next })}
              options={VIEW_OPTIONS}
            />
          </ToolbarGroup>

          <ToolbarGroup label="XML output" separated>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void runTransform('format')}
              disabled={!hasInput || isBusy}
              loading={isBusy}
              title={`Format the document (${formatShortcut('mod+enter')})`}
            >
              <BroomIcon size={14} aria-hidden="true" />
              Format
              <Kbd keys="mod+enter" variant="inline" className="ml-1" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runTransform('minify')}
              disabled={!hasInput || isBusy}
            >
              <ArrowsInLineVerticalIcon size={14} aria-hidden="true" />
              Minify
            </Button>
            <CopyButton text={input} label="Copy XML" />
          </ToolbarGroup>
        </DocumentToolbar>
      }
    >
      {error && (
        <Alert
          variant="error"
          className="max-h-24 overflow-auto rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          <pre className="whitespace-pre-wrap">{error}</pre>
        </Alert>
      )}
      {!error && inspection && inspection.issues.length > 0 && (
        <div className="max-h-40 shrink-0 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <ProblemsList
            items={inspection.issues.map((issue, index) => ({
              id: `${issue.level}-${issue.line ?? 0}-${issue.column ?? 0}-${index}`,
              message: issue.message,
              severity: issue.level === 'warning' ? 'warning' : 'error',
              ...(issue.line === undefined ? {} : { line: issue.line }),
              ...(issue.column === undefined ? {} : { column: issue.column }),
              code: issue.level,
            }))}
            onSelect={handleGoToIssue}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 max-[900px]:flex-col">
        <section
          aria-label="XML source"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Editor
            theme={monacoTheme}
            language="xml"
            value={input}
            onChange={(v) => {
              updateState({ input: v ?? '' })
              // The banner describes a failed run against the *old* text.
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
                icon={BracketsAngleIcon}
                title="Paste or open an XML document"
                description={`Format with ${formatShortcut('mod+enter')}, browse it as a tree, convert it to JSON, or query it with XPath.`}
                action={
                  TOOL_SAMPLES['xml-tools'] ? (
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateState({
                            input: TOOL_SAMPLES['xml-tools'] ?? '',
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
            input={input}
            worker={worker}
            isValid={isValid}
            pending={!inspection}
            elementCount={inspection?.stats.elements ?? 0}
            blockingIssue={blockingIssue}
            xpath={xpath}
            onXPathChange={(next) => updateState({ xpath: next })}
            monacoTheme={monacoTheme}
            monacoOptions={monacoOptions}
            onCopy={copy}
            onApplyJson={handleApplyJson}
          />
        )}
      </div>
    </ToolLayout>
  )
}
