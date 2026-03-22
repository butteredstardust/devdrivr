import { useEffect, useRef } from 'react'
import { subscribeToolAction, type ToolAction } from '@/lib/tool-actions'

export function useToolAction(handler: (action: ToolAction) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return subscribeToolAction((action) => handlerRef.current(action))
  }, [])
}
