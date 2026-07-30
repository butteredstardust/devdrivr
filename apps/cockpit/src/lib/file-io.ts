import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

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

export async function openFileDialog(): Promise<{ content: string; filename: string } | null> {
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
          'css',
          'js',
          'ts',
          'md',
          'yaml',
          'yml',
          'proto',
          'graphql',
          'gql',
          'sql',
          'csv',
          'svg',
        ],
      },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  const filePath = typeof path === 'string' ? path : path[0]
  if (!filePath) return null
  const content = await readSupportedTextFile(filePath)
  return { content, filename: filenameFromPath(filePath) }
}

export async function saveFileDialog(
  content: string,
  defaultName?: string
): Promise<string | null> {
  const path = await save({
    ...(defaultName !== undefined && { defaultPath: defaultName }),
    filters: [
      { name: 'Text', extensions: ['txt', 'json', 'xml', 'html', 'css', 'js', 'ts', 'md'] },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (!path) return null
  await writeTextFile(path, content)
  return path
}
