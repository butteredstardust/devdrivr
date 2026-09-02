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
 * Every tool used to inline this, in two spellings — `await` inside try/catch, or `.then(ok, err)` —
 * and the failure branch was the part that drifted: some sites reported nothing at all, so a refused
 * write looked exactly like a successful one. Clipboard writes fail for real reasons (a WebView
 * without permission, a document that has lost focus), and silence there is the worst answer.
 *
 * Returns whether the write landed, for the callers that do something further on success — closing a
 * modal, say — and must not do it when the copy failed.
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
