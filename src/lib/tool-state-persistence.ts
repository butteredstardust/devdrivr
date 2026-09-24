import { saveToolState } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

let persistFailureReported = false

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
    persistFailureReported = false
  } catch (error) {
    console.error(`[tool-state-persistence] failed to save tool state for ${toolId}`, error)
    if (!persistFailureReported) {
      persistFailureReported = true
      const message = error instanceof Error ? error.message : String(error)
      useUiStore
        .getState()
        .addToast(`Failed to save tool state: ${message}. Recent changes may be lost.`, 'error')
    }
    throw error
  }
}
