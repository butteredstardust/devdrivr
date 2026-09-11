import { open, save } from '@tauri-apps/plugin-dialog'
import { readFile, readTextFile, stat, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'

export function isLikelyBinaryText(content: string): boolean {
  if (content.includes('\0')) return true
  if (content.length === 0) return false
  let controlCharacters = 0
  for (const character of content) {
    const code = character.charCodeAt(0)
    if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
      controlCharacters++
    }
  }
  return controlCharacters / content.length > 0.1
}

export function filenameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/**
 * The media types a file drop can produce.
 *
 * A `File` built from bytes has no type of its own, and a data URI with an empty type shows
 * nothing. The list covers what the tools preview or label; anything else reads as unknown.
 */
const MIME_TYPES: Record<string, string> = {
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  webp: 'image/webp',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  zip: 'application/zip',
}

/** Returns the media type for a path, or an empty string when the extension is unknown. */
export function mimeTypeFromPath(filePath: string): string {
  const extension = filenameFromPath(filePath).split('.').pop()?.toLowerCase()
  if (extension === undefined) return ''
  return MIME_TYPES[extension] ?? ''
}

export async function readSupportedTextFile(filePath: string): Promise<string> {
  let content: string
  try {
    content = await readTextFile(filePath)
  } catch (err) {
    throw new Error(`Unable to read "${filePath}" as text`, { cause: err })
  }
  if (isLikelyBinaryText(content)) {
    throw new Error(`Unsupported binary file: "${filePath}"`)
  }
  return content
}

export async function openFileDialog(options?: { maxBytes?: number }): Promise<{
  content: string
  filename: string
  path: string
} | null> {
  const path = await open({
    multiple: false,
    filters: [
      {
        name: 'Text',
        extensions: [
          'txt',
          'json',
          'xml',
          'html',
          'htm',
          'css',
          'js',
          'jsx',
          'ts',
          'tsx',
          'md',
          'yaml',
          'yml',
          'proto',
          'graphql',
          'gql',
          'sql',
          'csv',
          'svg',
          'mmd',
          'mermaid',
        ],
      },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  const filePath = typeof path === 'string' ? path : path[0]
  if (!filePath) return null
  if (options?.maxBytes !== undefined) {
    const metadata = await stat(filePath)
    if (metadata.size > options.maxBytes) {
      throw new Error(
        `File is larger than the ${Math.round(options.maxBytes / 1024 / 1024)} MB import limit`
      )
    }
  }
  const content = await readSupportedTextFile(filePath)
  return { content, filename: filenameFromPath(filePath), path: filePath }
}

export async function openImageFileDialog(): Promise<{
  bytes: Uint8Array
  filename: string
  path: string
} | null> {
  const path = await open({
    multiple: false,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
      },
    ],
  })
  if (!path) return null
  const filePath = typeof path === 'string' ? path : path[0]
  if (!filePath) return null
  const bytes = await readFile(filePath)
  return { bytes, filename: filenameFromPath(filePath), path: filePath }
}

/** Writes content directly to a known absolute path — no dialog shown. */
export async function saveFileToPath(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
}

export async function saveFileDialog(
  content: string,
  defaultName?: string
): Promise<string | null> {
  const path = await save({
    ...(defaultName !== undefined && { defaultPath: defaultName }),
    filters: [
      {
        name: 'Text',
        // `csv`, `tsv`, `sql` and `mmd` are here because the save panel appends
        // an allowed extension: without them `people.csv` is written as
        // `people.csv.txt`.
        extensions: [
          'txt',
          'json',
          'xml',
          'yaml',
          'yml',
          'html',
          'htm',
          'css',
          'js',
          'ts',
          'md',
          'csv',
          'tsv',
          'sql',
          'mmd',
        ],
      },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  await writeTextFile(path, content)
  return path
}

/**
 * Sanitizes a user-provided base filename (no extension) so it is safe to use
 * across platforms — strips path separators and other filesystem-illegal
 * characters, falling back to a generic name if nothing usable remains.
 */
export function sanitizeExportBasename(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9_.-]/g, '_')
  return /[a-zA-Z0-9]/.test(cleaned) ? cleaned : 'export'
}

/** Builds a sanitized `<basename>.<extension>` filename for exports. */
export function buildExportFilename(base: string, extension: string): string {
  return `${sanitizeExportBasename(base)}.${extension.replace(/^\./, '')}`
}

/**
 * Shared export helper for tool "download" actions. Opens the native save
 * dialog (same mechanism as the global save shortcut) and writes either text
 * or binary (Blob) content to the chosen path — no detached `<a download>`
 * anchors or `URL.createObjectURL`/`revokeObjectURL` calls required.
 *
 * Returns the saved path, or `null` if the user cancelled the dialog.
 */
export async function exportFile(data: string | Blob, defaultName: string): Promise<string | null> {
  const path = await save({ defaultPath: defaultName })
  if (!path) return null
  if (typeof data === 'string') {
    await writeTextFile(path, data)
  } else {
    const bytes = new Uint8Array(await data.arrayBuffer())
    await writeFile(path, bytes)
  }
  return path
}
