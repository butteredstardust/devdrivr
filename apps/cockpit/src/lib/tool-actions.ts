import { OPEN_FILE_TOOL_IDS, SAVE_FILE_TOOL_IDS } from '@/app/tool-registry'

/**
 * Lightweight pub/sub for shell→tool communication.
 * Shell dispatches actions via keyboard shortcuts;
 * active tool subscribes to the ones it supports.
 */
export type ToolAction =
  | { type: 'execute' }
  | { type: 'copy-output' }
  | { type: 'switch-tab'; tab: number }
  | { type: 'open-file'; content: string; filename: string }
  | { type: 'save-file' }
  | { type: 'send-to'; content: string }

type Listener = (action: ToolAction) => void

export function supportsToolFileAction(toolId: string, action: 'open-file' | 'save-file'): boolean {
  return (action === 'open-file' ? OPEN_FILE_TOOL_IDS : SAVE_FILE_TOOL_IDS).has(toolId)
}

const listeners = new Set<Listener>()

export function subscribeToolAction(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function dispatchToolAction(action: ToolAction): void {
  listeners.forEach((fn) => fn(action))
}
