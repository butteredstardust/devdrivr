import { handleRpc } from './rpc'
import { applyTransforms, type CustomCodemod } from './refactoring.api'

const api = {
  applyTransforms(
    code: string,
    transformIds: string[],
    parser: 'babel' | 'tsx',
    custom?: CustomCodemod
  ): string {
    return applyTransforms(code, transformIds, parser, custom)
  },
}

export type RefactoringWorker = typeof api

handleRpc(api)
