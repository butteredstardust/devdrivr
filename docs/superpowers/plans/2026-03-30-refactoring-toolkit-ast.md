# Refactoring Toolkit — AST Transforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all regex-based transforms in the Refactoring Toolkit with proper AST transforms using jscodeshift, and add the missing Promise.then→async/await transform.

**Architecture:** A Web Worker (`src/workers/refactoring.worker.ts`) owns jscodeshift and applies transforms via the existing `handleRpc` protocol. Pure transform functions live in `src/tools/refactoring-toolkit/transforms/index.ts` and are imported by both the worker and the component (component uses metadata only; worker calls `apply`). The UI layer becomes async, using `useWorker` exactly like the TypeScript Playground tool does.

**Tech Stack:** jscodeshift 17.x (already installed), Vitest (already configured), existing `useWorker` hook + `handleRpc` protocol.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tools/refactoring-toolkit/transforms/index.ts` | Create | All 12 transform definitions: metadata + jscodeshift `apply` function |
| `src/workers/refactoring.worker.ts` | Create | RPC worker — parses code with jscodeshift, applies selected transforms |
| `src/tools/refactoring-toolkit/RefactoringToolkit.tsx` | Modify | Replace sync `transform.apply(code)` with async `worker.applyTransforms(...)` |
| `src/tools/__tests__/refactoring-toolkit.test.ts` | Create | Per-transform unit tests (pure functions, no browser needed) |

---

## Task 1: Transform scaffold + `var→let/const`

**Files:**
- Create: `src/tools/refactoring-toolkit/transforms/index.ts`
- Create: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import jscodeshift from 'jscodeshift'
import { TRANSFORMS } from '@/tools/refactoring-toolkit/transforms'

function applyTransform(
  id: string,
  code: string,
  parser: 'babel' | 'tsx' = 'babel'
): string {
  const j = jscodeshift.withParser(parser)
  const root = j(code)
  const transform = TRANSFORMS.find((t) => t.id === id)
  if (!transform) throw new Error(`Transform "${id}" not found`)
  transform.apply(root, j)
  return root.toSource()
}

describe('var-to-const', () => {
  it('converts unreassigned var to const', () => {
    expect(applyTransform('var-to-const', 'var x = 1')).toBe('const x = 1;')
  })
  it('converts reassigned var to let', () => {
    const input = 'var x = 1\nx = 2'
    const output = applyTransform('var-to-const', input)
    expect(output).toContain('let x = 1')
  })
  it('is a no-op when no var declarations exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('var-to-const', input)).toBe('const x = 1;')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — `Cannot find module '@/tools/refactoring-toolkit/transforms'`

- [ ] **Step 3: Create `transforms/index.ts` with the type definitions and `var-to-const` transform**

Create `src/tools/refactoring-toolkit/transforms/index.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): scaffold AST transforms + var-to-const"
```

---

## Task 2: Arrow functions + template literals transforms

**Files:**
- Modify: `src/tools/refactoring-toolkit/transforms/index.ts`
- Modify: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Add tests for `arrow-functions` and `template-literals`**

Append to `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
describe('arrow-functions', () => {
  it('converts anonymous function expression to arrow function', () => {
    const input = 'const fn = function(x) { return x * 2 }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('=>')
    expect(output).not.toContain('function(')
  })
  it('does not convert named function expressions', () => {
    const input = 'const fn = function myFn(x) { return x }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('function myFn')
  })
  it('does not convert object methods', () => {
    const input = 'const obj = { foo: function(x) { return x } }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('function(x)')
  })
})

