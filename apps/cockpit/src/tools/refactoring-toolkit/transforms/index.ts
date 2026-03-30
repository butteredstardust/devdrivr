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
]
