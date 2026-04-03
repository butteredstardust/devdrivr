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

export const CATEGORIES: { id: TransformCategory; label: string }[] = [
  { id: 'modernize', label: 'Modernize' },
  { id: 'safety', label: 'Type Safety' },
  { id: 'cleanup', label: 'Cleanup' },
]

export const SAFETY_COLORS: Record<SafetyLevel, string> = {
  safe: 'var(--color-success)',
  caution: 'var(--color-warning)',
  destructive: 'var(--color-error)',
}

export const SAFETY_LABELS: Record<SafetyLevel, string> = {
  safe: 'Safe — no semantic changes',
  caution: 'Caution — verify behaviour after applying',
  destructive: 'Destructive — removes code',
}

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
]

// Duck-typed helpers to avoid j.X namespace collisions inside function bodies
type Named = { name: string }
type Valued = { value: unknown }
type WithProperties = { properties: unknown[] }
type Declarator = VariableDeclarator_
type VariableDeclarator_ = {
  type: 'VariableDeclarator'
  id: { type: string; name?: string }
  init: { type: string; callee: unknown; arguments: unknown[] } | null | undefined
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
          .map((d) => {
            const decl = d as unknown as { id: { type: string; name?: string } }
            return decl.id.type === 'Identifier' && decl.id.name ? decl.id.name : null
          })
          .filter((n): n is string => n !== null)

        const isReassigned = names.some((name) => {
          let found = false
          root.find(j.AssignmentExpression).forEach((assignPath) => {
            const left = assignPath.node.left as unknown as Named
            if (assignPath.node.left.type === 'Identifier' && left.name === name) found = true
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
          j(path).replaceWith(j.arrowFunctionExpression(path.node.params, path.node.body, false))
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
            (left.type === 'Literal' && typeof (left as unknown as Valued).value === 'string')
          return isString && (right.type === 'Identifier' || right.type === 'MemberExpression')
        })
        .forEach((path) => {
          const { left, right } = path.node
          const strValue = String((left as unknown as Valued).value)
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
  {
    id: 'optional-chaining',
    name: 'Optional chaining',
    description: 'Convert a && a.b patterns to a?.b',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.LogicalExpression, { operator: '&&' })
        .filter((path) => {
          const { left, right } = path.node
          return (
            left.type === 'Identifier' &&
            right.type === 'MemberExpression' &&
            right.object.type === 'Identifier' &&
            (right.object as unknown as Named).name === (left as unknown as Named).name
          )
        })
        .forEach((path) => {
          const right = path.node.right
          if (right.type !== 'MemberExpression') return
          j(path).replaceWith(j.optionalMemberExpression(right.object, right.property, false, true))
        })
    },
  },
  {
    id: 'require-to-import',
    name: 'require → import',
    description: 'Convert CommonJS require() to ES module import',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.VariableDeclaration)
        .filter((path) => {
          const { declarations } = path.node
          if (declarations.length !== 1) return false
          const d = declarations[0] as unknown as Declarator
          if (d.type !== 'VariableDeclarator') return false
          const init = d.init
          if (!init || init.type !== 'CallExpression') return false
          const callee = init.callee as unknown as Named
          const args = init.arguments as unknown[]
          return (
            (init.callee as { type: string }).type === 'Identifier' &&
            callee.name === 'require' &&
            args.length === 1 &&
            ['StringLiteral', 'Literal'].includes((args[0] as { type: string }).type) &&
            d.id.type === 'Identifier'
          )
        })
        .forEach((path) => {
          const d = path.node.declarations[0] as unknown as Declarator
          if (!d || d.type !== 'VariableDeclarator' || !d.init) return
          const args = d.init.arguments as Array<{ type: string } & Valued>
          const sourceValue = args[0]?.value
          if (typeof sourceValue !== 'string') return
          const name = (d.id as Named).name
          if (!name) return
          j(path).replaceWith(
            j.importDeclaration(
              [j.importDefaultSpecifier(j.identifier(name))],
              j.literal(sourceValue)
            )
          )
        })
    },
  },
  {
    id: 'spread-operator',
    name: 'Object.assign → spread',
    description: 'Convert Object.assign({}, x) to { ...x }',
    category: 'modernize',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.CallExpression)
        .filter((path) => {
          const { callee, arguments: args } = path.node
          if (callee.type !== 'MemberExpression') return false
          const obj = callee.object as unknown as Named
          const prop = callee.property as unknown as Named
          return (
            callee.object.type === 'Identifier' &&
            obj.name === 'Object' &&
            callee.property.type === 'Identifier' &&
            prop.name === 'assign' &&
            args.length === 2 &&
            args[0] !== undefined &&
            args[0] !== null &&
            args[0].type === 'ObjectExpression' &&
            (args[0] as unknown as WithProperties).properties.length === 0
          )
        })
        .forEach((path) => {
          const source = path.node.arguments[1]
          if (!source || source.type === 'SpreadElement') return
          j(path).replaceWith(
            j.objectExpression([j.spreadElement(source as Parameters<typeof j.spreadElement>[0])])
          )
        })
    },
  },
  // ── Type Safety ────────────────────────────────────────────
  {
    id: 'strict-equality',
    name: '== → ===',
    description: 'Convert loose equality to strict equality',
    category: 'safety',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root.find(j.BinaryExpression, { operator: '==' }).forEach((path) => {
        path.node.operator = '==='
      })
      root.find(j.BinaryExpression, { operator: '!=' }).forEach((path) => {
        path.node.operator = '!=='
      })
    },
  },
  {
    id: 'nullish-coalescing',
    name: '|| → ?? (nullish)',
    description: 'Convert || to ?? when the right-hand side is a literal default',
    category: 'safety',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.LogicalExpression, { operator: '||' })
        .filter((path) => {
          const { right } = path.node
          return [
            'StringLiteral',
            'Literal',
            'NumericLiteral',
            'BooleanLiteral',
            'NullLiteral',
            'ArrayExpression',
            'ObjectExpression',
          ].includes(right.type)
        })
        .forEach((path) => {
          path.node.operator = '??'
        })
    },
  },
  // ── Cleanup ────────────────────────────────────────────────
  {
    id: 'remove-console',
    name: 'Remove console.*',
    description: 'Remove console.log/debug/warn/info/error statements',
    category: 'cleanup',
    safety: 'destructive',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.ExpressionStatement)
        .filter((path) => {
          const { expression } = path.node
          return (
            expression.type === 'CallExpression' &&
            expression.callee.type === 'MemberExpression' &&
            expression.callee.object.type === 'Identifier' &&
            (expression.callee.object as unknown as Named).name === 'console'
          )
        })
        .remove()
    },
  },
  {
    id: 'remove-debugger',
    name: 'Remove debugger',
    description: 'Remove debugger statements',
    category: 'cleanup',
    safety: 'destructive',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root.find(j.DebuggerStatement).remove()
    },
  },
  {
    id: 'trailing-commas',
    name: 'Add trailing commas',
    description: 'Add trailing commas to multi-line arrays and objects',
    category: 'cleanup',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      // Force recast to reprint multi-line arrays and objects so the worker's
      // toSource({ trailingComma: true }) option takes effect on them.
      root
        .find(j.ArrayExpression)
        .filter((path) => {
          const { loc } = path.node
          return (
            path.node.elements.length > 0 &&
            loc !== null &&
            loc !== undefined &&
            loc.start.line !== loc.end.line
          )
        })
        .forEach((path) => {
          path.node.elements = [...path.node.elements]
        })
      root
        .find(j.ObjectExpression)
        .filter((path) => {
          const { loc } = path.node
          return (
            path.node.properties.length > 0 &&
            loc !== null &&
            loc !== undefined &&
            loc.start.line !== loc.end.line
          )
        })
        .forEach((path) => {
          path.node.properties = [...path.node.properties]
        })
    },
  },
  {
    id: 'promise-to-async',
    name: 'Promise.then → async/await',
    description: 'Convert .then(fn).catch(fn) chains to async/await with try/catch',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.CallExpression, {
          callee: {
            type: 'MemberExpression',
            property: { type: 'Identifier', name: 'catch' },
          },
        })
        .filter((path) => {
          const callee = path.node.callee as unknown as {
            type: string
            object: {
              type: string
              callee: { type: string; property: { type: string; name: string } }
            }
          }
          if (callee.type !== 'MemberExpression') return false
          const thenCall = callee.object
          return (
            thenCall.type === 'CallExpression' &&
            thenCall.callee.type === 'MemberExpression' &&
            thenCall.callee.property.type === 'Identifier' &&
            thenCall.callee.property.name === 'then'
          )
        })
        .forEach((path) => {
          const catchCallee = path.node.callee as unknown as { object: unknown }
          const thenCall = catchCallee.object as unknown as {
            callee: { object: unknown }
            arguments: unknown[]
          }
          const originalExpr = (thenCall.callee as { object: unknown }).object
          const thenFn = thenCall.arguments[0]
          const catchFn = path.node.arguments[0]

          if (!thenFn || !catchFn) return

          const resultId = j.identifier('_result')
          const errorId = j.identifier('_error')

          const tryCatch = j.tryStatement(
            j.blockStatement([
              j.variableDeclaration('const', [
                j.variableDeclarator(
                  resultId,
                  j.awaitExpression(originalExpr as Parameters<typeof j.awaitExpression>[0])
                ),
              ]),
              j.expressionStatement(
                j.callExpression(thenFn as Parameters<typeof j.callExpression>[0], [resultId])
              ),
            ]),
            j.catchClause(
              errorId,
              null,
              j.blockStatement([
                j.expressionStatement(
                  j.callExpression(catchFn as Parameters<typeof j.callExpression>[0], [errorId])
                ),
              ])
            )
          )

          const asyncFn = j.arrowFunctionExpression([], j.blockStatement([tryCatch]))
          asyncFn.async = true
          j(path).replaceWith(j.callExpression(asyncFn, []))
        })
    },
  },
]
