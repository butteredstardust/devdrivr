import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  CheckCircleIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolAction } from '@/hooks/useToolAction'
import { dispatchToolAction } from '@/lib/tool-actions'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { Checkbox } from '@/components/shared/Checkbox'
import { useUiStore } from '@/stores/ui.store'
import { filenameFromPath, openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { REFACTORING_SAMPLE } from '@/lib/tool-samples'
import type { RefactoringWorker } from '@/workers/refactoring.worker'
import RefactoringWorkerFactory from '@/workers/refactoring.worker?worker'
import {
  TRANSFORMS,
  CATEGORIES,
  SAFETY_TEXT_CLASSES,
  SAFETY_LABELS,
  LANGUAGES,
  type Transform,
  type TransformCategory,
} from '@/tools/refactoring-toolkit/transforms'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { useIsInstanceActive } from '@/app/tool-instance'
import { sendToTool } from '@/lib/tool-handoff'

type RefactoringView = 'source' | 'diff'

type RefactoringState = {
  input: string
  fileName: string | null
  filePath: string | null
  selectedTransforms: string[]
  language: string
  /** The transform list is a disclosure so an 800px-wide window still has an editor. */
  panelOpen: boolean
  view: RefactoringView
  /**
   * Applying rewrites the buffer in place, so the pre-apply source is kept for
   * Undo. Persisted with the buffer: both survive a tool switch, and an Undo
   * button derived from session-only state would vanish while the transformed
   * code it belongs to stayed on screen.
   */
  lastApply: { before: string; after: string } | null
  applyHistory: Array<{ before: string; after: string }>
  /** Bounded custom codemod: AST-aware identifier rename, executed in the worker. */
  customFind: string
  customReplace: string
}

/** Largest pre-apply snapshot worth persisting for Undo (~200KB of source). */
const MAX_SNAPSHOT_LENGTH = 200_000
const MAX_APPLY_HISTORY = 20

const EXTENSION: Record<string, string> = { javascript: 'js', typescript: 'ts' }

function languageFromFilename(filename: string): string | null {
  if (/\.[cm]?tsx?$/i.test(filename)) return 'typescript'
  if (/\.[cm]?jsx?$/i.test(filename)) return 'javascript'
  return null
}

function matchesSearch(transform: Transform, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    transform.name.toLowerCase().includes(needle) ||
    transform.description.toLowerCase().includes(needle)
  )
}

/**
 * `indeterminate` is a DOM property with no HTML attribute, so a partially
 * selected category can only be expressed through the node itself.
 */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
  'aria-label': string
}) {
  return (
    <Checkbox
      indeterminate={indeterminate}
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  )
}

