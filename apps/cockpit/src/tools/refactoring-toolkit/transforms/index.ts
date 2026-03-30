import type { Collection, JSCodeshift } from 'jscodeshift'

export type TransformCategory = 'modernize' | 'safety' | 'cleanup'
export type SafetyLevel = 'safe' | 'caution' | 'destructive'

export type Transform = {
  id: string
  name: string
  description: string
  category: TransformCategory
  safety: SafetyLevel
  languages: string[]
  apply: (root: Collection, j: JSCodeshift) => void
}

export const TRANSFORMS: Transform[] = [
  // ── Modernize ──────────────────────────────────────────────
  {
    id: 'var-to-const',
    name: 'var → const/let',
    description: 'Convert var declarations to const (or let if reassigned)',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root.find(j.VariableDeclaration, { kind: 'var' }).forEach((path) => {
        const names = path.node.declarations
          .map((d) => (d.id.type === 'Identifier' ? d.id.name : null))
          .filter((n): n is string => n !== null)

        const isReassigned = names.some((name) => {
          let found = false
          root.find(j.AssignmentExpression).forEach((assignPath) => {
            const left = assignPath.node.left
            if (left.type === 'Identifier' && left.name === name) found = true
          })
          return found
        })

        path.node.kind = isReassigned ? 'let' : 'const'
      })
    },
  },
  {
    id: 'arrow-functions',
    name: 'Arrow functions',
    description: 'Convert anonymous function expressions to arrow functions',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.FunctionExpression)
        .filter((path) => {
          if (path.node.id) return false // skip named function expressions
          const parent = path.parent.node
          return (
            parent.type !== 'Property' &&
            parent.type !== 'MethodDefinition' &&
            parent.type !== 'ObjectMethod' &&
            parent.type !== 'ClassMethod'
          )
        })
        .forEach((path) => {
          j(path).replaceWith(
            j.arrowFunctionExpression(path.node.params, path.node.body, false)
          )
        })
    },
  },
  {
    id: 'template-literals',
    name: 'Template literals',
    description: "Convert 'string' + identifier concatenation to template literals",
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.BinaryExpression, { operator: '+' })
        .filter((path) => {
          const { left, right } = path.node
          const isString =
            left.type === 'StringLiteral' ||
            (left.type === 'Literal' && typeof (left as { value: unknown }).value === 'string')
          return isString && (right.type === 'Identifier' || right.type === 'MemberExpression')
        })
        .forEach((path) => {
          const { left, right } = path.node
          const strValue =
            left.type === 'StringLiteral'
              ? (left as { value: string }).value
              : String((left as { value: unknown }).value)
          j(path).replaceWith(
            j.templateLiteral(
              [
                j.templateElement({ cooked: strValue, raw: strValue }, false),
                j.templateElement({ cooked: '', raw: '' }, true),
              ],
              [right]
            )
          )
        })
    },
  },
]
