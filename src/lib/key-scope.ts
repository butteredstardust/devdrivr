/**
 * WARNING: a tool's `window` keydown listener also receives the keys typed in the notes drawer and
 * in dialogs. Both render outside the tool but in the same document, and the drawer is live beside
 * every tool. `useIsInstanceActive()` does not help: it reports the visible tab, not the focus.
 *
 * A tool shortcut belongs to the tool when focus is inside the tool root or on nothing at all.
 * Focus on neutral shell chrome, such as a sidebar button, also leaves the key to the tool: on
 * Windows a click focuses the button, and the shortcut must still work after that click.
 */

// Elements outside the tool that own the keys typed into them. `data-key-scope` marks a region, such
// as the notes drawer, that owns every key typed anywhere inside it. Monaco edits through a textarea or,
// with the EditContext API, a `role="textbox"` div.
const FOREIGN_KEY_OWNERS =
  'input, textarea, select, [role="textbox"], [role="dialog"], [data-key-scope]'

export function isKeyEventForTool(event: KeyboardEvent, root: Element | null): boolean {
  const target = event.target
  if (!(target instanceof Element)) return true
  if (target === document.body || target === document.documentElement) return true
  if (root?.contains(target)) return true
  if (target instanceof HTMLElement && target.isContentEditable) return false
  return target.closest(FOREIGN_KEY_OWNERS) === null
}
