import type { LazyExoticComponent, ComponentType } from 'react'

export type ToolGroup = 'code' | 'data' | 'web' | 'convert' | 'test' | 'network' | 'write'

export type ToolDefinition = {
  id: string
  name: string
  group: ToolGroup
  icon: string
  description: string
  component: LazyExoticComponent<ComponentType>
}

export type ToolGroupMeta = {
  id: ToolGroup
  label: string
  icon: string
}

export const TOOL_GROUPS: ToolGroupMeta[] = [
  { id: 'code', label: 'Code', icon: '</>' },
  { id: 'data', label: 'Data', icon: '{}' },
  { id: 'web', label: 'Web', icon: '◈' },
  { id: 'convert', label: 'Convert', icon: '⇄' },
  { id: 'test', label: 'Test', icon: '✓' },
  { id: 'network', label: 'Network', icon: '↗' },
  { id: 'write', label: 'Write', icon: '✎' },
]
