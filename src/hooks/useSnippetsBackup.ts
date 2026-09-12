/**
 * WARNING: Check every import budget before any row is written. A backup is arbitrary local JSON,
 * parsed and mapped whole in renderer memory, so an unbounded file fails after the expensive part.
 *
 * WARNING: Create a folder parent before its children. The folder walk resolves each draft only
 * once its parent holds a new id.
 */
import { useCallback } from 'react'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { formatBytes } from '@/lib/format'
import { foldersForKind } from '@/lib/resource-folders'
import { useFoldersStore } from '@/stores/folders.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import type { ResourceFolder, Snippet, SnippetFragment } from '@/types/models'
import type { BackupReporter } from '@/hooks/useNotesBackup'

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_SNIPPETS = 5000
const MAX_IMPORT_FOLDERS = 5000
const MAX_SNIPPET_TITLE_CHARS = 2_000
const MAX_SNIPPET_CONTENT_CHARS = 500_000
const MAX_SNIPPET_DESCRIPTION_CHARS = 100_000
const MAX_SNIPPET_FRAGMENT_NAME_CHARS = 500
const MAX_SNIPPET_FRAGMENTS = 100
const MAX_SNIPPET_TAGS = 50

type ImportedSnippet = {
  title: string
  content: string
  language: string
  tags: string[]
  folder: string
  favorite: boolean
  folderId: string | null
  description: string
  fragments: SnippetFragment[]
}

