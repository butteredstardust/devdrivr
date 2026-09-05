import { describe, expect, it } from 'vitest'
import { descendantFolderIds, folderPath, isValidFolderParent } from '@/lib/resource-folders'
import type { ResourceFolder } from '@/types/models'

const folders: ResourceFolder[] = [
  {
    id: 'root',
    name: 'Inbox',
    parentId: null,
    kind: 'notes',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'child',
    name: 'Projects',
    parentId: 'root',
    kind: 'notes',
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'grandchild',
    name: 'Launch',
    parentId: 'child',
    kind: 'notes',
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
  },
]

describe('resource folder helpers', () => {
  it('collects a complete subtree for resource filtering', () => {
    expect([...descendantFolderIds(folders, 'root')]).toEqual(['root', 'child', 'grandchild'])
  })

  it('builds paths and rejects cyclic parents', () => {
    expect(folderPath(folders, 'grandchild')).toEqual(['Inbox', 'Projects', 'Launch'])
    expect(isValidFolderParent(folders, 'child', 'grandchild')).toBe(false)
    expect(isValidFolderParent(folders, 'child', null)).toBe(true)
  })
})
