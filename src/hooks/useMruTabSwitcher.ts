import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'

/**
 * Ctrl+Tab / Ctrl+Shift+Tab switching in most-recently-used order.
 *
 * This is deliberately a different gesture from the positional shortcuts:
 * `mod+1..9` is for jumping to a tab you can see and know the index of, while
 * this is for bouncing between the two or three you are actually working in,
 * wherever they happen to sit in the strip. With only the positional ones, the
 * common case — flip to the previous tab and back — has no cheap gesture.
 *
 * Held-modifier semantics, as every other tabbed app has them: the order is
 * snapshotted when Ctrl+Tab is first pressed and each further Tab walks that
 * frozen list, so repeated presses advance through the stack instead of
 * ping-ponging between the top two. Releasing Ctrl ends the cycle, at which
 * point the store's own MRU (updated live by each `setActiveTab`) has the
 * landing tab on top and the next cycle starts fresh from there.
 *
 * Deliberately not routed through `useKeyboardShortcut`: that hook is keydown
 * only and `KeyCombo`'s `mod` means Cmd on macOS, whereas Ctrl+Tab is Ctrl on
 * every platform. Bending both to fit would cost more than one scoped listener.
 */
export function useMruTabSwitcher(): void {
  useEffect(() => {
    // Null whenever no cycle is in flight. Held in a closure rather than state
    // because nothing renders from it and a re-render mid-cycle would be noise.
    let cycle: { order: string[]; index: number } | null = null

    const endCycle = () => {
      cycle = null
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !event.ctrlKey) return
      const { tabs, tabMru, activeTabId, setActiveTab } = useUiStore.getState()
      if (tabs.length < 2) return
      event.preventDefault()

      if (!cycle) {
        // MRU first, then any tab the MRU has not seen yet (restored sessions
        // start with only the active tab recorded), so every tab is reachable.
        const live = new Set(tabs.map((tab) => tab.id))
        const seen = new Set<string>()
        const order: string[] = []
        for (const id of tabMru) {
          if (live.has(id) && !seen.has(id)) {
            seen.add(id)
            order.push(id)
          }
        }
        for (const tab of tabs) {
          if (!seen.has(tab.id)) order.push(tab.id)
        }
        // Start from wherever the active tab sits, so the first press always
        // steps off it even if the MRU is stale.
        const start = Math.max(0, order.indexOf(activeTabId ?? ''))
        cycle = { order, index: start }
      }

      const { order } = cycle
      const step = event.shiftKey ? -1 : 1
      cycle.index = (cycle.index + step + order.length) % order.length
      const nextId = order[cycle.index]
      if (nextId) setActiveTab(nextId)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control') endCycle()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    // A cycle held across a window blur would never see its keyup, leaving a
    // stale snapshot to resume from on the next press.
    window.addEventListener('blur', endCycle)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', endCycle)
    }
  }, [])
}
