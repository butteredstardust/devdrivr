import { Fragment, type Dispatch, type SetStateAction } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  DownloadSimpleIcon,
  FileMdIcon,
  FilesIcon,
  MagnifyingGlassIcon,
  SwapIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { Popover } from '@/components/shared/Popover'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { formatShortcut } from '@/lib/shortcut-label'
import { TEMPLATES } from '@/tools/markdown-editor/document-templates'
import { FORMATTING_ACTIONS } from '@/tools/markdown-editor/formatting-actions'
import {
  MODE_OPTIONS,
  type ActiveMarkdownModal,
  type EditorMode,
  type MarkdownEditorState,
  type UpdateMarkdownEditorState,
} from '@/tools/markdown-editor/markdown-model'

type MarkdownToolbarProps = {
  state: MarkdownEditorState
  updateState: UpdateMarkdownEditorState
  isDirty: boolean
  syncPreviewWithEditor: boolean
  syncEditorWithPreview: boolean
  tocLength: number
  showTemplates: boolean
  setShowTemplates: Dispatch<SetStateAction<boolean>>
  showExport: boolean
  setShowExport: Dispatch<SetStateAction<boolean>>
  handleNewDocument: () => void
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleModeChange: (mode: EditorMode) => void
  openFind: (replace: boolean) => void
  handleTemplateSelect: (content: string) => void
  copy: CopyToClipboard
  handleCopyHtml: () => Promise<void>
  handleDownload: (format: 'md' | 'html') => Promise<void>
  handleExportPdf: () => Promise<void>
  showEditor: boolean
  setActiveModal: Dispatch<SetStateAction<ActiveMarkdownModal>>
  insertFormatting: (
    prefix: string,
    suffix: string,
    placeholder: string,
    lineStart?: boolean
  ) => void
}

