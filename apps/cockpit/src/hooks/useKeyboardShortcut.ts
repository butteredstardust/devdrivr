import { useEffect, useRef } from 'react'
import { matchesCombo, type KeyCombo } from '@/lib/keybindings'

export function useKeyboardShortcut(combo: KeyCombo, handler: () => void | Promise<void>): void {
  const comboRef = useRef(combo)
  const handlerRef = useRef(handler)
  comboRef.current = combo
  handlerRef.current = handler

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      // event.target is an EventTarget and may not be an Element at all (e.g. window
      // or document itself dispatches with the target set to something without
      // .closest), so duck-type the methods/properties we need rather than assuming.
      const isElementTarget =
        !!target &&
        typeof (target as Partial<Element>).closest === 'function' &&
        typeof (target as Partial<Element>).tagName === 'string'
      const element = isElementTarget ? (target as Element) : null
      const isEditable =
        element !== null &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.closest('[contenteditable="true"]') !== null ||
          element.closest('.monaco-editor') !== null)

      if (isEditable && !comboRef.current.mod) return

      if (matchesCombo(event, comboRef.current)) {
        event.preventDefault()
        try {
          const result = handlerRef.current()
          if (result) {
            void result.catch((error: unknown) => {
              console.error('[useKeyboardShortcut] Shortcut handler failed:', error)
            })
          }
        } catch (error) {
          console.error('[useKeyboardShortcut] Shortcut handler failed:', error)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
