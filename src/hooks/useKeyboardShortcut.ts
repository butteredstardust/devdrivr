import { useEffect, useRef } from 'react'
import { matchesCombo, type KeyCombo } from '@/lib/keybindings'
import { useIsInstanceActive, useToolInstance } from '@/app/tool-instance'

type ShortcutHandler = () => void | Promise<void>

type ShortcutOptions = {
  /**
   * Set this for a shell shortcut that acts on the active tool. A shortcut registered inside a
   * tool always counts as one.
   */
  targetsTool?: boolean
}

type Registration = {
  comboRef: { current: KeyCombo }
  handlerRef: { current: ShortcutHandler }
  /** False while the tool owning this shortcut sits in a backgrounded tab. */
  activeRef: { current: boolean }
  /** True for a shortcut that acts on a tool. It must not fire from inside a dialog. */
  targetsToolRef: { current: boolean }
}

// All hook instances share one window listener and a registry of active registrations.
// Refs keep each combo and handler current. The registry also centralizes filtering, error
// handling, and unmount cleanup.
const registrations = new Set<Registration>()
let sharedListenerAttached = false

function asElement(target: EventTarget | null): Element | null {
  // event.target is an EventTarget and may not be an Element at all (e.g. window
  // or document itself dispatches with the target set to something without
  // .closest), so duck-type the methods/properties we need rather than assuming.
  const isElementTarget =
    !!target &&
    typeof (target as Partial<Element>).closest === 'function' &&
    typeof (target as Partial<Element>).tagName === 'string'
  return isElementTarget ? (target as Element) : null
}

function isEditableTarget(element: Element | null): boolean {
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.closest('[contenteditable="true"]') !== null ||
    element.closest('.monaco-editor') !== null
  )
}

function handleSharedKeyDown(event: KeyboardEvent): void {
  const element = asElement(event.target)
  const isEditable = isEditableTarget(element)
  const isMonaco = element?.closest('.monaco-editor') != null
  // A dialog owns its keys. A tool shortcut must not change the document behind it.
  const inDialog = element?.closest('[role="dialog"]') != null
  let handled = false

  // Set preserves registration order, so dispatch follows hook mount order.
  for (const registration of registrations) {
    const combo = registration.comboRef.current

    // Tools in backgrounded tabs are mounted and still registered; only the
    // visible one should answer. Shell shortcuts have no tab and stay live.
    if (!registration.activeRef.current) continue
    if (inDialog && registration.targetsToolRef.current) continue
    if (isEditable && !combo.mod && !combo.allowInEditable) continue
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
  // capture phase lets devdrivr see its own shortcuts first; stopping only a matched Monaco event
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

export function useKeyboardShortcut(
  combo: KeyCombo,
  handler: ShortcutHandler,
  options?: ShortcutOptions
): void {
  const comboRef = useRef(combo)
  const handlerRef = useRef(handler)
  const activeRef = useRef(true)
  const targetsToolRef = useRef(false)
  const insideTool = useToolInstance() !== null
  comboRef.current = combo
  handlerRef.current = handler
  activeRef.current = useIsInstanceActive()
  targetsToolRef.current = insideTool || options?.targetsTool === true

  useEffect(() => {
    const registration: Registration = { comboRef, handlerRef, activeRef, targetsToolRef }
    registrations.add(registration)
    attachSharedListener()
    return () => {
      registrations.delete(registration)
      detachSharedListenerIfIdle()
    }
  }, [])
}