describe('template-literals', () => {
  it('converts string + identifier concatenation to template literal', () => {
    const input = `'Hello, ' + name`
    const output = applyTransform('template-literals', input)
    expect(output).toContain('`Hello, ${name}`')
  })
  it('is a no-op when no string concatenation exists', () => {
    const input = `const greeting = \`Hello, \${name}\``
    const output = applyTransform('template-literals', input)
    expect(output).toContain('`Hello, ${name}`')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — `arrow-functions` and `template-literals` not found in TRANSFORMS.

- [ ] **Step 3: Add the two transforms to `transforms/index.ts`**

Add after the `var-to-const` entry in the `TRANSFORMS` array:

```ts
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
          return (
            left.type === 'StringLiteral' &&
            (right.type === 'Identifier' || right.type === 'MemberExpression')
          )
        })
        .forEach((path) => {
          const { left, right } = path.node
          if (left.type !== 'StringLiteral') return
          j(path).replaceWith(
            j.templateLiteral(
              [
                j.templateElement({ cooked: left.value, raw: left.value }, false),
                j.templateElement({ cooked: '', raw: '' }, true),
              ],
              [right]
            )
          )
        })
    },
  },
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: all previous tests + 5 new tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): add arrow-functions and template-literals transforms"
```

---

## Task 3: Optional chaining + require→import + Object.assign→spread

**Files:**
- Modify: `src/tools/refactoring-toolkit/transforms/index.ts`
- Modify: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Add tests for all three transforms**

Append to `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
describe('optional-chaining', () => {
  it('converts a && a.b to a?.b', () => {
    const output = applyTransform('optional-chaining', 'user && user.name')
    expect(output).toContain('user?.name')
  })
  it('is a no-op when no && member pattern exists', () => {
    const input = 'const x = user?.name'
    expect(applyTransform('optional-chaining', input)).toContain('user?.name')
  })
})

describe('require-to-import', () => {
  it('converts const x = require("y") to import x from "y"', () => {
    const output = applyTransform('require-to-import', "const fs = require('fs')")
    expect(output).toContain("import fs from 'fs'")
  })
  it('is a no-op when no require() calls exist', () => {
    const input = "import fs from 'fs'"
    expect(applyTransform('require-to-import', input)).toContain("import fs from 'fs'")
  })
})

describe('spread-operator', () => {
  it('converts Object.assign({}, x) to { ...x }', () => {
    const output = applyTransform('spread-operator', 'const a = Object.assign({}, defaults)')
    expect(output).toContain('...defaults')
  })
  it('does not convert Object.assign with non-empty first argument', () => {
    const input = 'Object.assign(target, source)'
    const output = applyTransform('spread-operator', input)
    expect(output).toContain('Object.assign(target, source)')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — three transforms not found.

- [ ] **Step 3: Add the three transforms to `transforms/index.ts`**

Add after the `template-literals` entry:

```ts
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
            right.object.name === left.name
          )
        })
        .forEach((path) => {
          const right = path.node.right
          if (right.type !== 'MemberExpression') return
          j(path).replaceWith(
            j.optionalMemberExpression(right.object, right.property, false, true)
          )
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
          const decl = declarations[0]
          return (
            decl.type === 'VariableDeclarator' &&
            decl.init?.type === 'CallExpression' &&
            decl.init.callee.type === 'Identifier' &&
            decl.init.callee.name === 'require' &&
            decl.init.arguments.length === 1 &&
            decl.init.arguments[0].type === 'StringLiteral' &&
            decl.id.type === 'Identifier'
          )
        })
        .forEach((path) => {
          const decl = path.node.declarations[0]
          if (decl.type !== 'VariableDeclarator' || !decl.init) return
          if (decl.init.type !== 'CallExpression') return
          const source = decl.init.arguments[0]
          if (source.type !== 'StringLiteral') return
          const name = (decl.id as j.Identifier).name
          j(path).replaceWith(
            j.importDeclaration(
              [j.importDefaultSpecifier(j.identifier(name))],
              j.stringLiteral(source.value)
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
          return (
            callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Object' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'assign' &&
            args.length === 2 &&
            args[0].type === 'ObjectExpression' &&
            (args[0] as j.ObjectExpression).properties.length === 0
          )
        })
        .forEach((path) => {
          const source = path.node.arguments[1]
          j(path).replaceWith(j.objectExpression([j.spreadElement(source)]))
        })
    },
  },
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: all previous + 7 new tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): add optional-chaining, require-to-import, spread-operator"
```

---

## Task 4: Type Safety transforms (`==→===` and `||→??`)

**Files:**
- Modify: `src/tools/refactoring-toolkit/transforms/index.ts`
- Modify: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Add tests**

Append to `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
describe('strict-equality', () => {
  it('converts == to ===', () => {
    expect(applyTransform('strict-equality', 'x == y')).toContain('===')
  })
  it('converts != to !==', () => {
    expect(applyTransform('strict-equality', 'x != y')).toContain('!==')
  })
  it('does not touch already-strict equality', () => {
    const input = 'x === y'
    expect(applyTransform('strict-equality', input)).toContain('===')
    expect(applyTransform('strict-equality', input)).not.toContain('====')
  })
})

