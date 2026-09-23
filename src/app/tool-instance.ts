import { createContext, useContext } from 'react'

/**
 * Identifies the tab a tool is rendered inside.
 *
 * Inactive tabs stay mounted so their editors, scroll positions and in-flight
 * work survive a switch. Several tools therefore listen to the shell at once.
 * Shell actions and keyboard shortcuts must consult `isActive`.
 */
export type ToolInstance = {
  tabId: string
  toolId: string
  /** The `tool_state` row this instance reads and writes. */
  stateKey: string
  isActive: boolean
}

export const ToolInstanceContext = createContext<ToolInstance | null>(null)

export function useToolInstance(): ToolInstance | null {
  return useContext(ToolInstanceContext)
}

/**
 * True for shell components, which live outside any tab and are always live.
 * Only a tool in a backgrounded tab reports false.
 */
export function useIsInstanceActive(): boolean {
  return useContext(ToolInstanceContext)?.isActive ?? true
}
