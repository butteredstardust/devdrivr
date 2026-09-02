import { handleRpc } from './rpc'
import { computeDiff } from './diff.api'
import type { DiffOptions } from './diff.api'

const api = {
  computeDiff(left: string, right: string, options: DiffOptions = {}): string {
    return computeDiff(left, right, options)
  },
}

export type DiffWorker = typeof api

handleRpc(api)
