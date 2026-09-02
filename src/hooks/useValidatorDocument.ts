import { useRef, type MutableRefObject } from 'react'
import { useTabDirty } from '@/hooks/useTabDirty'

export type PendingValidatorDocument = {
  input: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  successMessage: string
}

/** Shared saved-document lifecycle for validator-style source tools. */
export function useValidatorDocument(
  input: string,
  savedContent: string | null
): {
  hasInput: boolean
  isDirty: boolean
  userEditedRef: MutableRefObject<boolean>
} {
  const userEditedRef = useRef(false)
  const hasInput = input.trim().length > 0
  const isDirty = savedContent === null ? userEditedRef.current && hasInput : input !== savedContent
  useTabDirty(isDirty)
  return { hasInput, isDirty, userEditedRef }
}
