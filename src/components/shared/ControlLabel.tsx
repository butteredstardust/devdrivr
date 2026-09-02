import { createContext, useContext, type ReactNode } from 'react'

/**
 * Lets a layout component name the control it wraps, without the call site
 * repeating the label text as an `aria-label`.
 *
 * The case this exists for is a settings row: a label and its control are
 * siblings, and the control is a `<button role="switch">` or a bare `<select>`
 * with nothing tying the two together. A `role="switch"` button is not a
 * labelable element, so an enclosing `<label>` gives it no name at all — it is
 * announced as an unnamed button, and a screen-reader user arrowing through
 * Settings hears "switch, on" thirty times with no idea what any of them are.
 *
 * The row publishes the id of the element holding its label text; the control
 * picks it up as its `aria-labelledby`. Explicit `aria-label` /
 * `aria-labelledby` on the control still wins, and a control rendered outside a
 * provider is unaffected — the context default is `undefined`.
 */
const ControlLabelContext = createContext<string | undefined>(undefined)

export function ControlLabelProvider({ id, children }: { id: string; children: ReactNode }) {
  return <ControlLabelContext.Provider value={id}>{children}</ControlLabelContext.Provider>
}

/** Id of the surrounding row's label element, or undefined outside a row. */
export function useControlLabelId(): string | undefined {
  return useContext(ControlLabelContext)
}
