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
  // tab created for it has mounted.
  //
  // `isActive` is a dependency rather than a ref read, unlike the broadcast above. The queue is
  // filled in the same tick as the store update that shows the tab, so at notification time this
  // tab can still be rendered as hidden. Re-running the claim when it becomes visible is what
  // delivers the file.
  const stateKey = useToolInstance()?.stateKey
  useEffect(() => {
    if (!stateKey || !isActive) return
    const claim = () => {
      const action = claimPendingToolAction(stateKey)
      if (action) handlerRef.current(action)
    }
    claim()
    return subscribePendingToolAction(claim)
  }, [stateKey, isActive])
}
