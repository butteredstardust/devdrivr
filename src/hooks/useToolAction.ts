import { useEffect, useRef } from 'react'
import {
  claimPendingToolAction,
  subscribePendingToolAction,
  subscribeToolAction,
  type ToolAction,
} from '@/lib/tool-actions'
import { useIsInstanceActive, useToolInstance } from '@/app/tool-instance'

export function useToolAction(handler: (action: ToolAction) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  // Backgrounded tabs stay mounted and stay subscribed, so the dispatch has to
  // be filtered here. Without this, one ⌘S would open a save dialog for every
  // mounted tool at once.
  const isActive = useIsInstanceActive()
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    return subscribeToolAction((action) => {
      if (!isActiveRef.current) return
      handlerRef.current(action)
    })
  }, [])

  // An action addressed to this tab specifically — a file the OS opened, which arrives before the
  // tab created for it has mounted. Claimed on mount for that case, and on notification for a tab
  // that was already open.
  const stateKey = useToolInstance()?.stateKey
  useEffect(() => {
    if (!stateKey) return
    const claim = () => {
      if (!isActiveRef.current) return
      const action = claimPendingToolAction(stateKey)
      if (action) handlerRef.current(action)
    }
    claim()
    return subscribePendingToolAction(claim)
  }, [stateKey])
}
