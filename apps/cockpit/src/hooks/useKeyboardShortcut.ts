import { useEffect, useRef } from 'react'
import { matchesCombo, type KeyCombo } from '@/lib/keybindings'
import { useIsInstanceActive } from '@/app/tool-instance'

type ShortcutHandler = () => void | Promise<void>

type Registration = {
  comboRef: { current: KeyCombo }
  handlerRef: { current: ShortcutHandler }
  /** False while the tool owning this shortcut sits in a backgrounded tab. */
  activeRef: { current: boolean }
}

// Every useKeyboardShortcut() call used to register its own `window` keydown
// listener (28 call sites at last count). Instead, all instances share a single
// listener and a registry of active registrations — the public API and per-call
// semantics (combo/handler read fresh via refs, editable-target filter, sync/async
// error handling, cleanup on unmount) are unchanged; only the number of listeners is.
const registrations = new Set<Registration>()
let sharedListenerAttached = false

function isEditableTarget(target: EventTarget | null): boolean {
  // event.target is an EventTarget and may not be an Element at all (e.g. window
  // or document itself dispatches with the target set to something without
  // .closest), so duck-type the methods/properties we need rather than assuming.
  const isElementTarget =
    !!target &&
    typeof (target as Partial<Element>).closest === 'function' &&
    typeof (target as Partial<Element>).tagName === 'string'
  if (!isElementTarget) return false
  const element = target as Element
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.closest('[contenteditable="true"]') !== null ||
    element.closest('.monaco-editor') !== null
  )
}

function handleSharedKeyDown(event: KeyboardEvent): void {
  const isEditable = isEditableTarget(event.target)
  const isMonaco =
    !!event.target &&
    typeof (event.target as Partial<Element>).closest === 'function' &&
    (event.target as Element).closest('.monaco-editor') !== null
  let handled = false

  // Set preserves insertion order, matching the dispatch order the browser used to
  // give independent per-hook listeners registered in mount order.
  for (const registration of registrations) {
    const combo = registration.comboRef.current

    // Tools in backgrounded tabs are mounted and still registered; only the
    // visible one should answer. Shell shortcuts have no tab and stay live.
    if (!registration.activeRef.current) continue
    if (isEditable && !combo.mod) continue
    if (!matchesCombo(event, combo)) continue

    event.preventDefault()
    handled = true
    try {
      const result = registration.handlerRef.current()
      if (result) {
        void result.catch((error: unknown) => {
          console.error('[useKeyboardShortcut] Shortcut handler failed:', error)
        })
      }
    } catch (error) {
      console.error('[useKeyboardShortcut] Shortcut handler failed:', error)
    }
  }

  // Monaco stops many modifier shortcuts before they bubble to window and assigns some of the
  // same combinations to editor commands (⌘K begins a chord; ⌘Enter inserts a line). Listening in
  // capture phase lets Cockpit see its own shortcuts first; stopping only a matched Monaco event
  // keeps ordinary editor input and every unmatched Monaco command untouched.
  if (handled && isMonaco) event.stopPropagation()
}

function attachSharedListener(): void {
  if (sharedListenerAttached) return
  window.addEventListener('keydown', handleSharedKeyDown, true)
  sharedListenerAttached = true
}

function detachSharedListenerIfIdle(): void {
  if (!sharedListenerAttached || registrations.size > 0) return
  window.removeEventListener('keydown', handleSharedKeyDown, true)
  sharedListenerAttached = false
}

export function useKeyboardShortcut(combo: KeyCombo, handler: ShortcutHandler): void {
  const comboRef = useRef(combo)
  const handlerRef = useRef(handler)
  const activeRef = useRef(true)
  comboRef.current = combo
  handlerRef.current = handler
  activeRef.current = useIsInstanceActive()

  useEffect(() => {
    const registration: Registration = { comboRef, handlerRef, activeRef }
    registrations.add(registration)
    attachSharedListener()
    return () => {
      registrations.delete(registration)
      detachSharedListenerIfIdle()
    }
  }, [])
}
