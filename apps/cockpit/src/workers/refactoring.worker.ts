import { handleRpc } from './rpc'
import jscodeshift from 'jscodeshift'
import { TRANSFORMS } from '@/tools/refactoring-toolkit/transforms'

const api = {
  applyTransforms(code: string, transformIds: string[], parser: 'babel' | 'tsx'): string {
    const hasTrailingCommas = transformIds.includes('trailing-commas')
    const j = jscodeshift.withParser(parser)
    const root = j(code)

    for (const id of transformIds) {
      const transform = TRANSFORMS.find((t) => t.id === id)
      if (transform) transform.apply(root, j)
    }

    return root.toSource(hasTrailingCommas ? { trailingComma: true } : {})
  },
}

export type RefactoringWorker = typeof api

handleRpc(api)
