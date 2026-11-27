import { load } from 'js-yaml'

const MAX_YAML_EXPANDED_NODES = 1_000_000

export function parseYaml(content: string): unknown {
  let parsed: unknown
  try {
    parsed = load(content)
  } catch {
    return null
  }
  assertYamlExpansionBounded(parsed)
  return parsed
}

/**
 * Rejects a YAML document whose anchors expand past the node limit or form a cycle.
 *
 * YAML anchors let a file of a few KB describe millions of nodes, or an object that contains itself.
 * Every importer walks the parsed tree without limits, so the check runs here, before any walk.
 * Shared subtrees are counted once per reference, and sizes are memoised, so the check is linear.
 */
function assertYamlExpansionBounded(root: unknown): void {
  const sizes = new Map<object, number>()
  const inProgress = new Set<object>()
  const expandedSize = (value: unknown): number => {
    if (typeof value !== 'object' || value === null) return 1
    const known = sizes.get(value)
    if (known !== undefined) return known
    if (inProgress.has(value)) throw new Error('Import failed - YAML anchors form a cycle')
    inProgress.add(value)
    let size = 1
    for (const child of Object.values(value)) {
      size += expandedSize(child)
      if (size > MAX_YAML_EXPANDED_NODES) {
        throw new Error('Import failed - YAML anchors expand past the size limit')
      }
    }
    inProgress.delete(value)
    sizes.set(value, size)
    return size
  }
  expandedSize(root)
}
