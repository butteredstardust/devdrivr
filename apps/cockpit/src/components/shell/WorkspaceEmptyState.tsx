import { useMemo } from 'react'
import { ToolboxIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components/shared/EmptyState'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import type { ToolDefinition } from '@/types/tools'
import { formatShortcut } from '@/lib/shortcut-label'

function resolveTools(ids: string[]): ToolDefinition[] {
  return ids
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is ToolDefinition => t != null)
}

type ChipRowProps = {
  label: string
  tools: ToolDefinition[]
  onSelect: (toolId: string) => void
}

function ChipRow({ label, tools, onSelect }: ChipRowProps) {
  return (
    <div className="flex flex-col items-center gap-[var(--space-1)]">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap items-center justify-center gap-[var(--space-2)]">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            aria-label={`Open ${tool.name}`}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <span className="flex items-center" aria-hidden="true">
              {tool.icon}
            </span>
            {tool.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Workspace's full-pane empty state — surfaces pinned and recently used tools
 * as clickable chips alongside the ⌘K hint, instead of static grey text. */
export function WorkspaceEmptyState() {
  const pinnedToolIds = useSettingsStore((s) => s.pinnedToolIds)
  const recentToolIds = useUiStore((s) => s.recentToolIds)
  const openTab = useUiStore((s) => s.openTab)

  const pinnedTools = useMemo(() => resolveTools(pinnedToolIds), [pinnedToolIds])
  const recentTools = useMemo(
    () => resolveTools(recentToolIds.filter((id) => !pinnedToolIds.includes(id))),
    [recentToolIds, pinnedToolIds]
  )

  const hasChips = pinnedTools.length > 0 || recentTools.length > 0

  return (
    <EmptyState
      icon={ToolboxIcon}
      title="Select a tool to get started"
      description={`Use the sidebar or press ${formatShortcut('mod+k')}`}
      action={
        hasChips ? (
          <div className="flex flex-col items-center gap-[var(--space-3)]">
            {pinnedTools.length > 0 && (
              <ChipRow label="Pinned" tools={pinnedTools} onSelect={openTab} />
            )}
            {recentTools.length > 0 && (
              <ChipRow label="Recent" tools={recentTools} onSelect={openTab} />
            )}
          </div>
        ) : undefined
      }
    />
  )
}
