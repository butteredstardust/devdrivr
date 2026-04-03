import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

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
  const content = await readTextFile(filePath)
  const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
  return { content, filename }
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