describe('nullish-coalescing', () => {
  it('converts || with string literal RHS to ??', () => {
    expect(applyTransform('nullish-coalescing', "name || 'default'")).toContain('??')
  })
  it('converts || with numeric literal RHS to ??', () => {
    expect(applyTransform('nullish-coalescing', 'count || 0')).toContain('??')
  })
  it('does not convert || where RHS is a variable', () => {
    const input = 'a || b'
    expect(applyTransform('nullish-coalescing', input)).toContain('||')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — `strict-equality` and `nullish-coalescing` not found.

- [ ] **Step 3: Add the two transforms**

Add after the `spread-operator` entry (start of the Type Safety section):

```ts
  // ── Type Safety ────────────────────────────────────────────
  {
    id: 'strict-equality',
    name: '== → ===',
    description: 'Convert loose equality to strict equality',
    category: 'safety',
    safety: 'safe',
    languages: ['javascript', 'typescript'],
    apply: (root, j) => {
      root
        .find(j.BinaryExpression, { operator: '==' })
        .forEach((path) => {
          path.node.operator = '==='
        })
      root
        .find(j.BinaryExpression, { operator: '!=' })
        .forEach((path) => {
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
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: all previous + 6 new tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): add strict-equality and nullish-coalescing transforms"
```

---

## Task 5: Cleanup transforms (`remove-console`, `remove-debugger`, `trailing-commas`)

**Files:**
- Modify: `src/tools/refactoring-toolkit/transforms/index.ts`
- Modify: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Add tests**

Append to `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
describe('remove-console', () => {
  it('removes console.log statements', () => {
    const input = 'console.log("debug")\nconst x = 1'
    const output = applyTransform('remove-console', input)
    expect(output).not.toContain('console.log')
    expect(output).toContain('const x = 1')
  })
  it('removes console.warn and console.error', () => {
    const input = 'console.warn("warn")\nconsole.error("err")'
    const output = applyTransform('remove-console', input)
    expect(output.trim()).toBe('')
  })
  it('is a no-op when no console calls exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('remove-console', input)).toContain('const x = 1')
  })
})

describe('remove-debugger', () => {
  it('removes debugger statements', () => {
    const input = 'function foo() { debugger; return 1 }'
    const output = applyTransform('remove-debugger', input)
    expect(output).not.toContain('debugger')
    expect(output).toContain('return 1')
  })
  it('is a no-op when no debugger statements exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('remove-debugger', input)).toContain('const x = 1')
  })
})

describe('trailing-commas', () => {
  it('adds trailing commas to the last array element', () => {
    const input = 'const a = [\n  1,\n  2\n]'
    const output = applyTransform('trailing-commas', input)
    expect(output).toMatch(/2,?\s*\n/)
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — cleanup transforms not found.

- [ ] **Step 3: Add the three transforms**

Add after the `nullish-coalescing` entry (start of Cleanup section):

```ts
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
            expression.callee.object.name === 'console'
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
      // Arrays
      root
        .find(j.ArrayExpression)
        .filter((path) => {
          const node = path.node
          return (
            node.elements.length > 0 &&
            node.loc !== null &&
            node.loc !== undefined &&
            node.loc.start.line !== node.loc.end.line
          )
        })
        .forEach((path) => {
          const elements = path.node.elements.filter(Boolean)
          const last = elements[elements.length - 1]
          if (last && !('extra' in last && (last as { extra?: { trailingComma?: boolean } }).extra?.trailingComma)) {
            // Rebuild the array with the same elements — recast will then apply toSource options
            path.node.elements = [...path.node.elements]
          }
        })
      // Objects
      root
        .find(j.ObjectExpression)
        .filter((path) => {
          const node = path.node
          return (
            node.properties.length > 0 &&
            node.loc !== null &&
            node.loc !== undefined &&
            node.loc.start.line !== node.loc.end.line
          )
        })
        .forEach((path) => {
          path.node.properties = [...path.node.properties]
        })
    },
  },
```

> **Note on trailing-commas:** The `apply` function forces recast to treat the nodes as modified, so `toSource` will reprint them. The worker (Task 7) passes `{ trailingComma: true }` to `toSource` when this transform is selected — that's what actually adds the commas. Without the worker's option, this transform is a no-op.

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: all previous + 5 new tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): add remove-console, remove-debugger, trailing-commas"
```

---

## Task 6: `Promise.then → async/await` transform

**Files:**
- Modify: `src/tools/refactoring-toolkit/transforms/index.ts`
- Modify: `src/tools/__tests__/refactoring-toolkit.test.ts`

- [ ] **Step 1: Add tests**

Append to `src/tools/__tests__/refactoring-toolkit.test.ts`:

```ts
describe('promise-to-async', () => {
  it('converts .then(fn).catch(fn) to an async IIFE with try/catch', () => {
    const input = `fetchData().then(result => process(result)).catch(err => handleError(err))`
    const output = applyTransform('promise-to-async', input)
    expect(output).toContain('async')
    expect(output).toContain('await')
    expect(output).toContain('try')
    expect(output).toContain('catch')
  })
  it('is a no-op when no .then().catch() pattern exists', () => {
    const input = 'const x = 1'
    const output = applyTransform('promise-to-async', input)
    expect(output).not.toContain('async')
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: FAIL — `promise-to-async` not found.

- [ ] **Step 3: Add the transform**

Add after the `trailing-commas` entry:

```ts
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
          const callee = path.node.callee as j.MemberExpression
          const thenCall = callee.object
          return (
            thenCall.type === 'CallExpression' &&
            thenCall.callee.type === 'MemberExpression' &&
            (thenCall.callee as j.MemberExpression).property.type === 'Identifier' &&
            ((thenCall.callee as j.MemberExpression).property as j.Identifier).name ===
              'then'
          )
        })
        .forEach((path) => {
          const catchCallee = path.node.callee as j.MemberExpression
          const thenCall = catchCallee.object as j.CallExpression
          const thenCallee = thenCall.callee as j.MemberExpression
          const originalExpr = thenCallee.object
          const thenFn = thenCall.arguments[0]
          const catchFn = path.node.arguments[0]

          if (!thenFn || !catchFn) return

          const resultId = j.identifier('_result')
          const errorId = j.identifier('_error')

          const tryCatch = j.tryStatement(
            j.blockStatement([
              j.variableDeclaration('const', [
                j.variableDeclarator(resultId, j.awaitExpression(originalExpr)),
              ]),
              j.expressionStatement(j.callExpression(thenFn, [resultId])),
            ]),
            j.catchClause(
              errorId,
              null,
              j.blockStatement([
                j.expressionStatement(j.callExpression(catchFn, [errorId])),
              ])
            )
          )

          // Wrap in async IIFE: (async () => { ... })()
          j(path).replaceWith(
            j.callExpression(
              j.arrowFunctionExpression([], j.blockStatement([tryCatch]), true),
              []
            )
          )
        })
    },
  },
