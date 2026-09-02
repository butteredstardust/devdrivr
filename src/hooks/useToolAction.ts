import { useEffect, useRef } from 'react'
import { subscribeToolAction, type ToolAction } from '@/lib/tool-actions'
import { useIsInstanceActive } from '@/app/tool-instance'

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
}
