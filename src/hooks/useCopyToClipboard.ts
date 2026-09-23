import { useCallback } from 'react'
import { useUiStore } from '@/stores/ui.store'

export type CopyMessages = {
  /** Status-line text on success. */
  success?: string
  /** Status-line text when the write is refused. */
  failure?: string
}

/**
 * Named so the tree views that take the copier as a prop can spell the type without
 * re-deriving it from the hook.
 */
export type CopyToClipboard = (text: string, messages?: CopyMessages) => Promise<boolean>

/**
 * Copy text and report the outcome to the tool status line.
 *
 * Report failures because clipboard writes can fail without permission or document focus.
 *
 * Returns whether the write succeeded so callers can gate follow-up actions, such as closing a
 * modal.
 */
export function useCopyToClipboard(): CopyToClipboard {
  const setLastAction = useUiStore((s) => s.setLastAction)

  return useCallback(
    async (text: string, messages: CopyMessages = {}) => {
      const { success = 'Copied to clipboard', failure = 'Failed to copy to clipboard' } = messages
      try {
        await navigator.clipboard.writeText(text)
        setLastAction(success, 'success')
        return true
      } catch {
        setLastAction(failure, 'error')
        return false
      }
    },
    [setLastAction]
  )
}
