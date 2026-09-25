import {
  BroomIcon,
  CheckCircleIcon,
  FileHtmlIcon,
  FilesIcon,
  WarningCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { Kbd } from '@/components/shared/Kbd'
import { Select } from '@/components/shared/Input'
import { SegmentedControl, type SegmentedControlOption } from '@/components/shared/SegmentedControl'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { formatShortcut } from '@/lib/shortcut-label'
import { RulesPopover } from '@/tools/html-validator/components/RulesPopover'
import { TEMPLATES, type RuleConfig } from '@/tools/html-validator/html-helpers'
import type {
  HtmlValidatorState,
  UpdateHtmlValidatorState,
  ViewMode,
} from '@/tools/html-validator/html-validator-types'

const VIEW_OPTIONS: SegmentedControlOption<ViewMode>[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

type HtmlToolbarProps = {
  state: HtmlValidatorState
  updateState: UpdateHtmlValidatorState
  viewMode: ViewMode
  isDirty: boolean
  status: string
  hasInput: boolean
  hasValidated: boolean
  issuesLength: number
  errorCount: number
  warningCount: number
  isFormatting: boolean
  input: string
  rulesOpen: boolean
  onRulesOpenChange: (open: boolean) => void
  overrideCount: number
  onNew: () => void
  onOpen: () => Promise<void>
  onSave: () => Promise<void>
  onSaveAs: () => Promise<void>
  onLoadTemplate: () => void
  onFormat: () => Promise<void>
  onToggleRule: (rule: RuleConfig, next: boolean) => void
  onResetRules: () => void
}

export function HtmlToolbar({
  state,
  updateState,
  viewMode,
  isDirty,
  status,
  hasInput,
  hasValidated,
  issuesLength,
  errorCount,
  warningCount,
  isFormatting,
  input,
  rulesOpen,
  onRulesOpenChange,
  overrideCount,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onLoadTemplate,
  onFormat,
  onToggleRule,
  onResetRules,
}: HtmlToolbarProps) {
  return (
    <DocumentToolbar aria-label="HTML document actions">
      <DocumentIdentity
        title={state.fileName ?? 'Untitled document'}
        titleTooltip={state.filePath ?? state.fileName ?? 'Untitled document'}
        titleTestId="file-name"
        icon={
          <FileHtmlIcon
            size={16}
            aria-hidden="true"
            className="shrink-0 text-[var(--color-text-muted)]"
          />
        }
        stateLabel={isDirty ? 'Modified' : 'Saved'}
        stateChanged={isDirty}
        status={status}
        statusTestId="validation-status"
        statusIcon={
          hasInput && hasValidated && issuesLength === 0 ? (
            <CheckCircleIcon
              size={12}
              aria-hidden="true"
              className="shrink-0 text-[var(--color-success)]"
            />
          ) : errorCount > 0 ? (
            <WarningCircleIcon
              size={12}
              aria-hidden="true"
              className="shrink-0 text-[var(--color-error)]"
            />
          ) : errorCount === 0 && warningCount > 0 ? (
            <WarningIcon
              size={12}
              aria-hidden="true"
              className="shrink-0 text-[var(--color-warning)]"
            />
          ) : undefined
        }
      />

      <DocumentFileActions
        newDocument={{ label: 'New HTML document', onClick: onNew }}
        open={{
          label: 'Open HTML file',
          title: `Open an .html file (${formatShortcut('mod+o')})`,
          onClick: () => void onOpen(),
        }}
        save={{
          label: 'Save HTML document',
          title: `Save the document (${formatShortcut('mod+s')})`,
          onClick: () => void onSave(),
          disabled: !hasInput,
        }}
        saveAs={{
          label: 'Save HTML document as',
          title: 'Save the HTML document to a new file',
          onClick: () => void onSaveAs(),
          disabled: !hasInput,
        }}
      />

      <ToolbarGroup label="View controls" separated>
        <SegmentedControl
          aria-label="View mode"
          options={VIEW_OPTIONS}
          value={viewMode}
          onChange={(next) => updateState({ viewMode: next })}
        />
      </ToolbarGroup>

      <ToolbarGroup label="Template actions" separated>
        <Select
          aria-label="Starter template"
          value={state.templateId}
          onChange={(e) => updateState({ templateId: e.target.value })}
        >
          {TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onClick={onLoadTemplate}
          title="Load the selected HTML template"
          className="gap-1"
        >
          <FilesIcon size={14} aria-hidden="true" />
          Load
        </Button>
      </ToolbarGroup>

      <ToolbarGroup label="Markup output" separated>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void onFormat()}
          disabled={!hasInput || isFormatting}
          loading={isFormatting}
          title={`Reformat the markup (${formatShortcut('mod+enter')})`}
        >
          <BroomIcon size={14} aria-hidden="true" />
          Format
          <Kbd keys="mod+enter" variant="inline" className="ml-1" />
        </Button>
        <CopyButton text={input} label="Copy HTML" />
      </ToolbarGroup>

      <RulesPopover
        open={rulesOpen}
        onOpenChange={onRulesOpenChange}
        overrideCount={overrideCount}
        disabledRules={state.disabledRules}
        enabledRules={state.enabledRules}
        onToggleRule={onToggleRule}
        onResetRules={onResetRules}
      />
    </DocumentToolbar>
  )
}
