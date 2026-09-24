import type { RefObject } from 'react'
import { ChatCircleTextIcon, DownloadSimpleIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { Select } from '@/components/shared/Input'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CATEGORY_LABELS } from '@/tools/prompt-templates/builtin-templates'
import type { usePromptTemplateLibrary } from '@/tools/prompt-templates/hooks/usePromptTemplateLibrary'
import {
  categoryCount,
  FILTERS,
  type CategoryFilter,
  type PromptTemplatesState,
} from '@/tools/prompt-templates/prompt-templates-model'

type PromptTemplateSidebarProps = {
  state: PromptTemplatesState
  updateState: (patch: Partial<PromptTemplatesState>) => void
  searchRef: RefObject<HTMLInputElement | null>
  templateOptionsId: string
  library: ReturnType<typeof usePromptTemplateLibrary>
  onOpenQuickFill: () => void
}

export function PromptTemplateSidebar({
  state,
  updateState,
  searchRef,
  templateOptionsId,
  library,
  onOpenQuickFill,
}: PromptTemplateSidebarProps) {
  const {
    userTemplates,
    handleExport,
    handleImport,
    allTemplates,
    selectedTemplate,
    activeCategory,
    filteredTemplates,
    selectTemplate,
    clearFilters,
    handleListKeyDown,
  } = library

  return (
    <>
      <div className="space-y-2 border-b border-[var(--color-border)] p-3">
        <SearchInput
          ref={searchRef}
          value={state.search}
          onValueChange={(search) => updateState({ search })}
          placeholder="Search templates"
          aria-label="Search prompt templates"
          clearLabel="Clear template search"
        />
        <Select
          value={activeCategory}
          onChange={(event) => updateState({ category: event.target.value as CategoryFilter })}
          aria-label="Filter templates by category"
          className="w-full"
        >
          {FILTERS.map((filter) => (
            <option key={filter.id} value={filter.id}>
              {filter.label} ({categoryCount(filter.id, allTemplates)})
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
        <span>
          {filteredTemplates.length === allTemplates.length
            ? 'Library'
            : `${filteredTemplates.length} results`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={() => void handleImport()}
            title="Import templates from JSON"
            aria-label="Import templates from JSON"
          >
            <UploadSimpleIcon size={12} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={() => void handleExport()}
            title="Export custom templates as JSON"
            aria-label="Export custom templates as JSON"
            disabled={userTemplates.length === 0}
          >
            <DownloadSimpleIcon size={12} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        role="listbox"
        aria-label="Prompt templates"
      >
        {filteredTemplates.map((template, index) => {
          const selected = template.id === selectedTemplate.id
          return (
            <Button
              key={template.id}
              id={`${templateOptionsId}-option-${template.id}`}
              type="button"
              variant="ghost"
              size="xs"
              role="option"
              aria-selected={selected}
              tabIndex={
                selected ||
                (!filteredTemplates.some((item) => item.id === selectedTemplate.id) && index === 0)
                  ? 0
                  : -1
              }
              onClick={() => selectTemplate(template)}
              onKeyDown={(event) => handleListKeyDown(event, template.id)}
              onDoubleClick={() => {
                selectTemplate(template)
                onOpenQuickFill()
              }}
              className={`flex w-full justify-start rounded-none border-b border-[var(--color-border)] px-3 py-2.5 text-left ${selected ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
            >
              <span className="w-full min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text)]">
                    {template.name}
                  </span>
                  {template.author === 'user' && (
                    <StatusBadge variant="info" className="shrink-0 uppercase">
                      Custom
                    </StatusBadge>
                  )}
                </span>
                <span className="mt-1 block line-clamp-2 text-2xs leading-4 text-[var(--color-text-muted)]">
                  {template.description}
                </span>
                <span className="mt-1.5 block text-2xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  {CATEGORY_LABELS[template.category]} · {template.optimizedFor}
                </span>
              </span>
            </Button>
          )
        })}
        {filteredTemplates.length === 0 && (
          <EmptyState
            icon={ChatCircleTextIcon}
            size="sm"
            title="No matching templates"
            description="Try a different search or category."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )}
      </div>
    </>
  )
}