function importedSnippet(item: unknown): ImportedSnippet | null {
  if (!item || typeof item !== 'object') return null
  const candidate = item as Record<string, unknown>
  if (typeof candidate['title'] !== 'string' || typeof candidate['content'] !== 'string') {
    return null
  }
  if (candidate['title'].length > MAX_SNIPPET_TITLE_CHARS)
    throw new Error('A snippet title exceeds the import limit')
  if (candidate['content'].length > MAX_SNIPPET_CONTENT_CHARS)
    throw new Error('A snippet body exceeds the import limit')
  if (
    typeof candidate['description'] === 'string' &&
    candidate['description'].length > MAX_SNIPPET_DESCRIPTION_CHARS
  ) {
    throw new Error('A snippet description exceeds the import limit')
  }
  if (
    Array.isArray(candidate['fragments']) &&
    candidate['fragments'].length > MAX_SNIPPET_FRAGMENTS
  ) {
    throw new Error('A snippet has too many fragments')
  }
  if (Array.isArray(candidate['tags']) && candidate['tags'].length > MAX_SNIPPET_TAGS) {
    throw new Error('A snippet has too many tags')
  }

  const now = Date.now()
  const fragments = Array.isArray(candidate['fragments'])
    ? candidate['fragments'].flatMap((value, index) => {
        if (!value || typeof value !== 'object') return []
        const fragment = value as Record<string, unknown>
        if (typeof fragment['content'] !== 'string') return []
        if (fragment['content'].length > MAX_SNIPPET_CONTENT_CHARS)
          throw new Error('A snippet fragment body exceeds the import limit')
        if (
          typeof fragment['name'] === 'string' &&
          fragment['name'].length > MAX_SNIPPET_FRAGMENT_NAME_CHARS
        ) {
          throw new Error('A snippet fragment name exceeds the import limit')
        }
        return [
          {
            id: crypto.randomUUID(),
            name: typeof fragment['name'] === 'string' ? fragment['name'] : 'fragment',
            content: fragment['content'],
            language: typeof fragment['language'] === 'string' ? fragment['language'] : 'text',
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
          },
        ]
      })
    : []

  return {
    title: candidate['title'],
    content: candidate['content'],
    language: typeof candidate['language'] === 'string' ? candidate['language'] : 'text',
    tags: Array.isArray(candidate['tags'])
      ? candidate['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [],
    folder: typeof candidate['folder'] === 'string' ? candidate['folder'] : '',
    folderId: typeof candidate['folderId'] === 'string' ? candidate['folderId'] : null,
    favorite:
      candidate['favorite'] === true ||
      candidate['favorite'] === 1 ||
      (Array.isArray(candidate['tags']) && candidate['tags'].includes('⭐')),
    description: typeof candidate['description'] === 'string' ? candidate['description'] : '',
    fragments:
      fragments.length > 0
        ? fragments
        : [
            {
              id: crypto.randomUUID(),
              name: 'main',
              content: candidate['content'],
              language: typeof candidate['language'] === 'string' ? candidate['language'] : 'text',
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
  }
}

function snippetSignature(snippet: {
  title: string
  content: string
  language?: string
  description?: string
  tags?: string[]
  favorite?: boolean
  folder?: string
  fragments?: Array<{ name?: string; content: string; language?: string }>
}): string {
  return JSON.stringify({
    title: snippet.title,
    description: snippet.description ?? '',
    tags: [...(snippet.tags ?? [])].sort(),
    favorite: !!snippet.favorite,
    folder: snippet.folder ?? '',
    fragments: (
      snippet.fragments ?? [
        { name: 'main', content: snippet.content, language: snippet.language ?? 'text' },
      ]
    ).map((fragment) => ({
      name: fragment.name ?? 'fragment',
      content: fragment.content,
      language: fragment.language ?? 'text',
    })),
  })
}

export type SnippetsBackupActions = {
  exportBackup: () => Promise<void>
  importBackup: () => Promise<string | null>
}

export function useSnippetsBackup(report: BackupReporter): SnippetsBackupActions {
  const exportBackup = useCallback(async () => {
    try {
      const snippets = useSnippetsStore.getState().snippets
      const folders = foldersForKind(useFoldersStore.getState().folders, 'snippets')
      const backup = { version: 3, folders, snippets }
      const path = await exportFile(
        JSON.stringify(backup, null, 2),
        buildExportFilename('devdrivr-snippets-backup', 'json')
      )
      if (path) {
        report(`Exported ${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`, 'success')
      }
    } catch {
      report('Export failed', 'error')
    }
  }, [report])

  const importBackup = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return null

      const bytes = new TextEncoder().encode(file.content).length
      if (bytes > MAX_IMPORT_BYTES) {
        report(
          `Import failed — file is ${formatBytes(bytes)}, above the ${formatBytes(MAX_IMPORT_BYTES)} limit`,
          'error'
        )
        return null
      }

      const parsed: unknown = JSON.parse(file.content)
      const envelope =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null
      const parsedItems = Array.isArray(parsed)
        ? parsed
        : (envelope?.['version'] === 2 || envelope?.['version'] === 3) &&
            Array.isArray(envelope['snippets'])
          ? envelope['snippets']
          : null
      if (!parsedItems) throw new Error('Expected a snippets array or version 2 library')
      if (parsedItems.length > MAX_IMPORT_SNIPPETS) {
        report(
          `Import failed — ${parsedItems.length} snippets exceeds the ${MAX_IMPORT_SNIPPETS} snippet limit`,
          'error'
        )
        return null
      }

      const validSnippets = parsedItems
        .map((item) => importedSnippet(item))
        .filter((item): item is NonNullable<typeof item> => item !== null)
      if (validSnippets.length === 0) throw new Error('No valid snippets')

      const existing = new Set(useSnippetsStore.getState().snippets.map(snippetSignature))
      const uniqueSnippets = validSnippets.filter((item) => {
        const key = snippetSignature(item)
        if (existing.has(key)) return false
        existing.add(key)
        return true
      })
      if (uniqueSnippets.length === 0) {
        report('No new snippets to import', 'info')
        return null
      }

      const folderIdMap = new Map<string, string>()
      const availableFolders = foldersForKind(useFoldersStore.getState().folders, 'snippets')
      const foldersToCreate: ResourceFolder[] = []
      const folderDrafts = Array.isArray(envelope?.['folders'])
        ? envelope['folders']
            .map((value) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>) : null
            )
            .filter((value): value is Record<string, unknown> => value !== null)
        : []
      if (folderDrafts.length > MAX_IMPORT_FOLDERS) {
        throw new Error(`Backup has more than ${MAX_IMPORT_FOLDERS} folders`)
      }
      const seenFolderIds = new Set<string>()
      for (const draft of folderDrafts) {
        const id = typeof draft['id'] === 'string' ? draft['id'] : ''
        const name = typeof draft['name'] === 'string' ? draft['name'].trim() : ''
        if (!id || seenFolderIds.has(id) || !name || name.length > MAX_SNIPPET_TITLE_CHARS) {
          throw new Error('Backup contains an invalid snippet folder')
        }
        seenFolderIds.add(id)
      }

      const unresolved = [...folderDrafts].reverse()
      while (unresolved.length > 0) {
        const before = unresolved.length
        for (let index = unresolved.length - 1; index >= 0; index--) {
          const draft = unresolved[index]
          if (!draft) continue
          const oldId = typeof draft['id'] === 'string' ? draft['id'] : null
          const name = typeof draft['name'] === 'string' ? draft['name'].trim() : ''
          const oldParentId = typeof draft['parentId'] === 'string' ? draft['parentId'] : null
          if (!oldId || !name || (oldParentId && !folderIdMap.has(oldParentId))) continue
          const parentId = oldParentId ? (folderIdMap.get(oldParentId) ?? null) : null
          const existingFolder = availableFolders.find(
            (folder) => folder.name === name && folder.parentId === parentId
          )
          const now = Date.now()
          const resolved: ResourceFolder = existingFolder ?? {
            id: crypto.randomUUID(),
            name,
            kind: 'snippets',
            parentId,
            sortOrder: typeof draft['sortOrder'] === 'number' ? draft['sortOrder'] : now,
            createdAt: now,
            updatedAt: now,
            ...(typeof draft['defaultLanguage'] === 'string'
              ? { defaultLanguage: draft['defaultLanguage'] }
              : {}),
          }
          if (!existingFolder) {
            availableFolders.push(resolved)
            foldersToCreate.push(resolved)
          }
          folderIdMap.set(oldId, resolved.id)
          unresolved.splice(index, 1)
        }
        if (unresolved.length === before) break
      }
      if (unresolved.length > 0) throw new Error('Backup contains an invalid folder hierarchy')

      const hasFolderManifest = Array.isArray(envelope?.['folders'])
      const importedSnippets = uniqueSnippets.map((item): Snippet => {
        let folderId = item.folderId ? folderIdMap.get(item.folderId) : undefined
        if (hasFolderManifest && item.folderId && !folderId) {
          throw new Error('Backup contains a snippet with a missing folder')
        }
        if (!folderId && item.folder) {
          let folder = availableFolders.find(
            (candidate) => candidate.parentId === null && candidate.name === item.folder
          )
          if (!folder) {
            const now = Date.now()
            folder = {
              id: crypto.randomUUID(),
              name: item.folder,
              kind: 'snippets',
              parentId: null,
              sortOrder: now,
              createdAt: now,
              updatedAt: now,
            }
            availableFolders.push(folder)
            foldersToCreate.push(folder)
          }
          folderId = folder.id
        }
        const now = Date.now()
        return {
          id: crypto.randomUUID(),
          title: item.title,
          content: item.content,
          language: item.language,
          tags: item.tags,
          folder: item.folder,
          favorite: item.favorite,
          folderId: folderId ?? 'snippets-inbox',
          description: item.description,
          fragments: item.fragments,
          createdAt: now,
          updatedAt: now,
        }
      })
      await useSnippetsStore.getState().importBatch(foldersToCreate, importedSnippets)

      const skipped = validSnippets.length - uniqueSnippets.length
      report(
        `Imported ${importedSnippets.length} snippet${importedSnippets.length === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}`,
        'success'
      )
      return importedSnippets[0]?.id ?? null
    } catch {
      report('Import failed — choose a valid snippets JSON file', 'error')
      return null
    }
  }, [report])

  return { exportBackup, importBackup }
}
