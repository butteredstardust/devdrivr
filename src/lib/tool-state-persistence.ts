import { saveToolState } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

/**
 * Holds the keys whose latest save failed.
 * An outage starts when the first key fails and ends when every failing key saves again.
 * One outage produces one toast, however many tools retry during it.
 */
const failingKeys = new Set<string>()

/**
 * Saves tool state and reports one toast for each persistence outage.
 * Rethrows after reporting, so the exit flush sees the failure. Fire-and-forget callers can ignore the rejection.
 */
export async function saveToolStateWithFeedback(
  toolId: string,
  state: Record<string, unknown>
): Promise<void> {
  try {
    await saveToolState(toolId, state)
    failingKeys.delete(toolId)
  } catch (error) {
    console.error(`[tool-state-persistence] failed to save tool state for ${toolId}`, error)
    const outageStarted = failingKeys.size === 0
    failingKeys.add(toolId)
    if (outageStarted) {
      const message = error instanceof Error ? error.message : String(error)
      useUiStore
        .getState()
        .addToast(`Failed to save tool state: ${message}. Recent changes may be lost.`, 'error')
    }
    throw error
  }
}

/** Drops a closed tab's key, so a save that failed before the tab closed cannot hold the outage open. */
export function forgetToolStateFailure(toolId: string): void {
  failingKeys.delete(toolId)
}
