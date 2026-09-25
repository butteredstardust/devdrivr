import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adjacentToolId, openFileForTool, saveFileForTool } from '@/lib/shell-actions'

const mocks = vi.hoisted(() => ({
  dispatchToolAction: vi.fn(),
  openFileDialog: vi.fn(),
  supportsToolFileAction: vi.fn(),
  toolOwnsOpenFile: vi.fn(),
}))

vi.mock('@/app/tool-registry', () => ({
  TOOLS: [{ id: 'tool-a' }, { id: 'tool-b', maxOpenBytes: 2048 }, { id: 'tool-c' }],
}))

vi.mock('@/lib/tool-actions', () => ({
  dispatchToolAction: mocks.dispatchToolAction,
  supportsToolFileAction: mocks.supportsToolFileAction,
  toolOwnsOpenFile: mocks.toolOwnsOpenFile,
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: mocks.openFileDialog,
}))

describe('shell actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.supportsToolFileAction.mockReturnValue(true)
    mocks.toolOwnsOpenFile.mockReturnValue(false)
  })

  it('steps through tools in registry order and wraps at both ends', () => {
    expect(adjacentToolId('tool-a', 1)).toBe('tool-b')
    expect(adjacentToolId('tool-c', 1)).toBe('tool-a')
    expect(adjacentToolId('tool-a', -1)).toBe('tool-c')
  })

  it('does not step from an unknown or empty tool', () => {
    expect(adjacentToolId('', 1)).toBeNull()
    expect(adjacentToolId('missing', -1)).toBeNull()
  })

  it('opens a file with the tool size limit and reports the filename', async () => {
    mocks.openFileDialog.mockResolvedValue({ content: 'x', filename: 'a.txt', path: '/a.txt' })
    const report = vi.fn()

    await openFileForTool('tool-b', report)

    expect(mocks.openFileDialog).toHaveBeenCalledWith({ maxBytes: 2048 })
    expect(mocks.dispatchToolAction).toHaveBeenCalledWith({
      type: 'open-file',
      content: 'x',
      filename: 'a.txt',
      path: '/a.txt',
    })
    expect(report).toHaveBeenCalledWith('Opened a.txt', 'success')
  })

  it('reports a failed read instead of throwing', async () => {
    mocks.openFileDialog.mockRejectedValue(new Error('File exceeds the 50 MB import limit'))
    const report = vi.fn()

    await openFileForTool('tool-a', report)

    expect(report).toHaveBeenCalledWith('File exceeds the 50 MB import limit', 'error')
    expect(mocks.dispatchToolAction).not.toHaveBeenCalled()
  })

  it('reports an unsupported save without dispatching', () => {
    mocks.supportsToolFileAction.mockReturnValue(false)
    const report = vi.fn()

    saveFileForTool('tool-a', report)

    expect(report).toHaveBeenCalledWith('Save Output is not supported by the active tool', 'error')
    expect(mocks.dispatchToolAction).not.toHaveBeenCalled()
  })
})
