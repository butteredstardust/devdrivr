import { handleRpc } from './rpc'
import { createTwoFilesPatch } from 'diff'

type DiffOptions = {
  ignoreWhitespace?: boolean
  jsonMode?: boolean
}

const api = {
  computeDiff(left: string, right: string, options: DiffOptions = {}): string {
    let a = left
    let b = right

    if (options.jsonMode) {
      try {
        a = JSON.stringify(JSON.parse(a), null, 2)
        b = JSON.stringify(JSON.parse(b), null, 2)
      } catch {
        // If not valid JSON, diff as-is
      }
    }

    return createTwoFilesPatch('left', 'right', a, b, undefined, undefined, {
      ignoreWhitespace: options.ignoreWhitespace,
    })
  },
}

export type DiffWorker = typeof api

handleRpc(api)
