import {
  ChatCircleTextIcon,
  ClipboardTextIcon,
  CopyIcon,
  PencilSimpleIcon,
  SparkleIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TabBar } from '@/components/shared/TabBar'
import { DocumentToolbar, ToolbarGroup, TwoLineDocumentIdentity } from '@/components/shared/Toolbar'
import { PreviewPane, VariableForm } from '@/tools/prompt-templates/components/PromptTemplateFields'
import type { usePromptTemplateFill } from '@/tools/prompt-templates/hooks/usePromptTemplateFill'
import type { usePromptTemplateLibrary } from '@/tools/prompt-templates/hooks/usePromptTemplateLibrary'
import type { PromptTemplatesState } from '@/tools/prompt-templates/prompt-templates-model'

type PromptTemplateWorkspaceProps = {
  state: PromptTemplatesState
  library: ReturnType<typeof usePromptTemplateLibrary>
  fill: ReturnType<typeof usePromptTemplateFill>
}

export function PromptTemplateWorkspace({ state, library, fill }: PromptTemplateWorkspaceProps) {
  const {
    savingTemplates,
    setEditorState,
    setConfirmDeleteId,
    workspaceTab,
    setWorkspaceTab,
    selectedTemplate,
    resetSelectedOverride,
  } = library
  const {
    setModalOpen,
    selectedValues,
    renderedPrompt,
    tokens,
    missingVariables,
    updateVariable,
    clearVariables,
    copyRenderedPrompt,
    sendRenderedToSnippet,
  } = fill

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <DocumentToolbar aria-label="Prompt template actions">
          <TwoLineDocumentIdentity
            title={selectedTemplate.name}
            badge={
              <StatusBadge variant="info" className="uppercase">
                {selectedTemplate.author === 'user' ? 'Custom' : 'Built-in'}
              </StatusBadge>
            }
            status={selectedTemplate.description}
            statusTitle={selectedTemplate.description}
            statusClassName="mt-0.5"
          />
          <ToolbarGroup label="Template fields">
            <Button type="button" variant="ghost" size="sm" onClick={clearVariables}>
              Clear fields
            </Button>
          </ToolbarGroup>
          <ToolbarGroup label="Template actions" separated>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => setEditorState({ mode: 'duplicate', template: selectedTemplate })}
              title="Duplicate template"
              aria-label="Duplicate template"
            >
              <CopyIcon size={14} aria-hidden="true" />
              <span className="hidden [[data-toolbar-overflow]_&]:inline">Duplicate template</span>
            </Button>
            {selectedTemplate.author === 'builtin' && state.overrides[selectedTemplate.id] && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetSelectedOverride}
                title="Reset this built-in template"
              >
                Reset
              </Button>
            )}
            {selectedTemplate.author === 'builtin' ? (
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={() => setEditorState({ mode: 'edit', template: selectedTemplate })}
                title="Customize built-in template"
                aria-label="Customize built-in template"
              >
                <PencilSimpleIcon size={14} aria-hidden="true" />
                <span className="hidden [[data-toolbar-overflow]_&]:inline">
                  Customize template
                </span>
              </Button>
            ) : null}
            {selectedTemplate.author === 'user' && (
              <>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setEditorState({ mode: 'edit', template: selectedTemplate })}
                  title="Edit template"
                  aria-label="Edit template"
                >
                  <PencilSimpleIcon size={14} aria-hidden="true" />
                  <span className="hidden [[data-toolbar-overflow]_&]:inline">Edit template</span>
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setConfirmDeleteId(selectedTemplate.id)}
                  title="Delete template"
                  aria-label="Delete template"
                  className="hover:text-[var(--color-error)]"
                >
                  <TrashIcon size={14} aria-hidden="true" />
                  <span className="hidden [[data-toolbar-overflow]_&]:inline">Delete template</span>
                </Button>
              </>
            )}
          </ToolbarGroup>
          <ToolbarGroup label="Prompt actions" separated>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-1.5"
            >
              <SparkleIcon size={14} aria-hidden="true" /> Focus mode
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void copyRenderedPrompt()}
              className="gap-1.5"
            >
              <ClipboardTextIcon size={14} aria-hidden="true" /> Copy prompt
            </Button>
          </ToolbarGroup>
          <ToolbarGroup label="Prompt handoff" separated>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={sendRenderedToSnippet}
              className="gap-1.5"
            >
              <ChatCircleTextIcon size={14} aria-hidden="true" /> Send to snippet
            </Button>
          </ToolbarGroup>
        </DocumentToolbar>
        <div className="flex items-center border-t border-[var(--color-border)] pr-4">
          <TabBar
            noBorder
            aria-label="Template workspace"
            activeTab={workspaceTab}
            onTabChange={(tab) => setWorkspaceTab(tab as 'fill' | 'preview')}
            tabs={[
              { id: 'fill', label: `Fill variables (${selectedTemplate.variables.length})` },
              { id: 'preview', label: `Preview (~${tokens} · chars/4)` },
            ]}
          />
          <span className="ml-auto text-2xs text-[var(--color-text-muted)]" aria-live="polite">
            {savingTemplates
              ? 'Saving template…'
              : `Optimized for ${selectedTemplate.optimizedFor}`}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {workspaceTab === 'fill' ? (
          <div className="mx-auto max-w-3xl p-5 max-[1000px]:p-4">
            <div className="mb-5 flex flex-wrap gap-1.5">
              {selectedTemplate.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--color-accent-dim)] px-2 py-1 text-2xs text-[var(--color-accent)]"
                >
                  {tag}
                </span>
              ))}
            </div>
            <VariableForm
              template={selectedTemplate}
              values={selectedValues}
              onChange={updateVariable}
            />
            {selectedTemplate.tips && selectedTemplate.tips.length > 0 && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-text)]">Tip:</span>{' '}
                {selectedTemplate.tips[0]}
              </div>
            )}
          </div>
        ) : (
          <PreviewPane
            renderedPrompt={renderedPrompt}
            tokens={tokens}
            missingVariables={missingVariables}
          />
        )}
      </div>
    </main>
  )
}
