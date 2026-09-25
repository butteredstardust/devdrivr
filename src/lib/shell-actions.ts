import { TOOLS } from '@/app/tool-registry'
import { openFileDialog } from '@/lib/file-io'
import { dispatchToolAction, supportsToolFileAction, toolOwnsOpenFile } from '@/lib/tool-actions'

/**
 * Shell commands that both the keyboard shortcuts and the command palette run.
 *
 * Keep one copy of each so the two entry points cannot drift apart.
 */

type Report = (message: string, type: 'success' | 'error') => void

/** Opens a file into `toolId`, the active tool. Reports every outcome through `report`. */
export async function openFileForTool(toolId: string, report: Report): Promise<void> {
  // A tool that needs bytes runs its own dialog. Reading the file as text
  // here would reject a PNG before the tool ever sees it.
  if (toolOwnsOpenFile(toolId)) {
    dispatchToolAction({ type: 'open-file-dialog' })
    return
  }
  if (!supportsToolFileAction(toolId, 'open-file')) {
    report('Open File is not supported by the active tool', 'error')
    return
  }
  try {
    const maxBytes = TOOLS.find((tool) => tool.id === toolId)?.maxOpenBytes
    const result = await openFileDialog(maxBytes === undefined ? undefined : { maxBytes })
    if (result) {
      dispatchToolAction({
        type: 'open-file',
        content: result.content,
        filename: result.filename,
        path: result.path,
      })
      report(`Opened ${result.filename}`, 'success')
    }
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), 'error')
  }
}

/** Asks `toolId`, the active tool, to save its output. */
export function saveFileForTool(toolId: string, report: Report): void {
  if (!supportsToolFileAction(toolId, 'save-file')) {
    report('Save Output is not supported by the active tool', 'error')
    return
  }
  dispatchToolAction({ type: 'save-file' })
}

/**
 * Returns the tool `step` places away from `toolId` in registry order, wrapping at both ends.
 * Returns null for an unknown tool, so there is no jump to an arbitrary tool.
 */
export function adjacentToolId(toolId: string, step: 1 | -1): string | null {
  const idx = TOOLS.findIndex((tool) => tool.id === toolId)
  if (idx === -1) return null
  return TOOLS[(idx + step + TOOLS.length) % TOOLS.length]?.id ?? null
}
