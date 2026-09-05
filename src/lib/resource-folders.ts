import type { ResourceFolder, ResourceKind } from '@/types/models'

export const INBOX_FOLDER_IDS = new Set(['notes-inbox', 'snippets-inbox', 'api-requests-inbox'])

export function isInboxFolder(folderId: string): boolean {
  return INBOX_FOLDER_IDS.has(folderId)
}

export function foldersForKind(folders: ResourceFolder[], kind: ResourceKind): ResourceFolder[] {
  return folders.filter((folder) => folder.kind === kind)
}

export function descendantFolderIds(folders: ResourceFolder[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }
  return ids
}

export function folderPath(folders: ResourceFolder[], folderId: string | null): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: string[] = []
  const visited = new Set<string>()
  let current = folderId ? byId.get(folderId) : undefined
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

export function isValidFolderParent(
  folders: ResourceFolder[],
  folderId: string,
  parentId: string | null
): boolean {
  if (parentId === null) return true
  if (folderId === parentId) return false
  return !descendantFolderIds(folders, folderId).has(parentId)
}
