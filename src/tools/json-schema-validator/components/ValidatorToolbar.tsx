import {
  ArrowUUpLeftIcon,
  ArticleIcon,
  CrosshairSimpleIcon,
  FilesIcon,
  MagicWandIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { Select } from '@/components/shared/Input'
import { DocumentToolbar } from '@/components/shared/Toolbar'
import { formatShortcut } from '@/lib/shortcut-label'
import { StatusIcon } from '@/tools/json-schema-validator/components/SchemaSummary'
import {
  type JsonLocation,
  type JsonSchemaState,
  type Pane,
  type ValidationReport,
} from '@/tools/json-schema-validator/json-schema-helpers'
import { TEMPLATES } from '@/tools/json-schema-validator/templates'

type ValidatorToolbarProps = {
  report: ValidationReport
  headline: string
  detail: string
  schemaDialect: string
  errorLocation: { pane: Pane; at: JsonLocation } | null
  goTo: (pane: Pane, location: JsonLocation) => void
  handleOpen: () => Promise<void>
  templateKey: string
  setTemplateKey: (key: string) => void
  loadTemplate: (key: string) => void
  handleInferSchema: () => void
  handleGenerateSample: () => void
  strict: boolean
  updateState: (patch: Partial<JsonSchemaState>) => void
  undoBuffer: { data: string; schema: string; label: string } | null
  handleUndo: () => void
}

export function ValidatorToolbar({
  report,
  headline,
  detail,
  schemaDialect,
  errorLocation,
  goTo,
  handleOpen,
  templateKey,
  setTemplateKey,
  loadTemplate,
  handleInferSchema,
  handleGenerateSample,
  strict,
  updateState,
  undoBuffer,
  handleUndo,
}: ValidatorToolbarProps) {
  return (
    <DocumentToolbar aria-label="Schema validation actions">
      {/* Not a ToolbarGroup: the group's `shrink-0` would stop `detail` from
          truncating, and truncation is what keeps a broken document's parse
          message from pushing the actions off the row. */}
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon status={report.status} />
        <span
          role="status"
          aria-live="polite"
          className="shrink-0 text-xs text-[var(--color-text)]"
        >
          {headline}
        </span>
        {detail && (
          // Outside the live region on purpose: this is the part that
          // changes character by character while a document is broken.
          <span className="min-w-0 truncate text-xs text-[var(--color-text-muted)]">{detail}</span>
        )}
        <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
          Schema {schemaDialect}
        </span>
        {errorLocation && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => goTo(errorLocation.pane, errorLocation.at)}
            title="Move the cursor to the parse error"
            className="shrink-0 gap-1"
          >
            <CrosshairSimpleIcon size={12} aria-hidden="true" />
            Go to error
          </Button>
        )}
      </div>

      <DocumentFileActions
        open={{
          label: 'Open JSON data or schema',
          title: `Open JSON data or schema (${formatShortcut('mod+o')})`,
          onClick: () => void handleOpen(),
        }}
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          aria-label="Template"
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          // The hints live on the options' titles: spelled out in the
          // labels they stretched the closed select across the toolbar.
          className="w-40"
        >
          {Object.entries(TEMPLATES).map(([key, template]) => (
            <option key={key} value={key} title={template.hint}>
              {template.label}
            </option>
          ))}
        </Select>
        {/* Loading straight from the select's change event destroyed both
            buffers as soon as the keyboard moved through the list, since
            WebKit fires `change` per arrow key on a closed select. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => loadTemplate(templateKey)}
          title="Replace both panes with this template and its sample"
        >
          <FilesIcon size={14} aria-hidden="true" />
          Load template
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleInferSchema}
          className="gap-1"
          title="Replace the schema with one inferred from the data"
        >
          <MagicWandIcon size={14} aria-hidden="true" />
          Infer schema
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateSample}
          title="Replace the data with a sample the schema accepts"
          className="gap-1"
        >
          <ArticleIcon size={14} aria-hidden="true" />
          Sample data
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={strict}
          onClick={() => updateState({ strict: !strict })}
          title="Strict mode reports schema authoring mistakes instead of ignoring them"
          className={
            strict ? 'border-[var(--color-warning)] text-[var(--color-warning)]' : undefined
          }
        >
          <ShieldCheckIcon size={14} aria-hidden="true" />
          Strict
        </Button>
        {undoBuffer && (
          <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1">
            <ArrowUUpLeftIcon size={14} aria-hidden="true" />
            Undo {undoBuffer.label.toLowerCase()}
          </Button>
        )}
      </div>
    </DocumentToolbar>
  )
}
