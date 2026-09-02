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

/**
 * Tailwind classes, not raw `var(...)` strings for an inline `style`.
 *
 * The values were always CSS variables, so the inline style bought nothing and cost the usual
 * things: no variant states, and a `style` attribute that overrides any class a caller adds.
 */
export const SAFETY_TEXT_CLASSES: Record<SafetyLevel, string> = {
  safe: 'text-[var(--color-success)]',
  caution: 'text-[var(--color-warning)]',
  destructive: 'text-[var(--color-error)]',
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
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root.find(j.VariableDeclaration, { kind: 'var' }).forEach((path) => {
        const parent = path.parent.node
        const grandparent = path.parent.parent?.node
        const isFunctionBody =
          parent.type === 'BlockStatement' &&
          grandparent !== undefined &&
          [
            'FunctionDeclaration',
            'FunctionExpression',
            'ArrowFunctionExpression',
            'ObjectMethod',
            'ClassMethod',
          ].includes(grandparent.type)
        if (parent.type !== 'Program' && !isFunctionBody) return

        const names = path.node.declarations
          .map((d) => {
            const decl = d as unknown as { id: { type: string; name?: string } }
            return decl.id.type === 'Identifier' && decl.id.name ? decl.id.name : null
          })
          .filter((n): n is string => n !== null)
        if (names.length !== path.node.declarations.length) return

        const declarationLine = path.node.loc?.start.line
        const hasPreDeclarationReference = names.some((name) => {
          const declarationScope = path.scope.lookup(name)
          if (!declarationScope || declarationLine === undefined) return true
          let found = false
          root.find(j.Identifier, { name }).forEach((identifierPath) => {
            const firstDeclarator = path.node.declarations[0] as unknown as
              | { id?: unknown }
              | undefined
            if (found || identifierPath.node === firstDeclarator?.id) return
            const line = identifierPath.node.loc?.start.line
            if (line === undefined || line >= declarationLine) return
            if (identifierPath.scope.lookup(name) === declarationScope) found = true
          })
          return found
        })
        if (hasPreDeclarationReference) return

        const isReassigned = names.some((name) => {
          const declarationScope = path.scope.lookup(name)
          if (!declarationScope) return true
          let found = false
          root.find(j.AssignmentExpression).forEach((assignPath) => {
            const left = assignPath.node.left as unknown as Named
            if (
              assignPath.node.left.type === 'Identifier' &&
              left.name === name &&
              assignPath.scope.lookup(name) === declarationScope
            ) {
              found = true
            }
          })
          root.find(j.UpdateExpression).forEach((updatePath) => {
            const argument = updatePath.node.argument as unknown as Named
            if (
              updatePath.node.argument.type === 'Identifier' &&
              argument.name === name &&
              updatePath.scope.lookup(name) === declarationScope
            ) {
              found = true
            }
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
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.FunctionExpression)
        .filter((path) => {
          if (path.node.id) return false // skip named function expressions
          const parent = path.parent.node
          const supportedParent =
            parent.type !== 'Property' &&
            parent.type !== 'MethodDefinition' &&
            parent.type !== 'ObjectMethod' &&
            parent.type !== 'ClassMethod'
          if (!supportedParent) return false

          const subtree = j(path)
          const usesDynamicContext =
            subtree.find(j.ThisExpression).size() > 0 ||
            subtree.find(j.Super).size() > 0 ||
            subtree.find(j.MetaProperty).size() > 0 ||
            subtree.find(j.Identifier, { name: 'arguments' }).size() > 0
          return !usesDynamicContext
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
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const callee = init.callee as unknown as Named // jscodeshift AST node — needs explicit cast
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const args = init.arguments as unknown[] // jscodeshift AST node — needs explicit cast
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            j.objectExpression([j.spreadElement(source as Parameters<typeof j.spreadElement>[0])])
          )
        })
    },
  },
  {
    id: 'function-declaration-to-arrow',
    name: 'Function declarations → arrows',
    description: 'Convert non-generator function declarations to const arrow functions',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.FunctionDeclaration)
        .filter((path) => Boolean(path.node.id) && !path.node.generator)
        .forEach((path) => {
          const declaration = path.node
          if (!declaration.id) return
          const arrow = j.arrowFunctionExpression(declaration.params, declaration.body, false)
          if (declaration.async !== undefined) arrow.async = declaration.async
          const typedArrow = arrow as typeof arrow & {
            returnType?: unknown
            typeParameters?: unknown
          }
          if (declaration.returnType !== undefined) typedArrow.returnType = declaration.returnType
          if (declaration.typeParameters !== undefined) {
            typedArrow.typeParameters = declaration.typeParameters
          }
          j(path).replaceWith(
            j.variableDeclaration('const', [
              j.variableDeclarator(j.identifier(declaration.id.name), arrow),
            ])
          )
        })
    },
  },
  {
    id: 'foreach-to-for-of',
    name: 'forEach → for…of',
    description: 'Convert simple block-bodied forEach callbacks to for…of loops',
    category: 'modernize',
    safety: 'caution',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root.find(j.ExpressionStatement).forEach((path) => {
        const expression = path.node.expression
        if (expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression')
          return
        const property = expression.callee.property as unknown as Named
        if (expression.callee.computed || property.name !== 'forEach') return
        const callback = expression.arguments[0]
        if (
          !callback ||
          (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') ||
          callback.params.length !== 1 ||
          callback.params[0]?.type !== 'Identifier' ||
          callback.body.type !== 'BlockStatement' ||
          callback.async
        )
          return
        if (expression.callee.object.type === 'Super') return
        j(path).replaceWith(
          j.forOfStatement(
            j.variableDeclaration('const', [
              j.variableDeclarator(j.identifier(callback.params[0].name), null),
            ]),
            expression.callee.object,
            callback.body
          )
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
    safety: 'caution',
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
      const callableTypes = new Set(['Identifier', 'ArrowFunctionExpression', 'FunctionExpression'])
      const uniqueIdentifier = (base: string) => {
        let candidate = base
        let suffix = 1
        while (root.find(j.Identifier, { name: candidate }).size() > 0) {
          candidate = `${base}${suffix}`
          suffix += 1
        }
        return j.identifier(candidate)
      }

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
          const catchCallee = path.node.callee as unknown as { object: unknown } // jscodeshift AST
          const thenCall = catchCallee.object as {
            callee: { object: unknown }
            arguments: unknown[]
          }
          const originalExpr = thenCall.callee.object
          const thenFn = thenCall.arguments[0] as { type?: string } | undefined
          const catchFn = path.node.arguments[0] as unknown as { type?: string } | undefined

          if (
            !thenFn?.type ||
            !catchFn?.type ||
            !callableTypes.has(thenFn.type) ||
            !callableTypes.has(catchFn.type)
          )
            return

          const resultId = uniqueIdentifier('_result')
          const errorId = uniqueIdentifier('_error')

          const thenResult = j.awaitExpression(
            j.callExpression(thenFn as Parameters<typeof j.callExpression>[0], [resultId])
          )
          const catchResult = j.awaitExpression(
            j.callExpression(catchFn as Parameters<typeof j.callExpression>[0], [errorId])
          )

          const isStandalone =
            path.parent.node.type === 'ExpressionStatement' &&
            path.parent.parent?.node.type === 'Program'

          const tryCatch = j.tryStatement(
            j.blockStatement([
              j.variableDeclaration('const', [
                j.variableDeclarator(
                  resultId,
                  j.awaitExpression(originalExpr as Parameters<typeof j.awaitExpression>[0])
                ),
              ]),
              isStandalone ? j.expressionStatement(thenResult) : j.returnStatement(thenResult),
            ]),
            j.catchClause(
              errorId,
              null,
              j.blockStatement([
                isStandalone ? j.expressionStatement(catchResult) : j.returnStatement(catchResult),
              ])
            )
          )

          // A standalone chain at module scope can use top-level await directly.
          // Keep the async-IIFE fallback when the chain is nested in another
          // expression, where replacing it with statements would be invalid.
          if (isStandalone) {
            j(path.parent).replaceWith(tryCatch)
          } else {
            const asyncFn = j.arrowFunctionExpression([], j.blockStatement([tryCatch]))
            asyncFn.async = true
            j(path).replaceWith(j.callExpression(asyncFn, []))
          }
        })
    },
  },
]