```

- [ ] **Step 4: Run all tests and verify they pass**

```bash
cd apps/cockpit && bun run test src/tools/__tests__/refactoring-toolkit.test.ts
```

Expected: all tests passing (including the 2 new `promise-to-async` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts \
        apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.ts
git commit -m "feat(refactoring-toolkit): add promise-to-async transform"
```

---

## Task 7: `refactoring.worker.ts`

**Files:**
- Create: `src/workers/refactoring.worker.ts`

- [ ] **Step 1: Create the worker**

Create `src/workers/refactoring.worker.ts`:

```ts
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
```

- [ ] **Step 2: Verify the worker file compiles without TypeScript errors**

```bash
cd apps/cockpit && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/cockpit/src/workers/refactoring.worker.ts
git commit -m "feat(refactoring-toolkit): add jscodeshift worker"
```

---

## Task 8: Update `RefactoringToolkit.tsx` to use the worker

**Files:**
- Modify: `src/tools/refactoring-toolkit/RefactoringToolkit.tsx`

This task replaces the synchronous `transform.apply(code)` loop in the debounce effect with an async call to `worker.applyTransforms(...)`.

- [ ] **Step 1: Update the imports and add `useWorker`**

In `RefactoringToolkit.tsx`, replace the top-of-file imports block with:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { useWorker } from '@/hooks/useWorker'
import type { RefactoringWorker } from '@/workers/refactoring.worker'
import RefactoringWorkerFactory from '@/workers/refactoring.worker?worker'
import {
  TRANSFORMS,
  CATEGORIES,
  SAFETY_COLORS,
  SAFETY_LABELS,
  LANGUAGES,
  type TransformCategory,
} from './transforms'
```

> **Note:** The `CATEGORIES`, `SAFETY_COLORS`, `SAFETY_LABELS`, and `LANGUAGES` constants must be exported from `transforms/index.ts` (see Step 2 below). The `TRANSFORMS` array now lives there too — remove all duplicate constants from `RefactoringToolkit.tsx`.

- [ ] **Step 2: Export shared constants from `transforms/index.ts`**

Add these exports at the bottom of `src/tools/refactoring-toolkit/transforms/index.ts`:

```ts
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
```

- [ ] **Step 3: Add the worker instance and update the debounce effect**

In `RefactoringToolkit.tsx`, add the worker hook after the `useToolState` call:

```ts
  const worker = useWorker<RefactoringWorker>(
    () => new RefactoringWorkerFactory(),
    ['applyTransforms']
  )
