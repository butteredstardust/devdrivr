/**
 * WARNING: call `mermaid.initialize` only through `loadMermaid`.
 *
 * Mermaid is one shared instance, and `initialize` resets every option to its default before it
 * applies the new ones. A second caller with a different config silently undoes the first, and a
 * theme cache in that first caller then skips the call that would restore it.
 */

export type MermaidTheme = 'default' | 'dark'

let initializedTheme: MermaidTheme | null = null

/** Loads Mermaid and applies the app config for `theme`. */
export async function loadMermaid(theme: MermaidTheme) {
  const { default: mermaid } = await import('mermaid')
  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      // HTML labels live in a `<foreignObject>`, which WebKit does not rasterise from an SVG
      // data URL. A PNG export of a flowchart or class diagram then shows blank nodes.
      // Set the root option: Mermaid 11 ignores `flowchart.htmlLabels` on some render paths.
      htmlLabels: false,
    })
    initializedTheme = theme
  }
  return mermaid
}
