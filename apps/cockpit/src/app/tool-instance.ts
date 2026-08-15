import { createContext, useContext } from 'react'

/**
 * Identifies the tab a tool is rendered inside.
 *
 * Inactive tabs stay mounted so their editors, scroll positions and in-flight
 * work survive a switch, which means several tools are listening to the shell
 * at once. Anything that used to be safe purely because one tool was mounted —
 * ⌘S dispatch, keyboard shortcuts — has to consult `isActive` instead.
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
