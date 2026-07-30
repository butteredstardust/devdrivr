import { beforeEach, describe, expect, it, vi } from 'vitest'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  isLikelyBinaryText,
  filenameFromPath,
  openFileDialog,
  readSupportedTextFile,
  saveFileDialog,
} from '@/lib/file-io'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

describe('file I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readTextFile).mockResolvedValue('hello')
    vi.mocked(writeTextFile).mockResolvedValue()
  })

  it('returns null without reading when open is cancelled', async () => {
    vi.mocked(open).mockResolvedValue(null)

    await expect(openFileDialog()).resolves.toBeNull()
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('opens supported text and keeps the selected filename', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/example.json')
    vi.mocked(readTextFile).mockResolvedValue('{"ok":true}')

    await expect(openFileDialog()).resolves.toEqual({
      content: '{"ok":true}',
      filename: 'example.json',
    })
  })

  it('extracts filenames from Unix and Windows paths', () => {
    expect(filenameFromPath('/tmp/example.json')).toBe('example.json')
    expect(filenameFromPath('C:\\Users\\Ada\\example.json')).toBe('example.json')
  })

  it('rejects null bytes and control-heavy content as binary', async () => {
    expect(isLikelyBinaryText('normal\ntext\tcontent')).toBe(false)
    expect(isLikelyBinaryText('PNG\0binary')).toBe(true)
    expect(isLikelyBinaryText('\u0001\u0002\u0003readable')).toBe(true)
    vi.mocked(readTextFile).mockResolvedValue('PNG\0binary')

    await expect(readSupportedTextFile('/tmp/image.png')).rejects.toThrow('Unsupported binary file')
  })

  it('turns filesystem decoding failures into clear text-file errors', async () => {
    vi.mocked(readTextFile).mockRejectedValue(new Error('invalid utf-8'))

    await expect(readSupportedTextFile('/tmp/archive.zip')).rejects.toThrow(
      'Unable to read "/tmp/archive.zip" as text'
    )
  })

  it('returns null without writing when save is cancelled', async () => {
    vi.mocked(save).mockResolvedValue(null)

    await expect(saveFileDialog('content', 'result.txt')).resolves.toBeNull()
    expect(writeTextFile).not.toHaveBeenCalled()
  })

  it('writes selected output and returns its path', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/result.json')

    await expect(saveFileDialog('{"ok":true}', 'result.json')).resolves.toBe('/tmp/result.json')
    expect(writeTextFile).toHaveBeenCalledWith('/tmp/result.json', '{"ok":true}')
  })

  it('propagates save errors to callers for user feedback', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/result.json')
    vi.mocked(writeTextFile).mockRejectedValue(new Error('disk full'))

    await expect(saveFileDialog('content')).rejects.toThrow('disk full')
  })
})
