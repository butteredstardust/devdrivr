import { invoke } from '@tauri-apps/api/core'

export type FileAssociationState = 'active' | 'inactive' | 'partial' | 'system'

export interface FileAssociationItem {
  id: string
  label: string
  detail: string
  status: FileAssociationState
}

export interface FileAssociationStatus {
  platform: string
  management: 'direct' | 'system'
  available: boolean
  items: FileAssociationItem[]
}

export function getFileAssociations(): Promise<FileAssociationStatus> {
  return invoke<FileAssociationStatus>('file_associations_status')
}

export function setFileAssociation(id: string, enabled: boolean): Promise<void> {
  return invoke('file_association_set', { id, enabled })
}
