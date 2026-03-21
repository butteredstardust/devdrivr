import { useEffect, useRef } from 'react'
import { matchesCombo, type KeyCombo } from '@/lib/keybindings'

export function useKeyboardShortcut(combo: KeyCombo, handler: () => void): void {
  const comboRef = useRef(combo)
  const handlerRef = useRef(handler)
  comboRef.current = combo
  handlerRef.current = handler

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true' ||
        target.closest('.monaco-editor') !== null

      if (isEditable && !comboRef.current.mod) return

      if (matchesCombo(event, comboRef.current)) {
        event.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
