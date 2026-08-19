import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowsInLineVerticalIcon,
  ArrowsOutLineVerticalIcon,
  BracketsAngleIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CrosshairSimpleIcon,
  FloppyDiskIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker, type WorkerRpc } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { CopyButton } from '@/components/shared/CopyButton'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useUiStore } from '@/stores/ui.store'
import { saveFileDialog } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { XmlWorker } from '@/workers/xml.worker'
import type { XmlInspection, XmlIssue, XmlTreeNode } from '@/workers/xml.api'
import XmlWorkerFactory from '@/workers/xml.worker?worker'
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/useCopyToClipboard'

type XmlView = 'source' | 'tree' | 'json' | 'xpath'

type XmlToolsState = {
  input: string
  fileName: string | null
  /**
   * Tree, JSON and XPath used to be tabs that replaced the editor, so every
   * "look at the document, fix the document" loop cost two tab switches. They
   * are panes beside the source now, and the choice persists.
   */
  view: XmlView
  xpath: string
  indent: number
}

/** Above this many elements the tree opens collapsed — expanding is one click. */
const LARGE_DOCUMENT_ELEMENTS = 300

const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'json' as const, label: 'JSON' },
  { value: 'xpath' as const, label: 'XPath' },
]

// ---------------------------------------------------------------------------
// Tree model
// ---------------------------------------------------------------------------

/**
 * The parser hands back decoded values, so anything written back into markup has
 * to be re-escaped — otherwise a document containing `&`, `<` or a quoted
 * attribute copies as XML that will not parse again.
 */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/** The XML a node stands for, so a tree row can be copied straight into an editor. */