export function MarkdownToolbar({
  state,
  updateState,
  isDirty,
  syncPreviewWithEditor,
  syncEditorWithPreview,
  tocLength,
  showTemplates,
  setShowTemplates,
  showExport,
  setShowExport,
  handleNewDocument,
  handleOpen,
  handleSave,
  handleSaveAs,
  handleModeChange,
  openFind,
  handleTemplateSelect,
  copy,
  handleCopyHtml,
  handleDownload,
  handleExportPdf,
  showEditor,
  setActiveModal,
  insertFormatting,
}: MarkdownToolbarProps) {
  return (
    <>
      {/* No seam: nothing stacks under the toolbar inside this header, so a border here would be
          the single-row divider the toolbar primitive dropped, just re-expressed on the wrapper. */}
      <header className="bg-[var(--color-surface)]">
        <DocumentToolbar aria-label="Markdown document actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled document'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled document'}
            titleTestId="file-name"
            stateLabel={isDirty ? 'Modified' : 'Saved'}
            stateChanged={isDirty}
            status={state.filePath ?? 'Local markdown workspace'}
            // The path is context, not a result — announcing it on every open
            // would talk over the Modified/Saved indicator that matters.
            statusLive={false}
            icon={
              <FileMdIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
          />

          <DocumentFileActions
            newDocument={{ label: 'New markdown document', onClick: handleNewDocument }}
            open={{
              label: 'Open markdown file',
              title: `Open a markdown file (${formatShortcut('mod+o')})`,
              onClick: () => void handleOpen(),
            }}
            save={{
              label: 'Save markdown document',
              title: `Save the document (${formatShortcut('mod+s')})`,
              onClick: () => void handleSave(),
            }}
            saveAs={{ label: 'Save markdown document as', onClick: () => void handleSaveAs() }}
          />

          <ToolbarGroup label="View options" separated>
            <SegmentedControl
              aria-label="Editor view mode"
              options={MODE_OPTIONS}
              value={state.mode as EditorMode}
              onChange={handleModeChange}
            />

            {state.mode === 'split' && (
              <div className="flex items-center" role="group" aria-label="Scroll synchronization">
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() =>
                    updateState({
                      scrollSyncDirections: {
                        editorToPreview: !syncPreviewWithEditor,
                        previewToEditor: syncEditorWithPreview,
                      },
                    })
                  }
                  title={
                    syncPreviewWithEditor
                      ? 'Stop syncing preview with editor'
                      : 'Sync preview with editor'
                  }
                  aria-label={
                    syncPreviewWithEditor
                      ? 'Stop syncing preview with editor'
                      : 'Sync preview with editor'
                  }
                  aria-pressed={syncPreviewWithEditor}
                  className={syncPreviewWithEditor ? 'text-[var(--color-accent)]' : ''}
                >
                  <ArrowRightIcon
                    size={14}
                    weight={syncPreviewWithEditor ? 'bold' : 'regular'}
                    aria-hidden="true"
                  />
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() =>
                    updateState({
                      scrollSyncDirections: {
                        editorToPreview: syncPreviewWithEditor,
                        previewToEditor: !syncEditorWithPreview,
                      },
                    })
                  }
                  title={
                    syncEditorWithPreview
                      ? 'Stop syncing editor with preview'
                      : 'Sync editor with preview'
                  }
                  aria-label={
                    syncEditorWithPreview
                      ? 'Stop syncing editor with preview'
                      : 'Sync editor with preview'
                  }
                  aria-pressed={syncEditorWithPreview}
                  className={syncEditorWithPreview ? 'text-[var(--color-accent)]' : ''}
                >
                  <ArrowLeftIcon
                    size={14}
                    weight={syncEditorWithPreview ? 'bold' : 'regular'}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            )}

            {tocLength > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateState({ showToc: !state.showToc })}
                className={
                  state.showToc ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                }
                title="Table of contents"
                aria-pressed={state.showToc}
              >
                Contents
              </Button>
            )}
          </ToolbarGroup>

          {/* The find widget existed but had no entry point outside the editor's own keymap, so
              it was invisible unless you already knew it was there. */}
          <ToolbarGroup label="Find" separated>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => openFind(false)}
              title={`Find (${formatShortcut('mod+f')})`}
              aria-label={`Find (${formatShortcut('mod+f')})`}
            >
              <MagnifyingGlassIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => openFind(true)}
              title={`Find and replace (${formatShortcut('mod+h')})`}
              aria-label={`Find and replace (${formatShortcut('mod+h')})`}
            >
              <SwapIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>

          <ToolbarGroup label="Templates" separated>
            <Popover
              open={showTemplates}
              onOpenChange={setShowTemplates}
              label="Templates"
              align="end"
              trigger={(triggerProps) => (
                <Button
                  {...triggerProps}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={
                    showTemplates ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                  }
                >
                  <FilesIcon size={14} aria-hidden="true" />
                  Templates
                </Button>
              )}
            >
              <div className="py-1">
                {TEMPLATES.map((template) => (
                  <Button
                    key={template.label}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTemplateSelect(template.content)}
                    className="w-full justify-start text-left"
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </Popover>
          </ToolbarGroup>

          <ToolbarGroup label="Export" separated>
            <Popover
              open={showExport}
              onOpenChange={setShowExport}
              label="Export"
              align="end"
              trigger={(triggerProps) => (
                <Button
                  {...triggerProps}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`gap-1 ${showExport ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''}`}
                >
                  <DownloadSimpleIcon size={14} aria-hidden="true" />
                  Export <CaretDownIcon size={12} aria-hidden="true" />
                </Button>
              )}
            >
              <div className="py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void copy(state.content, {
                      success: 'Markdown copied to clipboard',
                      failure: 'Failed to copy to clipboard',
                    })
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Copy Markdown
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleCopyHtml()
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Copy HTML
                </Button>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleDownload('md')
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Download .md
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleDownload('html')
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Download .html
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleExportPdf()
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Print / PDF
                </Button>
              </div>
            </Popover>
          </ToolbarGroup>
        </DocumentToolbar>
      </header>

      {/* ─── Formatting Toolbar ─────────────────────────────────── */}
      {showEditor && (
        <div
          role="toolbar"
          aria-label="Markdown formatting"
          className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--color-border)] px-2 py-1"
        >
          {FORMATTING_ACTIONS.map((action, i) => {
            const prev = FORMATTING_ACTIONS[i - 1]
            const showSep = i > 0 && prev !== undefined && action.group !== prev.group
            const Icon = action.icon
            return (
              <Fragment key={action.title}>
                {showSep && (
                  <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--color-border)]" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if ('modal' in action && action.modal) {
                      setActiveModal(action.modal)
                    } else {
                      insertFormatting(
                        action.prefix,
                        action.suffix,
                        action.placeholder,
                        action.line
                      )
                    }
                  }}
                  title={action.title}
                  aria-label={action.title}
                  className="hover:text-[var(--color-text)]"
                >
                  {Icon ? <Icon size={12} aria-hidden="true" /> : action.label}
                </Button>
              </Fragment>
            )
          })}
        </div>
      )}
    </>
  )
}
