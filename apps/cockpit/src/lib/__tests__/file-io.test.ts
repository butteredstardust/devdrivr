import { beforeEach, describe, expect, it, vi } from 'vitest'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  buildExportFilename,
  exportFile,
  filenameFromPath,
  isLikelyBinaryText,
  openFileDialog,
  readSupportedTextFile,
  sanitizeExportBasename,
  saveFileDialog,
  saveFileToPath,
} from '@/lib/file-io'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
}))

describe('file I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readTextFile).mockResolvedValue('hello')
    vi.mocked(writeTextFile).mockResolvedValue()
    vi.mocked(writeFile).mockResolvedValue()
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
      path: '/tmp/example.json',
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

  describe('saveFileToPath', () => {
    it('writes content directly to the given path without a dialog', async () => {
      await saveFileToPath('/tmp/existing.md', '# hello')

      expect(save).not.toHaveBeenCalled()
      expect(writeTextFile).toHaveBeenCalledWith('/tmp/existing.md', '# hello')
    })

    it('propagates write errors to callers for user feedback', async () => {
      vi.mocked(writeTextFile).mockRejectedValue(new Error('disk full'))

      await expect(saveFileToPath('/tmp/existing.md', 'content')).rejects.toThrow('disk full')
    })
  })

  describe('sanitizeExportBasename / buildExportFilename', () => {
    it('replaces filesystem-illegal characters with underscores', () => {
      expect(sanitizeExportBasename('my/weird:name?')).toBe('my_weird_name_')
    })

    it('falls back to a generic name when nothing usable remains', () => {
      expect(sanitizeExportBasename('///')).toBe('export')
    })

    it('joins a sanitized base with an extension', () => {
      expect(buildExportFilename('my snippet!', 'ts')).toBe('my_snippet_.ts')
    })

    it('strips a leading dot from the extension', () => {
      expect(buildExportFilename('name', '.svg')).toBe('name.svg')
    })
  })

  describe('exportFile', () => {
    it('returns null without writing when the save dialog is cancelled', async () => {
      vi.mocked(save).mockResolvedValue(null)

      await expect(exportFile('content', 'file.txt')).resolves.toBeNull()
      expect(writeTextFile).not.toHaveBeenCalled()
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('writes text content through writeTextFile and returns the path', async () => {
      vi.mocked(save).mockResolvedValue('/tmp/file.txt')

      await expect(exportFile('hello world', 'file.txt')).resolves.toBe('/tmp/file.txt')
      expect(writeTextFile).toHaveBeenCalledWith('/tmp/file.txt', 'hello world')
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('writes blob content through writeFile as bytes', async () => {
      vi.mocked(save).mockResolvedValue('/tmp/image.png')
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

      await expect(exportFile(blob, 'image.png')).resolves.toBe('/tmp/image.png')
      expect(writeFile).toHaveBeenCalledTimes(1)
      const [path, bytes] = vi.mocked(writeFile).mock.calls[0] as [string, Uint8Array]
      expect(path).toBe('/tmp/image.png')
      expect(Array.from(bytes)).toEqual([1, 2, 3])
      expect(writeTextFile).not.toHaveBeenCalled()
    })

    it('propagates write failures for user feedback', async () => {
      vi.mocked(save).mockResolvedValue('/tmp/file.txt')
      vi.mocked(writeTextFile).mockRejectedValue(new Error('disk full'))

      await expect(exportFile('content', 'file.txt')).rejects.toThrow('disk full')
    })
  })
})