function nodeToXml(node: XmlTreeNode): string {
  if (node.type === 'text') return escapeText(node.value)
  if (node.type === 'comment') return `<!--${node.value}-->`
  if (node.type === 'cdata') return `<![CDATA[${node.value}]]>`
  if (node.type === 'pi') return `<?${node.name} ${node.value}?>`
  const attributes = Object.entries(node.attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join('')
  if (node.children.length === 0) return `<${node.name}${attributes} />`
  return `<${node.name}${attributes}>${node.children.map(nodeToXml).join('')}</${node.name}>`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The first thing that actually breaks the document, warnings last. */
function firstBlockingIssue(issues: XmlIssue[]): XmlIssue | undefined {
  return issues.find((issue) => issue.level !== 'warning')
}

function describeIssue(issue: XmlIssue): string {
  const where =
    issue.line !== undefined
      ? ` — line ${issue.line}${issue.column !== undefined ? `, column ${issue.column}` : ''}`
      : ''
  return `${issue.message}${where}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function XmlTools() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<XmlToolsState>('xml-tools', {
    input: '',
    fileName: null,
    view: 'source',
    xpath: '',
    indent: 2,
  })
  const { record } = useToolHistory({ toolId: 'xml-tools' })

  const worker = useWorker<XmlWorker>(
    () => new XmlWorkerFactory(),
    ['validate', 'format', 'minify', 'toJson', 'stats', 'inspect', 'tree', 'queryXPath']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [error, setError] = useState<string | null>(null)
  const [inspection, setInspection] = useState<XmlInspection | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const busyRef = useRef(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const { input, view, xpath, indent } = state
  const inputRef = useRef(input)
  inputRef.current = input
  const hasInput = input.trim().length > 0

  // Validation used to be a button, so the document sat there silently broken
  // until somebody thought to press it. Debounced so typing stays cheap.
  useEffect(() => {
    if (!worker || !input.trim()) {
      setInspection(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .inspect(input)
        .then((result) => {
          if (!cancelled) setInspection(result)
        })
        .catch(() => {
          // A rejection is not "still checking": without a verdict of its own the
          // status line would sit at "Checking…" forever.
          if (!cancelled) {
            setInspection({
              valid: false,
              issues: [{ level: 'fatalError', message: 'The XML worker stopped responding' }],
              stats: { elements: 0, attributes: 0, textNodes: 0, depth: 0 },
            })
          }
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  const isValid = inspection?.valid ?? false
  const blockingIssue = inspection ? firstBlockingIssue(inspection.issues) : undefined
  const warnings = inspection?.issues.filter((issue) => issue.level === 'warning') ?? []
  const firstWarning = warnings[0]

  const status = !hasInput
    ? 'Nothing to inspect yet'
    : !inspection
      ? 'Checking…'
      : blockingIssue
        ? `Invalid XML — ${describeIssue(blockingIssue)}`
        : `Valid XML · ${inspection.stats.elements} element${inspection.stats.elements === 1 ? '' : 's'} · ${inspection.stats.attributes} attribute${inspection.stats.attributes === 1 ? '' : 's'} · depth ${inspection.stats.depth}`

  // --- Actions ---------------------------------------------------------

  const recordRun = useCallback(
    (output: string) => {
      const source = inputRef.current
      record({
        input: `XML: ${source.slice(0, 300)}${source.length > 300 ? '...' : ''}`,
        output: output.slice(0, 1000),
        subTab: view,
        success: true,
      })
    },
    [record, view]
  )

  const runTransform = useCallback(
    async (operation: 'format' | 'minify') => {
      if (!worker || busyRef.current || !inputRef.current.trim()) return
      busyRef.current = true
      setIsBusy(true)
      const snapshot = inputRef.current
      try {
        const result =
          operation === 'format'
            ? await worker.format(snapshot, indent)
            : await worker.minify(snapshot)
        if (result.valid && result.formatted !== undefined) {
          // Writing the result over a buffer the user kept typing into would
          // silently eat those keystrokes.
          if (inputRef.current !== snapshot) {
            setLastAction('Document changed while working — try again', 'info')
            return
          }
          updateState({ input: result.formatted })
          setError(null)
          setLastAction(operation === 'format' ? 'Formatted XML' : 'Minified XML', 'success')
          recordRun(result.formatted)
        } else {
          const issue = firstBlockingIssue(result.issues) ?? result.issues[0]
          setError(issue ? describeIssue(issue) : 'Invalid XML')
          setLastAction('Invalid XML', 'error')
        }
      } catch (e) {
        setError((e as Error).message)
        setLastAction(`${operation === 'format' ? 'Format' : 'Minify'} failed`, 'error')
      } finally {
        busyRef.current = false
        setIsBusy(false)
      }
    },
    [worker, indent, updateState, setLastAction, recordRun]
  )

  const handleSave = useCallback(() => {
    void saveFileDialog(inputRef.current, state.fileName ?? 'document.xml').then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (err: unknown) =>
        setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    )
  }, [state.fileName, setLastAction])

  // The parser knows where it went wrong; without this the user reads a line
  // number and then scrolls to find it by hand.
  const handleGoToError = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !blockingIssue?.line) return
    const position = { lineNumber: blockingIssue.line, column: blockingIssue.column ?? 1 }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [blockingIssue])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({ input: action.content, fileName: action.filename })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') {
      if (!inputRef.current.trim()) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      handleSave()
    }
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied XML' })
    }
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void runTransform('format')
    }, [runTransform])
  )

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <DocumentToolbar aria-label="XML document actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled'}
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
          {blockingIssue?.line !== undefined && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleGoToError}
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
              title="Format the document (⌘↵)"
            >
              Format
              <span className="ml-1 text-2xs opacity-70" aria-hidden="true">
                ⌘↵
              </span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runTransform('minify')}
              disabled={!hasInput || isBusy}
            >
              Minify
            </Button>
            <CopyButton text={input} label="Copy XML" />
            <Button
              variant="icon"
              size="sm"
              onClick={handleSave}
              disabled={!hasInput}
              title="Save to a file (⌘S)"
              aria-label="Save XML to file"
            >
              <FloppyDiskIcon size={16} aria-hidden="true" />
            </Button>
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
      {!error && firstWarning && isValid && (
        <Alert
          variant="warning"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {/* Warnings still parse, so they inform rather than block. */}
          {describeIssue(firstWarning)}
          {warnings.length > 1 && ` (+${warnings.length - 1} more)`}
        </Alert>
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
                description="Format with ⌘↵, browse it as a tree, convert it to JSON, or query it with XPath."
                action={
                  TOOL_SAMPLES['xml-tools'] ? (
                    <span className="pointer-events-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateState({ input: TOOL_SAMPLES['xml-tools'] ?? '' })}
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
          />
        )}
      </div>
    </ToolLayout>
  )
}

// ---------------------------------------------------------------------------
// Inspector (tree / json / xpath)
// ---------------------------------------------------------------------------

const PANE_LABELS: Record<Exclude<XmlView, 'source'>, string> = {
  tree: 'Tree view',
  json: 'JSON view',
  xpath: 'XPath results',
}

function InspectorPane({
  view,
  input,
  worker,
  isValid,
  pending,
  elementCount,
  blockingIssue,
  xpath,
  onXPathChange,
  monacoTheme,
  monacoOptions,
  onCopy,
}: {
  view: Exclude<XmlView, 'source'>
  input: string
  worker: WorkerRpc<XmlWorker> | null
  isValid: boolean
  pending: boolean
  elementCount: number
  blockingIssue: XmlIssue | undefined
  xpath: string
  onXPathChange: (next: string) => void
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  onCopy: CopyToClipboard
}) {
  const hasInput = input.trim().length > 0

  return (
    <section
      aria-label={PANE_LABELS[view]}
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--color-border)] max-[900px]:max-h-[45%] max-[900px]:border-l-0 max-[900px]:border-t"
    >
      {!hasInput ? (
        <EmptyState
          size="sm"
          title="Nothing to inspect"
          description="Type or open XML in the source pane."
        />
      ) : pending ? (
        // The first parse is debounced; calling a document invalid before it has
        // been read once is just wrong.
        <EmptyState size="sm" title="Checking…" description="Reading the document." />
      ) : !isValid ? (
        <EmptyState
          size="sm"
          icon={WarningCircleIcon}
          title="Invalid XML"
          description={
            blockingIssue ? describeIssue(blockingIssue) : 'The document does not parse.'
          }
        />
      ) : view === 'tree' ? (
        <TreePane input={input} worker={worker} elementCount={elementCount} onCopy={onCopy} />
      ) : view === 'json' ? (
        <JsonPane
          input={input}
          worker={worker}
          monacoTheme={monacoTheme}
          monacoOptions={monacoOptions}
        />
      ) : (
        <XPathPane
          input={input}
          worker={worker}
          xpath={xpath}
          onXPathChange={onXPathChange}
          onCopy={onCopy}
        />
      )}
    </section>
  )
}

function TreePane({
  input,
  worker,
  elementCount,
  onCopy,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  elementCount: number
  onCopy: CopyToClipboard
}) {
  // A 5000-element document rendered fully expanded janks the pane on open, so
  // the default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = elementCount <= LARGE_DOCUMENT_ELEMENTS
  const expanded = expandAll ?? autoExpanded

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  // Built on the worker thread from the same parse that validates the document,
  // so the tree never disagrees with the status line.
  const [tree, setTree] = useState<XmlTreeNode | null>(null)
  useEffect(() => {
    if (!worker || !input.trim()) {
      setTree(null)
      return
    }
    let cancelled = false
    // Debounced like every other pane: this one is open *beside* the editor
    // while the user types, so an undebounced re-parse plus a full recursive
    // re-render would land on every keystroke.
    const timer = setTimeout(() => {
      worker
        .tree(input)
        .then((result) => {
          if (!cancelled) setTree(result)
        })
        .catch(() => {
          if (!cancelled) setTree(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  return (
    <>
      <PaneHeader
        title="Tree"
        actions={
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(true)}
              className="gap-1"
              title="Expand every node"
            >
              <ArrowsOutLineVerticalIcon size={12} aria-hidden="true" />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(false)}
              className="gap-1"
              title="Collapse every node"
            >
              <ArrowsInLineVerticalIcon size={12} aria-hidden="true" />
              Collapse all
            </Button>
            {expandAll === null && !autoExpanded && (
              <span className="text-2xs text-[var(--color-text-muted)]">
                Collapsed — {elementCount} elements
              </span>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono">
        {tree ? (
          <TreeNodeRow key={treeKey} node={tree} defaultExpanded={expanded} onCopy={onCopy} />
        ) : (
          <EmptyState
            size="sm"
            title="Nothing to show"
            description="This document has no root element."
          />
        )}
      </div>
    </>
  )
}

function TreeNodeRow({
  node,
  depth = 0,
  defaultExpanded,
  onCopy,
}: {
  node: XmlTreeNode
  depth?: number
  defaultExpanded: boolean
  onCopy: CopyToClipboard
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const indent = depth * 16

  if (node.type === 'text') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs">
        <span className="text-[var(--color-success)]">&quot;{node.value}&quot;</span>
      </div>
    )
  }

  if (node.type === 'comment') {
    return (
      <div
        style={{ paddingLeft: indent }}
        className="py-0.5 text-xs text-[var(--color-text-muted)]"
      >
        &lt;!-- {node.value} --&gt;
      </div>
    )
  }

  if (node.type === 'cdata') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs text-[var(--color-warning)]">
        &lt;![CDATA[{node.value}]]&gt;
      </div>
    )
  }

  if (node.type === 'pi') {
    return (
      <div
        style={{ paddingLeft: indent }}
        className="py-0.5 text-xs text-[var(--color-text-muted)]"
      >
        &lt;?{node.name} {node.value}?&gt;
      </div>
    )
  }

  const hasChildren = node.children.length > 0
  const Caret = expanded ? CaretDownIcon : CaretRightIcon

  return (
    <div>
      <div className="group flex items-center gap-1" style={{ paddingLeft: indent }}>
        {/* eslint-disable-next-line no-restricted-syntax -- tree disclosure row: full-width,
            aligned to the indent grid and disabled on leaves; it is not an action button. */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-xs hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          onClick={() => hasChildren && setExpanded(!expanded)}
          aria-expanded={hasChildren ? expanded : undefined}
          disabled={!hasChildren}
        >
          <span className="w-3 shrink-0 text-[var(--color-text-muted)]">
            {hasChildren && <Caret size={12} aria-hidden="true" />}
          </span>
          {/* One span, no flex gap: the pieces of a tag have to read as a tag,
              not as `<catalog >`. */}
          <span className="truncate">
            <span className="text-[var(--color-accent)]">&lt;{node.name}</span>
            {Object.entries(node.attributes).map(([key, value]) => (
              <span key={key}>
                <span className="text-[var(--color-info)]"> {key}</span>
                <span className="text-[var(--color-text-muted)]">=</span>
                <span className="text-[var(--color-warning)]">&quot;{value}&quot;</span>
              </span>
            ))}
            <span className="text-[var(--color-accent)]">{hasChildren ? '>' : ' />'}</span>
          </span>
        </button>
        {/* Always in the tab order: a copy affordance that only appears on hover
            is invisible to keyboard and touch users. */}
        <Button
          variant="ghost"
          size="xs"
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => void onCopy(nodeToXml(node), { success: `Copied <${node.name}>` })}
          aria-label={`Copy <${node.name}> element`}
          title="Copy this element"
        >
          Copy
        </Button>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child, i) => (
          <TreeNodeRow
            key={i}
            node={child}
            depth={depth + 1}
            defaultExpanded={defaultExpanded}
            onCopy={onCopy}
          />
        ))}
      {expanded && hasChildren && (
        <div
          style={{ paddingLeft: indent }}
          className="py-0.5 pl-4 text-xs text-[var(--color-accent)]"
        >
          &lt;/{node.name}&gt;
        </div>
      )}
    </div>
  )
}

function JsonPane({
  input,
  worker,
  monacoTheme,
  monacoOptions,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  monacoTheme: string
  monacoOptions: Record<string, unknown>
}) {
  const [json, setJson] = useState('')
  const [failure, setFailure] = useState<string | null>(null)

  // Conversion used to need a Convert click and was thrown away on every
  // keystroke, so the pane was empty most of the time it was open.
  useEffect(() => {
    if (!worker || !input.trim()) {
      setJson('')
      setFailure(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .toJson(input)
        .then((result) => {
          if (cancelled) return
          if (result.valid && result.json) {
            setJson(result.json)
            setFailure(null)
          } else {
            setJson('')
            setFailure(result.error ?? 'Conversion failed')
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setJson('')
          setFailure(e instanceof Error ? e.message : 'Conversion failed')
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  return (
    <>
      <PaneHeader
        title="JSON"
        actions={json ? <CopyButton text={json} label="Copy JSON" /> : undefined}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {failure ? (
          <EmptyState
            size="sm"
            icon={WarningCircleIcon}
            title="Cannot convert"
            description={failure}
          />
        ) : json ? (
          <Editor
            theme={monacoTheme}
            language="json"
            value={json}
            options={{ ...monacoOptions, readOnly: true }}
          />
        ) : (
          <EmptyState size="sm" title="Converting…" description="Reading the document." />
        )}
      </div>
    </>
  )
}

function XPathPane({
  input,
  worker,
  xpath,
  onXPathChange,
  onCopy,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  xpath: string
  onXPathChange: (next: string) => void
  onCopy: CopyToClipboard
}) {
  const [matches, setMatches] = useState<string[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [predicatesIgnored, setPredicatesIgnored] = useState(false)
  const [queried, setQueried] = useState(false)

  // Queries run as you type: pressing a Query button to re-check a one-character
  // change was the slowest part of using this pane.
  useEffect(() => {
    if (!worker || !input.trim() || !xpath.trim()) {
      setMatches([])
      setFailure(null)
      setPredicatesIgnored(false)
      setQueried(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .queryXPath(input, xpath)
        .then((result) => {
          if (cancelled) return
          setMatches(result.matches)
          setFailure(result.error ?? null)
          setPredicatesIgnored(result.predicatesIgnored ?? false)
          setQueried(true)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setMatches([])
          setFailure(e instanceof Error ? e.message : 'XPath query failed')
          setQueried(true)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input, xpath])

  return (
    <>
      <PaneHeader
        title="XPath"
        actions={
          <>
            <output className="text-2xs text-[var(--color-text-muted)]">
              {queried && !failure
                ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
                : ''}
            </output>
          </>
        }
      />
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <Input
          aria-label="XPath expression"
          value={xpath}
          onChange={(e) => onXPathChange(e.target.value)}
          placeholder="/catalog/book or //title"
          className="w-full font-mono"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
        {/* Above the results, not inside them: a predicate is just as ignored
            when the path happens to match nothing. */}
        {predicatesIgnored && !failure && (
          <Alert variant="warning" className="text-2xs">
            Predicates are ignored — every node matching the path is listed.
          </Alert>
        )}
        {failure ? (
          // The engine used to return its own error message *as a match*, so a
          // broken expression looked like a result.
          <Alert variant="error" className="text-xs">
            {failure}
          </Alert>
        ) : !xpath.trim() ? (
          <EmptyState
            size="sm"
            title="Query the document"
            description="Child steps (/catalog/book) and descendant steps (//title) are supported."
          />
        ) : !queried ? (
          <EmptyState size="sm" title="Searching…" description="Running the expression." />
        ) : matches.length === 0 ? (
          <EmptyState size="sm" title="No matches" description="Nothing in the document matches." />
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((match, i) => (
              <div key={i} className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text)]">
                  {match}
                </pre>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void onCopy(match, { success: 'Copied match' })}
                  aria-label={`Copy match ${i + 1}`}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
