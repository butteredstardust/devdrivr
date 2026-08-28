/**
 * No-op stand-in for `@/lib/monaco-runtime`.
 *
 * The real module exists to point `@monaco-editor/react`'s loader at the bundled editor, so it
 * imports `monaco-editor` itself. That package touches browser globals at module scope — it dies
 * on `UIEvent is not defined` under this suite's `environment: 'node'` — and there is nothing for
 * it to configure anyway, since `@monaco-editor/react` is aliased to a mock here too.
 */
export {}
