import {
  BroomIcon,
  CheckCircleIcon,
  FileCssIcon,
  FilesIcon,
  WarningCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { Select } from '@/components/shared/Input'
import { Kbd } from '@/components/shared/Kbd'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { formatShortcut } from '@/lib/shortcut-label'
import { TEMPLATES, type RuleConfig } from '@/tools/css-validator/css-helpers'
import {
  type CssValidatorState,
  type UpdateCssValidatorState,
} from '@/tools/css-validator/css-validator-types'
import { RulesPopover } from '@/tools/css-validator/components/RulesPopover'

export function CssValidatorToolbar({
  state,
  updateState,
  input,
  hasInput,
  isDirty,
  isFormatting,
  formatterAvailable,
  status,
  hasAnalyzed,
  issueCount,
  errorCount,
  warningCount,
  rulesOpen,
  onRulesOpenChange,
  overrideCount,
  onToggleRule,
  onResetRules,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onLoadTemplate,
  onFormat,
}: {
  state: CssValidatorState
  updateState: UpdateCssValidatorState
  input: string
  hasInput: boolean
  isDirty: boolean
  isFormatting: boolean
  formatterAvailable: boolean
  status: string
  hasAnalyzed: boolean
  issueCount: number
  errorCount: number
  warningCount: number
  rulesOpen: boolean
  onRulesOpenChange: (open: boolean) => void
  overrideCount: number
  onToggleRule: (rule: RuleConfig, next: boolean) => void
  onResetRules: () => void
  onNew: () => void
  onOpen: () => Promise<void>
  onSave: () => Promise<void>
  onSaveAs: () => Promise<void>
  onLoadTemplate: () => void
  onFormat: () => Promise<void>
}) {
  return (
    <DocumentToolbar aria-label="Stylesheet actions">
      <DocumentIdentity
        title={state.fileName ?? 'Untitled stylesheet'}
        titleTooltip={state.filePath ?? state.fileName ?? 'Untitled stylesheet'}
        titleTestId="file-name"
        icon={
          <FileCssIcon
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
          hasInput && hasAnalyzed && issueCount === 0 ? (
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
        newDocument={{ label: 'New stylesheet', onClick: onNew }}
        open={{
          label: 'Open CSS file',
          title: `Open a .css file (${formatShortcut('mod+o')})`,
          onClick: () => void onOpen(),
        }}
        save={{
          label: 'Save stylesheet',
          title: `Save the stylesheet (${formatShortcut('mod+s')})`,
          onClick: () => void onSave(),
          disabled: !hasInput,
        }}
        saveAs={{
          label: 'Save stylesheet as',
          title: 'Save the stylesheet to a new file',
          onClick: () => void onSaveAs(),
          disabled: !hasInput,
        }}
      />

      <ToolbarGroup label="Input options" separated>
        <Select
          aria-label="Stylesheet syntax"
          value={state.syntax}
          onChange={(event) =>
            updateState({ syntax: event.target.value as CssValidatorState['syntax'] })
          }
        >
          <option value="css">CSS</option>
          <option value="scss">SCSS</option>
          <option value="less">Less</option>
        </Select>
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
          title="Load the selected stylesheet template"
          className="gap-1"
        >
          <FilesIcon size={14} aria-hidden="true" />
          Load
        </Button>
      </ToolbarGroup>

      <ToolbarGroup label="Stylesheet output" separated>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void onFormat()}
          disabled={!hasInput || isFormatting || !formatterAvailable}
          loading={isFormatting}
          title={`Reformat the stylesheet (${formatShortcut('mod+enter')})`}
        >
          <BroomIcon size={14} aria-hidden="true" />
          Format
          <Kbd keys="mod+enter" variant="inline" className="ml-1" />
        </Button>
        <CopyButton text={input} label="Copy CSS" />
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
