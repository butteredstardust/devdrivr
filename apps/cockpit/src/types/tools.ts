import type { LazyExoticComponent, ComponentType, ReactElement } from 'react'

export type ToolGroup = 'code' | 'data' | 'web' | 'convert' | 'test' | 'network' | 'write'

export type ToolDefinition = {
  id: string
  name: string
  group: ToolGroup
  icon: ReactElement
  description: string
  component: LazyExoticComponent<ComponentType>
}

export type ToolGroupMeta = {
  id: ToolGroup
  label: string
  icon: ReactElement
}

export type WorkspaceTab = {
  id: string      // crypto.randomUUID() — unique tab instance
  toolId: string  // references ToolDefinition.id
}
