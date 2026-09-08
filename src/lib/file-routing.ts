import { OPEN_FILE_TOOL_IDS } from '@/app/tool-registry'
import { hasPendingToolAction, queueToolAction } from '@/lib/tool-actions'
import { useUiStore } from '@/stores/ui.store'

/**
 * Which tool opens a file the operating system handed over.
 *
 * The OS knows nothing about tools, so the extension is the only signal available. Every value
 * here must name a tool with `supportsOpenFile` in the registry — `toolIdForFile` falls back when
 * it does not, and a test asserts the whole table.
 *
 * The extensions listed here are the ones declared in `bundle.fileAssociations`. Keep the two in
 * step: an association with no route lands in the fallback tool, and a route with no association
 * never appears in the system's "Open With" menu.
 */
export const EXTENSION_TOOL_IDS: Record<string, string> = {
  json: 'json-tools',
  yaml: 'yaml-tools',
  yml: 'yaml-tools',
  xml: 'xml-tools',
  csv: 'csv-tools',
  tsv: 'csv-tools',
  md: 'markdown-editor',
  markdown: 'markdown-editor',
  mmd: 'mermaid-editor',
  mermaid: 'mermaid-editor',
  css: 'css-validator',
  html: 'html-validator',
  htm: 'html-validator',
  // Source files go to Code Formatter, not TS Playground: the Playground drops the path it was
  // opened from and its save writes compiled JavaScript, so a file opened from disk could not be
  // saved back. Code Formatter keeps the path and detects the language from the name.
  ts: 'code-formatter',
  tsx: 'code-formatter',
  js: 'code-formatter',
  jsx: 'code-formatter',
}

/**
 * Where an unrecognised extension goes. Code Formatter accepts any text and detects the language
 * itself, so it degrades better than a tool that expects one syntax.
 */
export const FALLBACK_OPEN_FILE_TOOL = 'code-formatter'

/** Lowercased extension of a path or filename, without the dot. Empty when there is none. */
export function extensionOf(pathOrName: string): string {
  const name = pathOrName.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  // `dot < 1` also rejects dotfiles: `.gitignore` has no extension, it has a name.
  return dot < 1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The tool that opens this file. Always returns a tool that accepts file content. */
export function toolIdForFile(pathOrName: string): string {
  const toolId = EXTENSION_TOOL_IDS[extensionOf(pathOrName)]
  return toolId && OPEN_FILE_TOOL_IDS.has(toolId) ? toolId : FALLBACK_OPEN_FILE_TOOL
}

/** The `tool_state` key of the tab now in front, falling back to the bare tool id. */
function focusedStateKey(toolId: string): string {
  const ui = useUiStore.getState()
  return ui.tabs.find((tab) => tab.id === ui.activeTabId)?.stateKey ?? toolId
}

/**
 * Opens file content in the tool its extension routes to, and brings that tool forward.
 *
 * The action is queued rather than dispatched: `dispatchToolAction` only reaches tools that are
 * already mounted and active, and a tab opened one line earlier is neither — it is still loading
 * its lazy component. The tool claims the action once it is live.
 *
 * Set `forceNewTab` for every file after the first when several arrive together. Selecting two
 * files of one type is two documents, and reusing the tab would leave only the second — an
 * already-mounted tool claims its file at once, so a check on what is still queued cannot see the
 * collision coming.
 *
 * Returns the tool the file went to.
 */
export function openFileInTool(
  file: { content: string; filename: string; path: string },
  options: { forceNewTab?: boolean } = {}
): string {
  const toolId = toolIdForFile(file.filename)
  const ui = useUiStore.getState()
  if (options.forceNewTab) {
    ui.openTabInstance(toolId)
  } else {
    ui.openTab(toolId)
  }

  // Address the tab just selected, not the tool id: a second tab of the same tool writes to
  // `${toolId}#${tabId}`, and the bare id would deliver the file to a tab nothing is watching.
  let stateKey = focusedStateKey(toolId)

  // A tab still holding an unclaimed file gets a sibling rather than having that file replaced
  // before anyone has seen it.
  if (hasPendingToolAction(stateKey)) {
    useUiStore.getState().openTabInstance(toolId)
    stateKey = focusedStateKey(toolId)
  }

  queueToolAction(stateKey, {
    type: 'open-file',
    content: file.content,
    filename: file.filename,
    // The path travels with the file so the first ⌘S overwrites it rather than asking where to
    // save something the user opened from disk.
    path: file.path,
  })
  return toolId
}