export default function RefactoringToolkit() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const diffOptions = useMemo(
    () => ({
      ...monacoOptions,
      readOnly: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
    }),
    [monacoOptions]
  )

  const [state, updateState] = useToolState<RefactoringState>('refactoring-toolkit', {
    input: '',
    fileName: null,
    filePath: null,
    selectedTransforms: [],
    language: 'javascript',
    panelOpen: true,
    view: 'source',
    lastApply: null,
    applyHistory: [],
    customFind: '',
    customReplace: '',
  })

  const worker = useWorker<RefactoringWorker>(
    () => new RefactoringWorkerFactory(),
    ['applyTransforms']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  // The source the preview was computed from travels with it, so a diff shown
  // while the debounce is still catching up compares two consistent snapshots
  // instead of pairing new source with an old result.
  const [preview, setPreview] = useState<{ source: string; output: string } | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const panelId = useId()
  const isInstanceActive = useIsInstanceActive()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)

  const { input, language, selectedTransforms, lastApply } = state
  const applyHistory = useMemo(() => state.applyHistory ?? [], [state.applyHistory])
  const latestApply = applyHistory.at(-1) ?? lastApply
  const hasCode = input.trim().length > 0
  const customCodemod = useMemo(() => {
    const valid = /^[$A-Z_a-z][$\w]*$/
    return valid.test(state.customFind) && valid.test(state.customReplace)
      ? { identifierFrom: state.customFind, identifierTo: state.customReplace }
      : undefined
  }, [state.customFind, state.customReplace])
  const selectedCount = selectedTransforms.length + (customCodemod ? 1 : 0)

  const availableTransforms = useMemo(
    () => TRANSFORMS.filter((t) => t.languages.includes(language)),
    [language]
  )
  const visibleTransforms = useMemo(
    () => availableTransforms.filter((t) => matchesSearch(t, search)),
    [availableTransforms, search]
  )

  // Auto-preview, debounced: the transform list is a checkbox grid, so a
  // "Preview" button would mean two clicks for every experiment.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const requestId = ++requestRef.current
    if (!worker || !input.trim() || (selectedTransforms.length === 0 && !customCodemod)) {
      setPreview(null)
      setError(null)
      setIsPreviewing(false)
      return
    }
    setIsPreviewing(true)
    debounceRef.current = setTimeout(() => {
      const parser = language === 'typescript' ? 'tsx' : 'babel'
      worker
        .applyTransforms(input, selectedTransforms, parser, customCodemod)
        .then((output) => {
          if (requestId !== requestRef.current) return
          setPreview({ source: input, output })
          setError(null)
        })
        .catch((err: unknown) => {
          if (requestId !== requestRef.current) return
          setPreview(null)
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (requestId === requestRef.current) setIsPreviewing(false)
        })
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [worker, input, selectedTransforms, language, customCodemod])

  const isStale = preview !== null && preview.source !== input
  const noChanges = preview !== null && !isStale && preview.output === preview.source
  const canApply = preview !== null && !isStale && !noChanges
  const showDiff = state.view === 'diff' && canApply
  // Copy what the user is looking at: in Source view the buffer is still the
  // pre-transform code, and a Copy that quietly hands back the preview instead
  // is a paste-the-wrong-thing bug.
  const copyText = showDiff && preview ? preview.output : input
  const hasDestructive = selectedTransforms.some(
    (id) => TRANSFORMS.find((t) => t.id === id)?.safety === 'destructive'
  )
  // Undo only while the buffer still holds exactly what Apply produced.
  const canUndo =
    latestApply !== null && input === latestApply.after && latestApply.before !== latestApply.after

  const handleApply = useCallback(() => {
    if (preview === null || preview.source !== input || preview.output === input) return
    const snapshot = { before: input, after: preview.output }
    const historyBase = applyHistory.at(-1)?.after === input ? applyHistory : []
    const nextHistory =
      input.length > MAX_SNAPSHOT_LENGTH ? [] : [...historyBase, snapshot].slice(-MAX_APPLY_HISTORY)
    updateState({
      input: preview.output,
      selectedTransforms: [],
      customFind: '',
      customReplace: '',
      view: 'source',
      lastApply: input.length > MAX_SNAPSHOT_LENGTH ? null : snapshot,
      applyHistory: nextHistory,
    })
    setPreview(null)
    setLastAction(
      hasDestructive ? 'Transforms applied — code was removed' : 'Transforms applied',
      hasDestructive ? 'info' : 'success'
    )
  }, [preview, input, hasDestructive, applyHistory, updateState, setLastAction])

  const handleUndo = useCallback(() => {
    if (!latestApply) return
    const nextHistory = applyHistory.slice(0, -1)
    updateState({
      input: latestApply.before,
      applyHistory: nextHistory,
      lastApply: nextHistory.at(-1) ?? null,
      view: 'source',
    })
    setLastAction('Reverted to the code before the transforms', 'info')
  }, [latestApply, applyHistory, updateState, setLastAction])

  // Monaco keeps ordinary typing in its own undo stack. Intercept mod+z only when the buffer is
  // exactly an applied transform snapshot; once the user edits, Monaco remains in charge.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInstanceActive || !canUndo) return
      if ((!event.metaKey && !event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== 'z')
        return
      event.preventDefault()
      event.stopPropagation()
      handleUndo()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isInstanceActive, canUndo, handleUndo])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleApply)

  const toggleTransform = useCallback(
    (id: string) => {
      const selected = state.selectedTransforms.includes(id)
      updateState({
        selectedTransforms: selected
          ? state.selectedTransforms.filter((t) => t !== id)
          : [...state.selectedTransforms, id],
        // Selecting is a deliberate act, so following it into the diff isn't a
        // surprise; deselecting the last one has nothing left to diff.
        view: selected && state.selectedTransforms.length === 1 ? 'source' : 'diff',
      })
    },
    [state.selectedTransforms, updateState]
  )

  const toggleCategory = useCallback(
    (categoryId: TransformCategory) => {
      // Only the rows the user can actually see are affected — select-all under
      // an active search must not quietly enable filtered-out transforms.
      const ids = visibleTransforms.filter((t) => t.category === categoryId).map((t) => t.id)
      const allSelected = ids.length > 0 && ids.every((id) => state.selectedTransforms.includes(id))
      const next = allSelected
        ? state.selectedTransforms.filter((id) => !ids.includes(id))
        : [...new Set([...state.selectedTransforms, ...ids])]
      updateState({ selectedTransforms: next, view: next.length > 0 ? 'diff' : 'source' })
    },
    [visibleTransforms, state.selectedTransforms, updateState]
  )

  const handleSaveAs = useCallback(async () => {
    const defaultName = state.fileName ?? `refactored.${EXTENSION[language] ?? 'js'}`
    try {
      const path = await saveFileDialog(input, defaultName)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      updateState({ filePath: path, fileName: filenameFromPath(path) })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.fileName, language, input, setLastAction, updateState])

  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await saveFileToPath(state.filePath, input)
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.filePath, state.fileName, input, handleSaveAs, setLastAction])

  const handleOpen = useCallback(async () => {
    try {
      const opened = await openFileDialog()
      if (opened) dispatchToolAction({ type: 'open-file', ...opened })
    } catch (err) {
      setLastAction(`Open failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [setLastAction])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      const detected = languageFromFilename(action.filename)
      updateState({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        selectedTransforms: [],
        view: 'source',
        lastApply: null,
        applyHistory: [],
        customFind: '',
        customReplace: '',
        ...(detected ? { language: detected } : {}),
      })
      setError(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') {
      if (!hasCode) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      void handleSave()
    }
    if (action.type === 'copy-output' && hasCode) {
      void copy(copyText, { success: 'Code copied', failure: 'Copy failed' })
    }
  })

  const status = !hasCode
    ? 'Nothing to transform yet'
    : error
      ? 'Transform failed'
      : selectedCount === 0
        ? 'Select transforms to preview'
        : isPreviewing || isStale
          ? 'Previewing…'
          : noChanges
            ? 'No changes for this code'
            : preview
              ? `Preview ready · ${selectedCount} transform${selectedCount === 1 ? '' : 's'}`
              : 'Previewing…'

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <DocumentToolbar aria-label="Refactoring actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled'}
            icon={
              <ArrowsClockwiseIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            status={status}
            statusIcon={
              canApply && !isPreviewing ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : error ? (
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

          <ToolbarGroup label="Refactoring options" separated>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateState({ panelOpen: !state.panelOpen })}
              aria-expanded={state.panelOpen}
              {...(state.panelOpen ? { 'aria-controls': panelId } : {})}
              className="gap-1"
            >
              <SlidersHorizontalIcon size={14} aria-hidden="true" />
              Transforms
              {selectedCount > 0 && (
                <span className="ml-1 text-2xs tabular-nums opacity-70">{selectedCount}</span>
              )}
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="max-[900px]:hidden">Language</span>
              <Select
                aria-label="Language"
                value={language}
                onChange={(e) => updateState({ language: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </label>
            <SegmentedControl
              aria-label="View"
              value={showDiff ? 'diff' : 'source'}
              onChange={(view) => {
                updateState({ view })
                // With no preview to show, the control snaps back to Source —
                // say why instead of eating the click silently.
                if (view === 'diff' && !canApply) {
                  setLastAction(
                    noChanges ? 'No changes to preview' : 'Select transforms to preview',
                    'info'
                  )
                }
              }}
              options={[
                { value: 'source', label: 'Source' },
                { value: 'diff', label: 'Diff' },
              ]}
            />
          </ToolbarGroup>

          <ToolbarGroup label="Document actions" separated>
            <Button
              variant={hasDestructive ? 'danger' : 'primary'}
              size="sm"
              onClick={handleApply}
              disabled={!canApply}
              title={
                hasDestructive
                  ? `Apply the transforms — this removes code (${formatShortcut('mod+enter')})`
                  : `Apply the transforms to the buffer (${formatShortcut('mod+enter')})`
              }
            >
              <CheckIcon size={14} aria-hidden="true" />
              {hasDestructive ? 'Apply (removes code)' : 'Apply'}
              <Kbd keys="mod+enter" variant="inline" className="ml-1" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Restore the code from before the last apply"
              className="gap-1"
            >
              <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
              Undo
            </Button>
            <CopyButton text={copyText} label={showDiff ? 'Copy transformed code' : 'Copy code'} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendToTool('code-formatter', { input, language })}
              disabled={!hasCode}
              title="Open the current code in Code Formatter"
            >
              <MagicWandIcon size={14} aria-hidden="true" />
              Format
            </Button>
          </ToolbarGroup>
        </DocumentToolbar>
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

      {/* Stacks below 900px: a 256px sidebar next to an editor is unusable at 800×600. */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        {state.panelOpen && (
          <section
            id={panelId}
            aria-label="Transforms"
            className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] max-[900px]:max-h-[45%] max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b"
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <MagnifyingGlassIcon
                size={14}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
              <Input
                aria-label="Filter transforms"
                placeholder="Filter transforms…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1"
              />
              {selectedCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    updateState({
                      selectedTransforms: [],
                      customFind: '',
                      customReplace: '',
                      view: 'source',
                    })
                  }
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <fieldset className="mb-4 border-b border-[var(--color-border)] pb-4">
                <legend className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">
                  Custom identifier codemod
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label="Identifier to rename"
                    monospace
                    placeholder="oldName"
                    value={state.customFind}
                    onChange={(event) =>
                      updateState({ customFind: event.target.value, view: 'diff' })
                    }
                  />
                  <Input
                    aria-label="Replacement identifier"
                    monospace
                    placeholder="newName"
                    value={state.customReplace}
                    onChange={(event) =>
                      updateState({ customReplace: event.target.value, view: 'diff' })
                    }
                  />
                </div>
                <p className="mt-1.5 text-2xs text-[var(--color-text-muted)]">
                  Renames matching identifiers through the parsed AST; invalid names are ignored.
                </p>
              </fieldset>
              {visibleTransforms.length === 0 ? (
                <p className="py-2 text-xs text-[var(--color-text-muted)]">
                  No transforms match “{search}”.
                </p>
              ) : (
                CATEGORIES.map((category) => {
                  const rows = visibleTransforms.filter((t) => t.category === category.id)
                  if (rows.length === 0) return null
                  const selectedInCategory = rows.filter((t) =>
                    selectedTransforms.includes(t.id)
                  ).length
                  // `aria-label` rather than a <legend>: the visible heading is
                  // part of the select-all control below, and a legend
                  // repeating it would double the group's name.
                  return (
                    <fieldset
                      key={category.id}
                      aria-label={category.label}
                      className="mb-4 min-w-0"
                    >
                      {/* A checkbox rather than the old button-wrapping-a-checkbox,
                          which nested one control inside another. */}
                      <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <IndeterminateCheckbox
                          checked={selectedInCategory === rows.length}
                          indeterminate={selectedInCategory > 0 && selectedInCategory < rows.length}
                          onChange={() => toggleCategory(category.id)}
                          aria-label={`Select all ${category.label} transforms`}
                        />
                        <span className="font-ui font-semibold">{category.label}</span>
                        <span className="ml-auto text-2xs tabular-nums opacity-70">
                          {selectedInCategory}/{rows.length}
                        </span>
                      </label>

                      {rows.map((transform) => (
                        <label
                          key={transform.id}
                          className="mb-1 flex cursor-pointer items-start gap-2 rounded p-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
                        >
                          <Checkbox
                            checked={selectedTransforms.includes(transform.id)}
                            onChange={() => toggleTransform(transform.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="font-bold text-[var(--color-text)]">
                                {transform.name}
                              </span>
                              {/* Was a bare coloured dot with a title attribute —
                                  invisible to keyboard and screen-reader users. */}
                              <span
                                className={`rounded px-1 text-2xs uppercase ${SAFETY_TEXT_CLASSES[transform.safety]}`}
                                title={SAFETY_LABELS[transform.safety]}
                              >
                                {transform.safety}
                              </span>
                            </span>
                            <span className="block text-[var(--color-text-muted)]">
                              {transform.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )
                })
              )}
            </div>
          </section>
        )}

        <section
          aria-label={showDiff ? 'Transform preview' : 'Source'}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {showDiff && preview ? (
            <DiffEditor
              // Monaco's setTheme is global and DiffEditor defaults to "light":
              // omitting this flips the whole editor to light on every preview.
              theme={monacoTheme}
              original={preview.source}
              modified={preview.output}
              language={language}
              options={diffOptions}
            />
          ) : (
            <Editor
              theme={monacoTheme}
              language={language}
              value={input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={monacoOptions}
            />
          )}
          {!hasCode && (
            // Click-through so the hint never stands between user and caret;
            // only the button itself takes pointer events.
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[var(--color-text-muted)]">
              <ArrowsClockwiseIcon size={32} weight="light" aria-hidden="true" />
              <p className="text-sm text-[var(--color-text)]">Paste JavaScript or TypeScript</p>
              <p className="max-w-xs text-xs">
                Pick transforms on the {state.panelOpen ? 'left' : 'Transforms panel'} and preview
                the rewrite as a diff before applying it.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  updateState({
                    input: REFACTORING_SAMPLE,
                    fileName: null,
                    filePath: null,
                    lastApply: null,
                    applyHistory: [],
                    customFind: '',
                    customReplace: '',
                  })
                }
                className="pointer-events-auto"
              >
                Load sample
              </Button>
            </div>
          )}
        </section>
      </div>
    </ToolLayout>
  )
}
