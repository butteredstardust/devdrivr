import type { IFuseOptions } from 'fuse.js'
import { TOOL_GROUPS } from '@/app/tool-groups'
import type { ToolDefinition } from '@/types/tools'

/**
 * Single source of truth for "which group does this id belong to, in plain
 * English" — used by both the command palette and the sidebar filter so
 * search results and section headers agree on group labels.
 */
export const GROUP_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_GROUPS.map((g) => [g.id, g.label])
)

/**
 * Extra terms a tool should match on beyond its own name/description —
 * its id, a space-separated version of the id (so "json-tools" also matches
 * "json tools"), and both the raw and human-readable group.
 */
export function searchTermsForTool(tool: Pick<ToolDefinition, 'id' | 'group'>): string[] {
  const groupLabel = GROUP_LABELS[tool.group] ?? tool.group
  return [tool.id, tool.id.replaceAll('-', ' '), tool.group, groupLabel]
}

/** Fuse.js options for searching ToolDefinition[] directly — used by the sidebar filter. */
export const TOOL_FUSE_OPTIONS: IFuseOptions<ToolDefinition> = {
  keys: ['name', 'description', { name: 'searchTerms', getFn: (tool) => searchTermsForTool(tool) }],
  threshold: 0.4,
}

/** Fallback substring-match fields — mirrors TOOL_FUSE_OPTIONS' keys. */
export function toolSearchable(tool: ToolDefinition): Array<string | null | undefined> {
  return [tool.name, tool.description, ...searchTermsForTool(tool)]
}
