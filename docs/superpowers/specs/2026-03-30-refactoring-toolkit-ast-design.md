# Design: Refactoring Toolkit — AST Transforms via jscodeshift

**Date:** 2026-03-30
**Tool:** Refactoring Toolkit (`refactoring-toolkit`)
**Scope:** Migrate all regex-based transforms to jscodeshift AST transforms; add missing Promise→async/await transform

---

## Problem

The current implementation uses regular expressions for all 11 code transforms. Regex-based transforms are fragile — they fail on multi-line patterns, nested expressions, strings containing the matched pattern, and edge cases that a proper AST traversal handles correctly. The PRODUCT_MAP also documents a `Promise.then→async/await` transform that is not yet implemented.

---

## Solution

Move all transform logic into a Web Worker that uses **jscodeshift** for AST-based code modification. The UI layer becomes async, calling the worker instead of running transforms synchronously on the main thread.

---

## Architecture

Three new/modified files:

| File | Role |
|------|------|
| `src/tools/refactoring-toolkit/RefactoringToolkit.tsx` | UI only — worker lifecycle + async RPC |
| `src/tools/refactoring-toolkit/refactoring.worker.ts` | Web Worker — owns jscodeshift, applies transforms |
| `src/tools/refactoring-toolkit/transforms/index.ts` | 12 pure jscodeshift transform functions |
| `src/tools/refactoring-toolkit/refactoring-toolkit.test.ts` | Per-transform unit tests |

---

## Data Flow

```
User selects transforms
  → debounce 300ms (unchanged)
  → worker.postMessage({ requestId, transformIds, code, language })
  → Worker: jscodeshift(code, { parser: 'babel' | 'tsx' })
  → applies each transform in sequence via root.find(...).forEach(...)
  → worker.postMessage({ requestId, result })
  → UI: setPreview(result) → DiffEditor shows diff
  → User clicks Apply → input ← preview, transforms cleared
```

**Worker RPC:** Follows the same pattern as the TypeScript Playground worker. A `useRef` holds the Worker instance. `useEffect` creates it on mount and terminates it on unmount. Each request carries a `requestId`; stale responses (from superseded requests) are discarded.

---

## Transform Definitions

Each transform shifts from regex to a jscodeshift API call:

**Before (regex):**
```ts
apply: (code) => code.replace(/\bvar\s+/g, 'const ')
```

**After (jscodeshift):**
```ts
apply: (root, j) => {
  root
    .find(j.VariableDeclaration, { kind: 'var' })
    .forEach((path) => {
      path.node.kind = 'const'
    })
}
```

### Transforms (12 total)

**Modernize**
- `var → const/let` — find `VariableDeclaration { kind: 'var' }`; check if the binding is ever reassigned in scope (`j(path.scope).find(j.AssignmentExpression)`) — use `let` if reassigned, `const` otherwise
- `Arrow functions` — find `FunctionExpression` not as method/constructor, replace with `ArrowFunctionExpression`
- `Template literals` — find string `BinaryExpression` with `+`, convert to `TemplateLiteral`
- `Optional chaining` — find `LogicalExpression { operator: '&&' }` matching `a && a.b`, replace with `OptionalMemberExpression`
- `require → import` — find `CallExpression` where callee is `require`, replace with `ImportDeclaration`
- `Object.assign → spread` — find `CallExpression` matching `Object.assign({}, x)`, replace with `ObjectExpression` using spread
- `Promise.then → async/await` *(new)* — find `.then(fn).catch(fn)` chains on a returned/awaited expression; wrap in `async` function with `try/catch`

**Type Safety**
- `== → ===` — find `BinaryExpression { operator: '==' }`, set `operator = '==='`; same for `!=` → `!==`
- `|| → ?? (nullish)` — find `LogicalExpression { operator: '||' }` where RHS is a literal, replace with `operator: '??'`

**Cleanup**
- `Remove console.*` — find `ExpressionStatement` whose expression is a `CallExpression` on `console.*`, remove
- `Remove debugger` — find `DebuggerStatement`, remove
- `Add trailing commas` — find multi-line `ArrayExpression` and `ObjectExpression`, add trailing comma to last element

---

## Error Handling

- **Parse errors** (syntax error in input): Worker catches the jscodeshift exception, returns `{ requestId, error: message }`. UI surfaces via `setLastAction(message, 'error')` in the toolbar — same pattern used by other tools.
- **Transform errors** (a specific transform throws): Chain short-circuits; error message identifies which transform failed.
- **No-match** (transform found nothing to change): Returns original code unchanged — not an error.

**Improvement over regex:** Current regex silently produces malformed output on edge cases. jscodeshift either transforms correctly or throws a catchable error.

---

## Testing

File: `src/tools/refactoring-toolkit/refactoring-toolkit.test.ts`

Each transform function is a pure `(root, j) => void` — testable directly with Vitest, no browser or worker needed.

Structure:
```ts
describe('var-to-const', () => {
  it('converts var to const', () => { /* before/after fixture */ })
  it('no-ops when no var declarations', () => { /* idempotent */ })
})
```

Coverage targets:
- One happy-path test per transform (before → after code fixture)
- One no-op test per transform (already modernized code unchanged)
- Edge cases for complex transforms (optional chaining with nested access, Promise chains with multiple `.then()` calls)

---

## Constraints

- No new Tauri IPC — all transform logic stays in the browser/worker layer
- Worker follows the existing cockpit worker pattern (no Comlink, plain `postMessage` RPC)
- UI shape is unchanged — same sidebar, same DiffEditor, same Apply button
- `jscodeshift` added as a dev/runtime dependency in `apps/cockpit/package.json`
- Parser: `babel` for JavaScript, `tsx` for TypeScript (jscodeshift built-ins)
