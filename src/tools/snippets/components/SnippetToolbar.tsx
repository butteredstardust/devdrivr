import {
  ArrowRightIcon,
  BroomIcon,
  ClipboardTextIcon,
  CopyIcon,
  DownloadSimpleIcon,
  EyeIcon,
  SidebarIcon,
  StarIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { InlineInput } from '@/components/shared/InlineInput'
import { Select } from '@/components/shared/Input'
import { DocumentToolbar, ToolbarGroup, TwoLineDocumentIdentity } from '@/components/shared/Toolbar'
import { formatShortcut } from '@/lib/shortcut-label'
import { sendToTool } from '@/lib/tool-handoff'
import { useSnippetsStore } from '@/stores/snippets.store'
import type { Snippet, SnippetFragment } from '@/types/models'
import type { previewKindFor } from '@/tools/snippets/snippet-preview'
import { isFavorite, LANGUAGES, relativeTime } from '@/tools/snippets/snippet-model'

type SnippetToolbarProps = {
  selected: Snippet
  activeFragment: SnippetFragment | null
  titleInputRef: (element: HTMLInputElement | null) => void
  backlinkNoteId: string | null
  canFormat: boolean
  formatting: boolean
  formatDisabledReason: string
  previewKind: ReturnType<typeof previewKindFor>
  previewOpen: boolean
  detailsOpen: boolean
  onLanguageChange: (language: string) => void
  onToggleFavorite: () => void
  onFormat: () => void
  onPreview: () => void
  onCopy: () => void
  onSendToPromptTemplate: () => void
  onDuplicate: () => void
  onDownload: () => void
  onToggleDetails: () => void
  onRequestDelete: () => void
}

export function SnippetToolbar({
  selected,
  activeFragment,
  titleInputRef,
  backlinkNoteId,
  canFormat,
  formatting,
  formatDisabledReason,
  previewKind,
  previewOpen,
  detailsOpen,
  onLanguageChange,
  onToggleFavorite,
  onFormat,
  onPreview,
  onCopy,
  onSendToPromptTemplate,
  onDuplicate,
  onDownload,
  onToggleDetails,
  onRequestDelete,
}: SnippetToolbarProps) {
  const saving = useSnippetsStore((state) => state.saving)
  const updateSnippet = useSnippetsStore((state) => state.update)
  const favorite = isFavorite(selected.tags, selected.favorite)
  const previewDisabledReason = previewKind
    ? `Preview fragment (${formatShortcut('mod+shift+enter')})`
    : 'Preview supports JSON or snippets containing an HTML fragment'

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <DocumentToolbar aria-label="Snippet actions">
        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={onToggleFavorite}
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={favorite ? 'text-[var(--color-warning)]' : ''}
        >
          <StarIcon size={16} weight={favorite ? 'fill' : 'regular'} aria-hidden="true" />
        </Button>
        <TwoLineDocumentIdentity
          title={
            <InlineInput
              ref={titleInputRef}
              value={selected.title}
              onChange={(event) => void updateSnippet(selected.id, { title: event.target.value })}
              placeholder="Snippet title"
              aria-label="Snippet title"
              className="w-full"
            />
          }
          status={saving ? 'Saving changes…' : `Edited ${relativeTime(selected.updatedAt)}`}
          statusTitle={saving ? 'Saving changes…' : `Edited ${relativeTime(selected.updatedAt)}`}
          statusLive
        />
        <ToolbarGroup label="Snippet editing">
          {backlinkNoteId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                sendToTool('notes', {
                  selectedId: backlinkNoteId,
                  selectedFolderId: null,
                  taskView: 'notes',
                })
              }
            >
              Back to note
            </Button>
          )}
          <Select
            value={activeFragment?.language ?? 'text'}
            onChange={(event) => onLanguageChange(event.target.value)}
            aria-label="Snippet language"
            title="Snippet language"
            className="w-32"
            disabled={!activeFragment}
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onFormat}
            disabled={!canFormat || formatting}
            title={formatDisabledReason}
            aria-label={formatting ? 'Formatting snippet fragment' : 'Format snippet fragment'}
          >
            <BroomIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Format</span>
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onPreview}
            disabled={!previewKind}
            title={previewDisabledReason}
            aria-label={
              previewKind === 'json' ? 'Preview JSON fragment' : 'Preview HTML and CSS fragments'
            }
            aria-pressed={previewKind === 'web' ? previewOpen : undefined}
          >
            <EyeIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Preview</span>
          </Button>
        </ToolbarGroup>
        <ToolbarGroup label="Snippet sharing" separated>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onCopy}
            title="Copy snippet"
            aria-label="Copy snippet"
          >
            <ClipboardTextIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Copy snippet</span>
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onSendToPromptTemplate}
            title="Send snippet to Prompt Templates"
            aria-label="Send snippet to Prompt Templates"
          >
            <ArrowRightIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">
              Send to Prompt Templates
            </span>
          </Button>
        </ToolbarGroup>
        <ToolbarGroup label="Snippet management" separated>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onDuplicate}
            title={`Duplicate snippet (${formatShortcut('mod+shift+d')})`}
            aria-label="Duplicate snippet"
          >
            <CopyIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Duplicate snippet</span>
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onDownload}
            title="Save snippet as file"
            aria-label="Save snippet as file"
          >
            <DownloadSimpleIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Save as file</span>
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onToggleDetails}
            title={detailsOpen ? 'Hide details' : 'Show details'}
            aria-label={detailsOpen ? 'Hide snippet details' : 'Show snippet details'}
            aria-expanded={detailsOpen}
            className={detailsOpen ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''}
          >
            <SidebarIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">
              {detailsOpen ? 'Hide details' : 'Show details'}
            </span>
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={onRequestDelete}
            title="Move snippet to Trash"
            aria-label="Move snippet to Trash"
            className="hover:text-[var(--color-error)]"
          >
            <TrashIcon size={14} aria-hidden="true" />
            <span className="hidden [[data-toolbar-overflow]_&]:inline">Move to Trash</span>
          </Button>
        </ToolbarGroup>
      </DocumentToolbar>
    </header>
  )
}
