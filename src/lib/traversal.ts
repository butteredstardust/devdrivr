import { formatBytes } from '@/lib/format'

/**
 * Shared traversal budgets for tools that walk arbitrary parsed documents.
 *
 * Depth alone is not enough: YAML aliases and JSON produced by a generator can resolve to a
 * small tree with an exponential traversal, so every walker also spends a visit budget. Both
 * limits sit far above anything a person writes by hand.
 */
export const MAX_TRAVERSAL_DEPTH = 1000
export const MAX_TRAVERSAL_VISITS = 200_000

export type DocumentStats = {
  keys: number
  depth: number
  size: string
  /** True when a budget stopped the walk, so the numbers above are lower bounds. */
  truncated: boolean
}

/**
 * Key/depth/size statistics for one or more parsed documents, bounded so a deeply nested or
 * alias-expanded document cannot overflow the stack or freeze the renderer.
 */
export function documentStats(documents: unknown[]): DocumentStats {
  let keyCount = 0
  let maxDepth = 0
  let visits = 0
  let truncated = false

  function walk(val: unknown, depth: number) {
    if (depth > MAX_TRAVERSAL_DEPTH || ++visits > MAX_TRAVERSAL_VISITS) {
      truncated = true
      return
    }
    if (depth > maxDepth) maxDepth = depth
    if (Array.isArray(val)) {
      for (const item of val) walk(item, depth + 1)
    } else if (val !== null && typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>)
      keyCount += entries.length
      for (const [, v] of entries) walk(v, depth + 1)
    }
  }

  try {
    for (const document of documents) walk(document, 0)
    const bytes = new Blob([JSON.stringify(documents)]).size
    return { keys: keyCount, depth: maxDepth, size: formatBytes(bytes), truncated }
  } catch {
    // Cyclic or non-serializable input — the counts gathered so far are still useful.
    return { keys: keyCount, depth: maxDepth, size: '0 B', truncated: true }
  }
}

/**
 * Recursively sorts object keys under the same budgets as {@link documentStats}. Subtrees past
 * a budget are returned by reference rather than copied, so the operation always terminates.
 */
export function sortKeysDeepBounded(data: unknown): unknown {
  let visits = 0

  function sort(value: unknown, depth: number): unknown {
    if (depth > MAX_TRAVERSAL_DEPTH || ++visits > MAX_TRAVERSAL_VISITS) return value
    if (Array.isArray(value)) return value.map((item) => sort(item, depth + 1))
    if (value !== null && typeof value === 'object') {
      const source = value as Record<string, unknown>
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(source).sort()) sorted[key] = sort(source[key], depth + 1)
      return sorted
    }
    return value
  }

  return sort(data, 0)
}
