/**
 * Pure jscodeshift transform-application logic shared by the refactoring
 * worker and its test-environment mock. Lives in its own module (no `self`
 * reference) so it can run identically on the worker thread and in-process
 * under Vitest.
 */
import jscodeshift from 'jscodeshift'
import { TRANSFORMS } from '@/tools/refactoring-toolkit/transforms'

export type CustomCodemod = { identifierFrom: string; identifierTo: string }

export function applyTransforms(
  code: string,
  transformIds: string[],
  parser: 'babel' | 'tsx',
  custom?: CustomCodemod
): string {
  const hasTrailingCommas = transformIds.includes('trailing-commas')
  const j = jscodeshift.withParser(parser)
  const root = j(code)

  for (const id of transformIds) {
    const transform = TRANSFORMS.find((t) => t.id === id)
    if (transform) transform.apply(root, j)
  }

  if (custom) {
    const identifier = /^[$A-Z_a-z][$\w]*$/
    if (!identifier.test(custom.identifierFrom) || !identifier.test(custom.identifierTo)) {
      throw new Error('Custom codemod names must be valid JavaScript identifiers')
    }
    // Preserve public/object property names while renaming bindings and
    // references. Shorthand properties must first become `{ old: renamed }`;
    // mutating their shared key/value identifier would silently change data
    // shape as well as the variable.
    root
      .find(j.Property, {
        shorthand: true,
        key: { type: 'Identifier', name: custom.identifierFrom },
      })
      .forEach((path) => {
        path.node.shorthand = false
        path.node.value = j.identifier(custom.identifierTo)
      })
    root.find(j.Identifier, { name: custom.identifierFrom }).forEach((path) => {
      const parent = path.parent.node as { type?: string; computed?: boolean }
      const position = String(path.name)
      const isStaticProperty =
        (position === 'key' || position === 'property') && parent.computed !== true
      const isExternalName = position === 'imported' || position === 'exported'
      const isLabel = position === 'label'
      if (!isStaticProperty && !isExternalName && !isLabel) path.node.name = custom.identifierTo
    })
  }

  return root.toSource(hasTrailingCommas ? { trailingComma: true } : {})
}
