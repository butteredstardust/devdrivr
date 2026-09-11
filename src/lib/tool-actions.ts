import {
  OPEN_FILE_TOOL_IDS,
  OWNS_OPEN_FILE_TOOL_IDS,
  SAVE_FILE_TOOL_IDS,
} from '@/app/tool-registry'

/**
 * Lightweight pub/sub for shell→tool communication.
 * Shell dispatches actions via keyboard shortcuts;
 * active tool subscribes to the ones it supports.
 */
export type ToolAction =
  | { type: 'execute' }
  | { type: 'copy-output' }
  | { type: 'switch-tab'; tab: number }
  | { type: 'open-file'; content: string; filename: string; path?: string }
  // Tells a tool to run its own file dialog. The shell reads text, so a tool
  // that needs bytes takes this instead of `open-file`.
  | { type: 'open-file-dialog' }
  | { type: 'save-file' }
  | { type: 'send-to'; content: string }

type Listener = (action: ToolAction) => void

export function supportsToolFileAction(toolId: string, action: 'open-file' | 'save-file'): boolean {
  return (action === 'open-file' ? OPEN_FILE_TOOL_IDS : SAVE_FILE_TOOL_IDS).has(toolId)
}

/** True when the tool opens its own file dialog instead of taking text from the shell. */
export function toolOwnsOpenFile(toolId: string): boolean {
  return OWNS_OPEN_FILE_TOOL_IDS.has(toolId)
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

/**
 * An action addressed to one tab, held until that tab can take it.
 *
 * `dispatchToolAction` reaches only tools that are already mounted and active. That is enough for
 * a keyboard shortcut, which by definition targets the tool on screen. It is not enough when the
 * shell opens a file the operating system handed over: the receiving tab is created for the file
 * and is still loading its component when the content arrives.
 *
 * Keyed by tab, because "Open With" can hand over several files at once and each one is on its way
 * to a different tab. Two files that route to the same tab keep the last, which is the same result
 * as opening them one after the other.
 */
const pending = new Map<string, ToolAction>()
const pendingListeners = new Set<() => void>()

/** Holds `action` for the tab that owns `stateKey`, and wakes any tab already mounted. */
export function queueToolAction(stateKey: string, action: ToolAction): void {
  pending.set(stateKey, action)
  pendingListeners.forEach((fn) => fn())
}

export function subscribePendingToolAction(listener: () => void): () => void {
  pendingListeners.add(listener)
  return () => {
    pendingListeners.delete(listener)
  }
}

/** True while an action addressed to `stateKey` is still waiting to be claimed. */
export function hasPendingToolAction(stateKey: string): boolean {
  return pending.has(stateKey)
}

/** Drops the action addressed to `stateKey`. Called when its tab closes, so it cannot reappear. */
export function discardPendingToolAction(stateKey: string): void {
  pending.delete(stateKey)
}

/** Takes the action addressed to `stateKey`, if there is one. Removes it, so it runs once. */
export function claimPendingToolAction(stateKey: string): ToolAction | null {
  const action = pending.get(stateKey)
  if (!action) return null
  pending.delete(stateKey)
  return action
}

/** Drops every queued action. Test helper — the queue outlives a component tree. */
export function clearPendingToolActions(): void {
  pending.clear()
}
