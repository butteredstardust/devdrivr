import { handleRpc } from './rpc'
import { applyTransforms } from './refactoring.api'

const api = {
  applyTransforms(code: string, transformIds: string[], parser: 'babel' | 'tsx'): string {
    return applyTransforms(code, transformIds, parser)
  },
}

export type RefactoringWorker = typeof api

handleRpc(api)