```

Then replace the entire debounce `useEffect` (the one that computes `preview`) with:

```ts
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!state.input.trim() || state.selectedTransforms.length === 0 || !worker) {
      setPreview(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      const parser = state.language === 'typescript' ? 'tsx' : 'babel'
      worker
        .applyTransforms(state.input, state.selectedTransforms, parser)
        .then((result) => setPreview(result))
        .catch((err: Error) => setLastAction(err.message, 'error'))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, state.selectedTransforms, state.language, worker, setLastAction])
```

- [ ] **Step 4: Verify `availableTransforms` memo is unchanged**

The `availableTransforms` memo does not need modification — it filters `TRANSFORMS` by language, and `TRANSFORMS` is now imported from `./transforms` instead of defined inline. The logic is identical. No edit needed here.

- [ ] **Step 5: Remove the old inline `TRANSFORMS`, `CATEGORIES`, `SAFETY_COLORS`, `SAFETY_LABELS`, and `LANGUAGES` constants from `RefactoringToolkit.tsx`**

Delete all of the following from the component file (they now live in `transforms/index.ts`):
- `type TransformCategory = ...`
- `type SafetyLevel = ...`
- `type Transform = ...`
- `const CATEGORIES = [...]`
- `const SAFETY_COLORS = {...}`
- `const SAFETY_LABELS = {...}`
- `const LANGUAGES = [...]`
- `const TRANSFORMS: Transform[] = [...]`

- [ ] **Step 6: Type-check and verify the full test suite passes**

```bash
cd apps/cockpit && npx tsc --noEmit && bun run test
```

Expected: no TypeScript errors, all tests passing (at least 183 + the new refactoring-toolkit tests).

- [ ] **Step 7: Commit**

```bash
git add apps/cockpit/src/tools/refactoring-toolkit/RefactoringToolkit.tsx \
        apps/cockpit/src/tools/refactoring-toolkit/transforms/index.ts
git commit -m "feat(refactoring-toolkit): wire worker into UI, remove inline transforms"
```

---

## Final Verification

- [ ] **Run the full test suite one last time**

```bash
cd apps/cockpit && bun run test
```

Expected: all tests passing.

- [ ] **Smoke test in Tauri dev (optional but recommended)**

```bash
cd apps/cockpit && bun run tauri dev
```

Open the Refactoring Toolkit, paste some JavaScript, select a few transforms, and confirm the diff viewer updates correctly.
