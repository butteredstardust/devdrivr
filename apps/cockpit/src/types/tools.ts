import type { LazyExoticComponent, ComponentType, ReactElement } from 'react'

export type ToolGroup = 'code' | 'data' | 'web' | 'convert' | 'test' | 'network' | 'write'

export type ToolDefinition = {
  id: string
  name: string
  group: ToolGroup
  icon: ReactElement
  description: string
  component: LazyExoticComponent<ComponentType>
  // Optional capability flags. Left `undefined` (falsy) rather than requiring every
  // entry to spell out `false` — most tools support none of these, so the noise of
  // 30 entries each carrying three `false`s would outweigh the benefit of an
  // exhaustive Record. Only tools that actually need a flag set it to `true`.
  /** Can receive file content via the global "open file" shortcut / file drop. */
  supportsOpenFile?: boolean
  /** Can receive the global "save file" shortcut. */
  supportsSaveFile?: boolean
  /** Renders inside a Monaco editor, which needs the workspace's overflow mode. */
  usesMonaco?: boolean
}

export type ToolGroupMeta = {
  id: ToolGroup
  label: string
  icon: ReactElement
}

export type WorkspaceTab = {
  id: string // crypto.randomUUID() — unique tab instance
  toolId: string // references ToolDefinition.id
  /**
   * The `tool_state` row this tab reads and writes. The first open tab of a
   * tool takes the bare tool id, so state saved before tabs could be
   * duplicated is still the state that tab sees; further tabs of the same
   * tool get `${toolId}#${id}`. Optional on the type because tabs persisted
   * before this existed have no key — `stateKeyFor` assigns one on restore.
   */
  stateKey?: string
}
