# TODO - Cockpit Quality and Reliability Backlog

Last updated: 2026-07-30

This is the working backlog for bug fixes, quality improvements, and reliability hardening in
`apps/cockpit`. Keep this document focused on actionable engineering work: every item should have
evidence, an expected outcome, acceptance criteria, and a verification path.

## Current Snapshot

Verified locally from `apps/cockpit` on 2026-07-30:

| Gate        | Command                                        | Result                          |
| ----------- | ---------------------------------------------- | ------------------------------- |
| TypeScript  | `npx tsc --noEmit`                             | Passing                         |
| Tests       | `bunx vitest run`                              | Passing: 78 files, 650 tests    |
| ESLint      | `bun run lint`                                 | Passing with zero warnings      |
| Rust check  | `cargo check` from `src-tauri`                 | Passing                         |
| Rust clippy | `cargo clippy -- -D warnings` from `src-tauri` | Passing                         |
| Release     | `bun run tauri build`                          | Passing: builds `.app` + `.dmg` |

Commands no longer need a `PATH="/opt/homebrew/bin:$PATH"` prefix; older entries in this file still
show one. See the PATH section in `CLAUDE.md` for what changed.

Known context:

- Cockpit is the active app in this monorepo.
- The product map lists 30 registered tools across 7 groups.
- Remaining documented gaps include native worker/SQLite integration and release smoke automation.
- CI already runs frontend lint/typecheck/tests plus Rust `cargo check` and `cargo clippy`.

### Source audit, 2026-07-30

A read-through of `src/` and `src-tauri/` found defects that all four gates pass over. Every gate is
green and the suite is at 593 tests, so **a green board is not evidence these are absent** — each
item below was found by reading code or by direct reproduction, not by a failing test. The audit
also confirmed several areas are in good shape: the Rust MCP server (loopback-only bind,
constant-time bearer comparison, `busy_timeout`, `max_connections(1)`), the Markdown Editor sanitize
schema, and Regex Tester HTML escaping are all correct as written.

Newly filed from that audit:

| Item                                          | Priority | Evidence                                 | Status |
| --------------------------------------------- | -------- | ---------------------------------------- | ------ |
| Regex Tester freezes the app on backtracking  | P0       | Reproduced: unrecoverable hang           | Fixed  |
| `runTransaction` has no atomicity guarantee   | P0       | `tauri-plugin-sql` pool semantics        | Fixed  |
| `useToolState` cold-start races lose edits    | P0       | Code path in `src/hooks/useToolState.ts` | Fixed  |
| Notes preview drops tables, images, strikes   | P1       | Reproduced against the real pipeline     | Fixed  |
| Blob downloads bypass the Tauri save dialog   | P1       | 5 call sites                             | Fixed  |
| Bootstrap leaks listeners on early unmount    | P1       | Code path in `src/app/providers.tsx`     | Fixed  |
| Failed store `init()` is cached permanently   | P1       | Shared promise-guard pattern             | Fixed  |
| Tool capabilities duplicated across 3 id sets | P2       | Registry drift risk                      | Open   |
| `settings.store` hand-rolls persisted object  | P2       | Silent setting loss on future fields     | Open   |

Two further defects surfaced while fixing the P0 items, both filed in P2 below: `bun run lint` was
not runnable locally (root-caused to the agent harness overwriting PATH, now fixed), and five worker
mocks had never been wired up.

## How To Use This Backlog

- Work P0 before P1, and P1 before P2 unless a lower-priority item is blocking current release work.
- Convert broad TODOs into small PRs with one clear risk area per PR.
- Keep completed items in this file until the next release branch is cut, then move notable outcomes
  into release notes or the relevant documentation.
- For each PR, update the item with links to tests, manual smoke notes, or follow-up issues.

## P0 - Reliability Blockers

### [x] Stop Regex Tester from freezing the app on catastrophic backtracking

Area: regex-tester / main-thread responsiveness

Problem: `findMatches`, `highlightMatches`, and `computeReplace` in
`src/tools/regex-tester/RegexTester.tsx` each compile and run a user-supplied pattern synchronously
inside a `useMemo` on the main thread. `MAX_REGEX_MATCHES` caps how many matches are collected, but
it cannot interrupt backtracking **inside a single `exec()` call**. A pathological pattern hangs the
entire WebView: no re-render, no keyboard input, no way to clear the field. The user's only recourse
is to force-quit, and because `useToolState` persists the pattern, relaunching the app can reload the
same pattern and hang again.

Evidence: reproduced directly. Pattern `(a+)+$` against 30 `a` characters plus `!` did not complete
within a 60-second timeout and had to be killed. Thirty characters is well within what a user types
by hand, and a regex tester is precisely where people paste hostile patterns to study them.

Expected outcome: A pathological pattern produces a timeout message in the results pane. The shell
stays interactive, and the tool recovers when the pattern is edited.

Acceptance criteria:

- Regex evaluation moves off the main thread into a worker using the existing `handleRpc` /
  `useWorker` protocol, so a runaway match can be terminated.
- The worker is terminated and respawned after a configurable budget (start at ~1s) and the tool
  renders an explicit "pattern timed out" state rather than a silent empty result.
- The three evaluation paths compile the pattern once and share the result instead of building
  three separate `RegExp` objects per keystroke.
- Persisted tool state cannot re-trigger the hang on launch: a pattern that timed out is not
  re-evaluated automatically until the user edits it.
- Regression test asserts a known catastrophic pattern returns a timeout result within the budget.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/tools/__tests__/regex-tester.test.tsx
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- Added `src/workers/regex.api.ts` (pure evaluation, compiles the pattern once and shares it across
  matching, highlighting, and replacement) and `src/workers/regex.worker.ts` over `handleRpc`.
- Added `src/hooks/useRegexEvaluation.ts`, a dedicated hook rather than an extension of `useWorker`.
  Adding terminate-and-respawn to `useWorker` would change its contract for six existing consumers —
  a rejected request would no longer imply a live worker — and that contract is pinned by
  `useWorker.test.ts`.
- 1000 ms budget; on expiry the wedged worker is terminated, a replacement is spawned immediately,
  and the tool renders an explicit timeout message in both the match and replace panes rather than a
  silent empty result.
- A key over pattern/flags/text/replacement short-circuits repeat evaluation, so a persisted
  timed-out pattern is never re-evaluated on launch — only after the user edits an input.
- Removed roughly 170 lines of main-thread regex code from `RegexTester.tsx`.
- Found in pre-merge review: the timeout path set `status: 'timeout'` but never retired the request
  id, so a reply queued just before `terminate()` still passed both staleness guards and flipped the
  pane back to `ready` — while the input stayed in `timedOutKeysRef`, wedging it as permanently
  timed-out on the next visit. The timeout now bumps `requestIdRef`. Regression test added and
  confirmed to fail against the pre-fix hook.
- Caveat: the timeout regression test drives a wedged-worker stub with fake timers, not a genuinely
  catastrophic regex. A real pathological pattern cannot be executed under Vitest because the mock
  worker runs on the test thread and would hang the runner exactly as the bug hung the app. The test
  asserts the timeout machinery — status, single `terminate()`, replacement spawn, no re-post of the
  identical input, resumption on edit — not that a specific pattern trips it.

### [x] Give `runTransaction` a real atomicity guarantee

Area: SQLite persistence / data safety

Problem: `runTransaction` in `src/lib/db.ts` issues `BEGIN`, the caller's statements, and `COMMIT` as
separate `conn.execute()` calls. Those calls do not share a connection. `tauri-plugin-sql` 2.3.2
stores a `DbPool::Sqlite(Pool<Sqlite>)` built with `Pool::connect(...)` (default max 10 connections)
and runs each statement via `pool.execute(query)`, which acquires a connection from the pool
**per statement** (`src/wrapper.rs`). Nothing pins `BEGIN`, the writes, and `COMMIT` to the same
connection.

Consequences when the statements land on different connections:

- The writes auto-commit individually, so `saveNotesOrder`, `saveUserPromptTemplates`,
  `seedBuiltinPromptTemplates`, and `saveApiImport` can persist partial results.
- `COMMIT` on a connection with no open transaction errors, and the `ROLLBACK` in the catch block
  silently fails on a connection it never began a transaction on.
- Worst case, an open `BEGIN IMMEDIATE` is left stranded on a pooled connection. Every later write
  routed to that connection fails with "cannot start a transaction within a transaction" until the
  app restarts.

The JS-side `writeQueue` serializes writes and makes the pool usually hand back the
most-recently-released connection, which is why this has never failed in practice or in tests. It is
a latent correctness bug, not a theoretical one. Note the contrast: the Rust MCP service opens its
own pool with `max_connections(1)` precisely so its transactions are safe.

Expected outcome: Multi-statement writes are genuinely atomic, or the code stops claiming to be.

Acceptance criteria:

- Pick one and document the choice in `ARCHITECTURE_DECISIONS.md`:
  - move batch writes behind a Rust command that owns a single connection, or
  - rewrite batch writes as single multi-statement SQL calls that SQLite executes atomically, or
  - drop the transaction wrapper and make each batch idempotent and safely re-runnable.
- Reads (`getSetting`, `loadNotes`, and peers) that currently bypass `writeQueue` are audited for
  the same cross-connection assumption.
- Tests cover partial-failure behavior for each batch writer, asserting the documented guarantee
  rather than assuming rollback works.
- Existing rollback tests are re-examined: they mock a single connection and therefore cannot
  observe this failure mode.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/lib src/stores
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- Confirmed the premise against the vendored `tauri-plugin-sql` 2.3.2 source before changing
  anything: `wrapper.rs` routes every statement through `pool.execute()` on a pool with the default
  maximum of 10 connections, so JS-side `BEGIN`/`COMMIT`/`ROLLBACK` could land on different
  connections. The wrapper guaranteed nothing.
- Added `src-tauri/src/batch.rs` with a `db_execute_batch(statements, immediate)` command that
  lazily opens its own `max_connections(1)` WAL pool (5s busy timeout, path resolution mirroring
  `mcp/mod.rs`), acquires one connection, and issues `BEGIN`/statements/`ROLLBACK`-or-`COMMIT` on
  that single connection. Registered in `lib.rs` via `mod batch;`, `.manage(...)`, and
  `generate_handler!`.
- `runTransaction` in `src/lib/db.ts` became `runBatch`, invoked inside `enqueueWrite` so `getDb()`
  and migrations still complete first. The four `executeSaveX` helpers became `buildSaveX` returning
  statements, removing duplicated SQL.
- Read-helper audit: `getSetting`, `loadNotes`, `loadSnippets`, `loadHistory`, `loadToolState`, and
  the API loaders are each a single `SELECT`, so none depend on cross-statement connection affinity.
  They are not snapshot-consistent with one another, but no caller relies on that. Recorded in the
  ADR.
- Documented as ADR-013 in `documentation/infrastructure/ARCHITECTURE_DECISIONS.md`, including the
  rejected alternatives (multi-statement SQL strings — injection surface; dropping the wrapper —
  leaves partial states user-visible).
- Rewrote the three DB test files to assert the guarantee actually implemented rather than the one
  previously assumed: a single `db_execute_batch` invocation carrying all statements in order, the
  correct `immediate` flag, no JS-driven `BEGIN`/`COMMIT` reaching the plugin pool, failure
  propagation, and an empty batch skipping the invoke. The prior rollback tests mocked a single
  connection and structurally could not observe this failure mode.
- Found in pre-merge review: the first cut hand-wrote `BEGIN`/`COMMIT`/`ROLLBACK` as raw SQL on a
  pooled connection. sqlx has no idea a transaction is open when it is driven that way, and the
  `COMMIT`-failure path returned without attempting a rollback — so on a full disk or lock timeout
  the connection went back to a `max_connections(1)` pool still inside a transaction, and every
  later batch would fail with "cannot start a transaction within a transaction" until relaunch.
  That is a worse failure than the one being fixed. Rewritten to use `pool.begin()` /
  `pool.begin_with("BEGIN IMMEDIATE")`, so sqlx tracks the transaction and rolls back on `Drop` for
  every early return.

### [x] Fix `useToolState` cold-start races that discard user input

Area: tool state persistence / data loss

Problem: `src/hooks/useToolState.ts` has two related defects on the cold-start path, when nothing is
in the in-memory cache and `loadToolState()` is in flight.

1. **Clobbered input.** The load resolves and calls `setState({ ...defaultState, ...saved })`,
   discarding whatever the user typed while the query was pending. The only guard is `cancelled`,
   which covers unmount, not intervening edits. Typing into a tool immediately after a cold launch
   can have the input replaced by the previous session's state mid-keystroke.
2. **Dropped edits on fast unmount.** The unmount effect saves only `if (loadedRef.current)`. A user
   who opens a tool, types, and switches tabs before the load resolves has their work silently
   discarded, because `loadedRef.current` is still `false`.

Expected outcome: A pending load never overwrites newer user input, and edits are never dropped
because a read happened to still be in flight.

Acceptance criteria:

- Track whether the user has modified state since mount; if so, the resolving load does not
  overwrite it (drop the load, or merge only keys the user has not touched).
- The unmount save runs whenever local state has been modified, regardless of `loadedRef`.
- Tests cover: edit-during-pending-load keeps the edit; unmount-during-pending-load persists the
  edit; and the untouched cold path still restores saved state.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/hooks
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- Added a `dirtyRef` set at the top of `update()`, tracking whether the user has modified state since
  mount.
- A `loadToolState()` that resolves after an edit is dropped entirely rather than merged. Tool state
  fields are interdependent (a regex pattern and its flags, a request body and its content-type
  header), so a partial merge would splice last session's values into state the user is actively
  editing and produce a combination that never existed. Live input wins.
- The unmount save now runs on `loadedRef.current || dirtyRef.current`, so an edit made while the
  initial read was still in flight is persisted instead of silently discarded.
- Added four tests: edit-during-pending-load keeps the edit and drops the load; unmount during a
  pending load persists the edit; the untouched cold path still restores saved state; unmount with
  neither an edit nor a completed load writes nothing.
- Note: these tests extend the existing `src/tools/__tests__/useToolState.test.ts` rather than
  `src/hooks/__tests__/`, which is contrary to the documented convention. Left in place to keep the
  diff scoped; see the follow-up item in P2.

### [x] Restore a locally verifiable Rust clippy gate

Area: Tauri backend / local verification

Problem: CI expects `cargo clippy -- -D warnings`, but the command aborts immediately in the local
environment used for this snapshot. `cargo check` passes, so this may be a local toolchain, wrapper,
cache, or clippy binary issue rather than a source issue.

Expected outcome: Developers can run the same Rust warning gate locally that CI runs.

Acceptance criteria:

- `cargo clippy -- -D warnings` runs from `apps/cockpit/src-tauri` without aborting.
- Any real clippy warnings are fixed without suppressing rules unless there is a documented reason.
- `apps/cockpit/AGENTS.md` and this file agree on the Rust verification command if the workflow
  changes.

Verification:

```bash
cd apps/cockpit/src-tauri
cargo check
cargo clippy -- -D warnings
```

Completed 2026-07-30:

- Confirmed the abort was caused by the local command wrapper path, not the Rust toolchain or
  cockpit source.
- Ran `cargo clippy -- -D warnings` directly from `apps/cockpit/src-tauri`; it completed without
  warnings.
- Kept the CI and contributor command unchanged because the direct Cargo workflow is valid.

### [x] Add worker RPC round-trip regression coverage

Area: worker-backed tools / WebKit reliability

Problem: Worker-based tools previously broke under WKWebView because Comlink proxy access returned
undefined. Current unit tests mock worker imports, and the testing docs still list `handleRpc` /
`useWorker` round-trip coverage as a high-priority gap.

Expected outcome: The custom worker RPC protocol is protected against method-name mismatches,
unresolved promises, worker errors, and cleanup regressions.

Acceptance criteria:

- Tests cover a successful request/response through the same message shape used by `handleRpc`.
- Tests cover unknown method errors, thrown worker errors, and component unmount cleanup.
- At least one worker-backed tool test verifies its declared `useWorker` method list matches the
  worker API it depends on.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/hooks src/workers src/tools/__tests__
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- Added direct `handleRpc` coverage for successful async responses, unknown methods, and thrown
  worker errors using the production request/response message shape.
- Added `useWorker` lifecycle coverage for matching response IDs, runtime worker errors, unresolved
  calls during unmount, and worker termination.
- Pending RPC calls now reject on worker failure or cleanup instead of remaining unresolved.
- Code Formatter now shares a complete, type-checked method contract with the formatter worker, with
  a tool test guarding the declared method list.
- Verified the worker/tool slice (42 files, 371 tests), the full clean-source suite (65 files, 520
  tests), TypeScript, and ESLint.

Correction 2026-07-31: `src/workers/__tests__/rpc.test.ts` — the "direct `handleRpc` coverage" claimed
above — tests `handleRpc` in isolation against a toy `{ add }` API, not any real worker. It is real
coverage of the RPC envelope (message shape, unknown-method errors, thrown-error serialization), but
it is not round-trip coverage of any actual worker's logic. At the time this item was completed, five
of the six workers (`typescript`, `formatter`, `refactoring`, `diff`, `xml`) were additionally routed
through a no-op mock in tests (see the P2 item below), so none of their tool tests exercised real
worker output either — only the regex worker had a live mock. The P2 item "Re-examine the five worker
mocks that were never active" below supplied the missing round-trip coverage: real per-worker mocks
plus tests that fail if any of them reverts to a no-op. Leaving this item checked because the RPC
envelope coverage it describes is accurate and still valid; the gap was in what the surrounding tool
tests could prove, not in this item's own claims.

### [x] Harden database helper and migration regression tests

Area: SQLite persistence / data safety

Problem: Store tests mock persistence well, but direct coverage for DB helpers, migrations, schema
validation, transaction behavior, and backfills is limited. Existing installs depend on migrations
preserving data across versions.

Expected outcome: Persistence bugs are caught before they can create blank startup screens, data
loss, invalid rows, or migration failures.

Acceptance criteria:

- Tests exercise `getDb()` singleton behavior, queued writes, transaction rollback, and invalid JSON
  fallback behavior where practical.
- Migration tests validate that existing rows receive explicit backfills for added columns.
- Schema adapters continue skipping invalid rows without crashing store initialization.
- Any new migration added after this item includes a regression test for upgrade-from-existing-data.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/lib src/stores
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- Added direct coverage for concurrent `getDb()` singleton initialization, WAL/busy-timeout setup,
  failed-write queue recovery, malformed settings/tool-state JSON, and invalid note/snippet rows.
- Retained focused coverage for serialized note-order writes and transaction rollback on failed
  prompt-template batches.
- Added migration 009 to backfill note tags and history flags without changing the checksums of
  already-applied migrations.
- Added migration contract tests for every defaulted column backfill and Tauri registration of the
  corrective migration.
- Verified the persistence slice (13 files, 88 tests), the full suite (67 files, 529 tests),
  TypeScript, ESLint, Cargo check, and strict Clippy.

### [x] Define a release-blocking smoke path for app launch and persistence

Area: release reliability / cross-platform runtime

Problem: `documentation/RELEASE_SMOKE_TESTS.md` is comprehensive, but the highest-risk checks are
manual and easy to skip under release pressure. CI proves build and unit behavior, not launch,
window restore, SQLite persistence, or platform-specific WebView behavior.

Expected outcome: Every release has repeatable launch and persistence evidence for each supported
platform.

Acceptance criteria:

- Create either an automated Tauri launch smoke harness or a scripted manual template that records
  platform, artifact, OS version, and pass/fail evidence.
- The smoke path covers app launch, restart, window restore, settings persistence, notes, snippets,
  at least three representative tools, MCP disabled-by-default, and updater feedback.
- Release promotion is explicitly blocked for blank windows, installer failure, data loss, missing
  assets, or unexpected MCP startup.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bun run tauri build
```

Then run the documented smoke path against release artifacts, not local build output.

Completed 2026-07-30:

- Added `bun run smoke:report` to create one artifact-bound evidence report per supported platform.
- The generator validates release artifact naming and host platform, rejects local Rust build
  output, records artifact size/SHA-256 plus OS/environment/tester metadata, and only overwrites
  recognized smoke reports without following aliases to protected files.
- Added a structured report covering launch, restart/window restore, settings, notes, snippets,
  representative tools, MCP disabled-by-default/lifecycle behavior, updater feedback, and final
  persistence.
- Documented that promotion requires passing reports for all four platform artifacts and is blocked
  by any incomplete blocking check, installer/launch failure, blank window, data loss, missing
  asset, unexpected MCP startup, or startup-blocking updater failure.
- Verified report generation and overwrite protection with a fixture; actual reports remain
  release-time evidence generated from downloaded GitHub Release artifacts.

## P1 - High-Value Regression Coverage

### [x] Fix the Notes markdown pipeline silently destroying content

Area: notes / markdown rendering

Problem: `src/lib/markdown.ts` — used only by `NotesDrawer` — passes `rehypeSanitize` a
**replacement** schema rather than extending `defaultSchema`, and never registers `remarkGfm`. The
allowed `tagNames` list omits `table`, `thead`, `tbody`, `tr`, `th`, `td`, `img`, `del`, and `input`.
Notes containing those constructs are not rendered badly; they are rendered **wrong**, with no error
and no indication anything was lost. `MarkdownEditor.tsx` gets this right (`...defaultSchema` plus
`remarkGfm`), so the two markdown surfaces in the app disagree.

Evidence: running the exact `processMarkdown` pipeline against representative markdown produced:

- GFM table → all table tags stripped, leaving bare cell text as loose lines of prose
- `![img](https://...)` → empty `<p></p>`
- `~~strike~~` → plain unstyled text
- task list `- [ ] item` → checkbox gone, leaving a stray leading space

Sanitization itself is not the problem: `javascript:` and `data:` hrefs were correctly stripped
while `https:` survived, so this is a correctness and data-fidelity bug, not a security hole. Worth
noting the schema is a wholesale replacement, so any future protection assumed to come from
`defaultSchema` will not be there.

Expected outcome: A note renders the same markdown feature set as the Markdown Editor.

Acceptance criteria:

- `processMarkdown` extends `defaultSchema` and registers `remarkGfm`, matching the editor.
- The two pipelines share one sanitize schema definition instead of maintaining separate lists.
- Tests assert tables, images, strikethrough, and task lists survive, and that `javascript:` and
  `data:` hrefs are still stripped.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/lib src/components/shell
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- `src/lib/markdown.ts` now exports a single `markdownSanitizeSchema` that extends `defaultSchema`
  and registers `remarkGfm`. `MarkdownEditor.tsx` imports that schema instead of maintaining its own
  copy, so the two markdown surfaces can no longer drift apart.
- New `src/lib/__tests__/markdown.test.ts` (7 tests) covers tables, images, strikethrough, and task
  list checkboxes surviving, plus `javascript:` and `data:` hrefs still being stripped while
  `https:` survives.
- Syntax highlighting was a regression risk here: `defaultSchema` restricts `code` `className` to
  `language-*`, which would have stripped the `hljs-*` classes `rehypeHighlight` emits. The schema
  explicitly re-allows `className` on `code` and `span`; verified by running the real pipeline
  against a fenced code block and confirming `hljs` classes survive.

### [x] Route file downloads through the Tauri save dialog

Area: cross-platform file export

Problem: Five export paths build a detached `<a download>`, call `a.click()`, and then call
`URL.revokeObjectURL(url)` synchronously on the next line:

- `src/tools/snippets/SnippetsManager.tsx:533`
- `src/tools/image-tool/ImageTool.tsx:497`
- `src/tools/mermaid-editor/MermaidEditor.tsx:329,344,383`
- `src/tools/markdown-editor/MarkdownEditor.tsx:761`

Two problems. The anchor is never appended to the document and the blob URL is revoked in the same
tick the download is supposed to start, which is unreliable in WKWebView — the macOS target. And the
app already has the correct mechanism: `saveFileDialog()` in `src/lib/file-io.ts`, which is what the
global save shortcut uses. These tools bypass it, so exports get inconsistent behavior and no save
location prompt.

Expected outcome: One export helper, used everywhere, that saves through the Tauri dialog.

Acceptance criteria:

- A shared helper handles text and blob export via `saveFileDialog()`; the five call sites use it.
- Filename derivation and sanitization live in the helper rather than being re-implemented per tool.
- Where a blob URL is still genuinely required, revocation is deferred rather than synchronous.
- Tests cover save success, user cancellation, and write failure for at least two tools.
- Confirm `src-tauri/capabilities/default.json` still scopes write permissions correctly; do not
  broaden them.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/tools src/lib
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- `src/lib/file-io.ts` gained `exportFile(data, defaultName)` — one helper handling both text and
  `Blob` payloads through the same `save()` dialog the global save shortcut uses — plus
  `sanitizeExportBasename` / `buildExportFilename`, so filename derivation lives in one place rather
  than being re-implemented per tool.
- All five `<a download>` sites now call it: `SnippetsManager`, `ImageTool`, `MermaidEditor` (SVG and
  PNG), `MarkdownEditor`.
- One `URL.createObjectURL` remains, in `MermaidEditor.renderPngBlob` — it rasterizes the SVG into an
  `Image` for canvas rather than triggering a download, and it already revokes in `onload`/`onerror`
  rather than synchronously. That is the deferred-revocation case the criteria allow.
- `src-tauri/capabilities/default.json` was not modified. `fs:allow-write-file` was already scoped to
  `$DOWNLOAD/**` and `$HOME/**`, which covers the new binary writes.
- Tests: 8 unit tests on the helper in `src/lib/__tests__/file-io.test.ts`, plus save-success,
  user-cancellation, and write-failure coverage for two tools (`snippets.test.tsx`,
  `image-tool.test.tsx`). One pre-existing image-tool assertion was wrapped in `waitFor` because the
  handler is now async.

### [x] Make bootstrap cleanup leak-free and store init recoverable

Area: app bootstrap / lifecycle

Two defects in the same area, small enough to land together.

**Leaked listeners.** In `src/app/providers.tsx`, `bootstrap()` pushes cleanups onto `cleanups` only
after a long chain of `await`s — `unlistenMcpChanged` at line 83, and `onMoved` / `onResized` /
`clearTimeout` at lines 153-155. The effect's cleanup function iterates `cleanups` at unmount time.
If unmount happens before those pushes, the array is already empty and the listeners are registered
afterward with nothing to remove them. The `cancelled` checks at lines 64, 68, and 108 do not cover
the gaps around lines 74-85 or 131-155.

**Unrecoverable init failure.** `settings.store`, `mcp.store`, and their peers cache `initPromise`
and never clear it on rejection. One transient failure — a locked database at launch, for example —
is latched for the entire process lifetime. `Providers` renders a terminal "Failed to initialize"
screen with no retry, so the app is dead until the user relaunches.

Expected outcome: Unmount during bootstrap leaves nothing registered, and a transient init failure is
retryable.

Acceptance criteria:

- Register each cleanup at the moment its resource is created, and re-check `cancelled` after every
  `await` that precedes a registration; if cancelled, tear down what was just created.
- Store `init()` clears the cached promise on rejection so a later call retries.
- The `Providers` error state offers a retry affordance instead of requiring a relaunch.
- Tests cover unmount mid-bootstrap leaving no live listeners, and a failed-then-successful `init()`.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/app src/stores
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

Completed 2026-07-30:

- `providers.tsx` now re-checks `cancelled` immediately after every `await` that creates a resource
  and tears that resource down on the spot rather than pushing it onto an already-drained `cleanups`
  array. Covers `unlistenMcpChanged`, `onMoved`, `onResized`, and the debounce timer.
- All seven stores with the promise-guard pattern — `settings`, `mcp`, `api`, `notes`,
  `prompt-templates`, `history`, `snippets` — clear `initPromise` on rejection before rethrowing. The
  success-path guard is untouched, so double-mount idempotency still holds.
- The `Providers` error screen has a Retry button that re-runs bootstrap instead of requiring a
  relaunch.
- New `src/app/__tests__/providers.test.tsx` (3 tests): unmount while awaiting `listen()`, unmount
  while awaiting `onMoved()`, and failed-then-retried `init()`. All three were confirmed to fail
  against the pre-fix `providers.tsx`, so they pin the actual defects rather than passing vacuously.
  A store-level test in `settings.store.test.ts` covers the rejection-clearing behavior in isolation.
- Out of scope but noted: `getDb()` in `src/lib/db.ts` has the same unguarded-singleton shape and
  never clears `dbPromise` on rejection. It is not a store, so it was left alone; worth a follow-up
  if a DB-open failure is ever seen to latch.

### [x] Add direct `useGlobalShortcuts` dispatch coverage

Area: keyboard-driven shell

Problem: Keyboard shortcuts are core to cockpit, but the testing docs list direct
`useGlobalShortcuts` dispatch coverage as incomplete.

Expected outcome: Global shortcut behavior is protected when focus is inside editable controls,
workspace tabs are active, or tool-local actions are dispatched.

Acceptance criteria:

- Tests cover command palette, sidebar toggle, notes drawer, settings, theme cycle, tab navigation,
  execute, copy output, file open, and file save dispatch paths.
- Tests assert editable-field behavior for modifier and non-modifier shortcuts.
- Tests verify cleanup so repeated mounts do not duplicate listeners.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/hooks src/components
```

Completed 2026-07-30:

- Added direct coverage for command palette, sidebar, notes drawer, settings, theme, shortcuts
  reference, always-on-top, tool navigation, workspace tabs, close tab, execute, copy output, open
  file, cancelled open, and save-file dispatch paths.
- Added real DOM listener coverage proving modifier shortcuts remain available inside inputs,
  textareas, contenteditable regions, and Monaco while non-modifier shortcuts are suppressed.
- Verified unmount cleanup prevents duplicate shortcut dispatch across repeated mounts.
- Explicitly discard fire-and-forget shortcut promises as required by the event-handler convention.
- Verified the hook/component slice (12 files, 59 tests), focused shortcut/action coverage (4 files,
  30 tests), the full suite (69 files, 546 tests), TypeScript, and ESLint.

### [x] Complete registered-tool render smoke coverage

Area: tool components / regression safety

Problem: Rendering coverage is broad but not complete for every registered tool. With 30 tools,
uncovered import-time crashes or missing mocks can still slip through.

Expected outcome: Every entry in `src/app/tool-registry.ts` has at least one test that renders the
tool shell or exercises exported pure utilities.

Acceptance criteria:

- A registry-driven test identifies registered tools that lack a corresponding smoke or utility
  test.
- Each missing tool gets a focused test in the established `src/tools/__tests__/` location.
- Heavy dependencies such as Monaco, Mermaid, workers, Tauri APIs, and file APIs are mocked through
  shared test setup rather than one-off fragile mocks.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/app src/tools/__tests__
```

Completed 2026-07-30:

- Added a registry-driven coverage manifest that maps every registered tool ID to a focused test and
  verifies that each mapped test file exists.
- Added missing root-shell render coverage for CSV Tools and YAML Tools using the shared Monaco,
  worker, and tool-state test setup.
- Verified all 30 registered tools have focused render or utility coverage in the established
  `src/tools/__tests__/` location.
- Verified the app/tool slice (42 files, 375 tests), focused registry/CSV/YAML coverage (3 files, 13
  tests), the full suite (70 files, 549 tests), TypeScript, and ESLint.

### [x] Add focused API Client persistence and import/export coverage

Area: Network tools / saved user data

Problem: API Client stores environments, collections, requests, headers, body modes, auth metadata,
and imported requests. This is a high-value data surface with multiple persistence paths.

Expected outcome: Saved requests and imports survive reloads without corrupting auth, headers, body
mode, or collection relationships.

Acceptance criteria:

- Tests cover saving, updating, deleting, and loading environments, collections, and requests.
- Import tests cover multiple collections, conflicting IDs, headers, auth metadata, and body modes.
- MCP exposure for saved API requests continues redacting secrets unless explicitly allowed.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/tools/__tests__/api-client.test.tsx src/lib src/stores
```

Completed 2026-07-30:

- Added store coverage for loading, saving, updating, and deleting environments, collections, and
  requests, including the SQLite cascade reflected immediately in local request state.
- Added direct DB coverage for complete JSON serialization, relationship restoration, ordered
  transactional imports, and rollback after a failed request write.
- Cockpit JSON exports now use collection names understood by the importer, preserving collection
  relationships across export/import instead of persisting installation-specific IDs.
- Added multi-collection import coverage proving conflicting source IDs are ignored while headers,
  JSON/text body modes, bearer/basic auth metadata, and fresh collection relationships survive.
- Added a Rust MCP regression test proving saved API request secrets remain redacted unless explicit
  secret exposure is enabled.
- Verified the focused frontend slice (4 files, 37 tests), the full suite (72 files, 561 tests),
  TypeScript, ESLint, and the focused Rust MCP test.

### [x] Harden MCP server security and lifecycle coverage

Area: MCP server / local agent access

Problem: The MCP server exposes local data and saved API request metadata. Reliability and security
depend on correct opt-in defaults, bearer-token handling, read-only defaults, secret redaction, and
clean start/stop/restart behavior.

Expected outcome: MCP remains local-only, opt-in, least-privilege by default, and resilient across
settings changes.

Acceptance criteria:

- Tests or documented Rust checks cover disabled-by-default behavior, key rotation, start/stop,
  restart after settings changes, read-only defaults, and secret redaction.
- Manual smoke confirms the server binds only to `127.0.0.1`.
- Errors surface as non-blocking UI feedback and do not prevent app startup.

Verification:

```bash
cd apps/cockpit/src-tauri
cargo check
cargo clippy -- -D warnings
```

Also run the MCP section of `documentation/RELEASE_SMOKE_TESTS.md`.

Completed 2026-07-30:

- Expanded frontend coverage for disabled-by-default startup, read-only defaults across every
  resource, explicit auto-start, start/stop/restart, permission changes, port changes, and key
  rotation.
- Failed native lifecycle/settings calls now reapply and repersist the last accepted settings
  instead of leaving auto-start, port, API key, or the running endpoint out of sync.
- MCP initialization failures, including settings persistence failures, now leave the app usable
  with stopped/error status and non-blocking toast feedback.
- Added Rust authorization checks for missing, malformed, wrong, current, and rotated bearer keys,
  plus loopback-only validation, an actual loopback listener bind smoke, and key-generation checks.
- Retained API request auth-secret redaction coverage with exposure disabled and explicitly enabled.
- Expanded the release smoke path to verify localhost binding, authentication/key rotation,
  least-privilege changes, redaction, restart/port changes, stop behavior, and safe failure feedback.
- Verified the MCP frontend focus (2 files, 15 tests), full Vitest suite (72 files, 567 tests), all
  22 Rust tests, TypeScript, ESLint, Cargo formatting/check, and strict Clippy.

### [x] Expand file open, file drop, and save-output tests

Area: filesystem flows / user workflows

Problem: File-backed workflows touch Tauri dialog, filesystem permissions, tool action dispatch, and
tool-local parsing. These flows are release-critical and can regress without failing pure utility
tests.

Expected outcome: Text-backed tools consistently open, accept drops, parse input, and save output
with clear errors.

Acceptance criteria:

- Tests cover `open-file`, dropped text files, unsupported/binary file handling, save success, and
  save cancellation/error feedback.
- At least Code Formatter, JSON Tools, Markdown Editor, and Image Tool have representative coverage
  for their file-backed behavior.
- Capability permissions remain minimal in `src-tauri/capabilities/default.json`.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/hooks src/components src/tools/__tests__
```

Completed 2026-07-30:

- Added direct file-dialog coverage for open/save success, cancellation, read/write failures,
  filename extraction, and binary/control-heavy content rejection.
- File drops now use the same guarded text reader as the open dialog and surface unsupported or
  unreadable file errors through workspace feedback instead of logging them only.
- Wired global open/save actions into Code Formatter, JSON Tools, and Markdown Editor, with focused
  coverage for loaded content, save success, cancellation, and write-error feedback.
- Added Image Tool coverage for rejected non-image drops and canvas export failures.
- Verified global shortcut error handling and drop-listener cleanup.
- Kept `src-tauri/capabilities/default.json` unchanged; filesystem access remains limited to the
  existing dialog-selected text/image workflows and scoped write permissions.
- Verified the focused filesystem slice (7 files, 87 tests), full suite (74 files, 593 tests),
  TypeScript, and ESLint.

## P2 - Quality Ratchets and Maintainability

### [x] Repair the `lint` package script

Area: quality gates / tooling

Problem: `bun run lint` exited 127 with `eslint: command not found`, so the documented lint gate was
not runnable locally and any local "lint passing" claim made via that script was vacuous. The same
applied to `bun run build` (`vite: command not found`) and `bun run tauri build`
(`tauri: command not found`) — every package script that calls a local binary by bare name.

Expected outcome: The documented commands actually run.

Completed 2026-07-30:

- Root cause was not in this repo. The agent harness sets `BASH_ENV=~/.claude/bash_env.sh`, which
  bash sources for every non-interactive shell, and that file did a hard `export PATH=...`. Because
  it runs _after_ the environment is assembled, it discarded both the `node_modules/.bin` entry that
  `bun run` prepends for exactly this purpose and any inline `PATH="..." cmd` prefix from the caller.
  So the scripts were correct and the shell was lying to them.
- `bash_env.sh` now appends only the directories that are missing instead of assigning, which
  preserves caller precedence. It also adds `$HOME/.cargo/bin`, so `cargo` no longer needs a prefix.
- Verified after the change with no PATH prefix at all: `bun run lint` exits 0, `bun run build`
  succeeds, and `bun run tauri build` produces both the `.app` and the `.dmg`. Previously-prefixed
  invocations still work unchanged — 78 files / 650 tests pass either way.
- No `package.json` script was modified; none was broken.

### [x] Re-examine the five worker mocks that were never active

Area: test integrity

Problem: `vitest.config.ts` declared aliases as an object whose first key was a bare `'@'`. Vite
takes the first matching alias, and `'@'` matches every `@/...` specifier, so the
`@/workers/{typescript,formatter,refactoring,diff,xml}.worker?worker` mock entries below it never
applied. Those five workers silently resolved to Vite's no-op worker stub for the lifetime of the
config. The alias map was converted to an ordered array while fixing the Regex Tester, so the mocks
are now live for the first time.

The suite passes at 76 files / 623 tests with the mocks active, so nothing is currently broken. The
concern is retrospective: any coverage those five tools' tests appeared to provide over worker
round-trips was not real, and the previous 593-test baseline was weaker than the count suggested.

Expected outcome: Confidence that worker-backed tool tests exercise what they claim to.

Acceptance criteria:

- Review the formatter, diff, xml, typescript, and refactoring tool tests against the now-live mocks
  and confirm each asserts real worker round-trip behaviour rather than passing vacuously.
- Add a guard against silent alias shadowing — a test asserting each worker specifier resolves to the
  mock, or a comment plus ordering check in the config.
- Cross-check the completed "Add worker RPC round-trip regression coverage" P0 item above; part of
  its claimed coverage ran against a stub.

Completed 2026-07-31:

- Confirmed the mocks were live, not vacuous — the retrospective concern in the Problem statement
  above was worse than stated. The five workers weren't matching a benign "Vite no-op worker stub";
  `src/__mocks__/worker.ts` was a hand-written `postMessage()` that discarded the message and never
  called `onmessage`, so every call from `typescript`, `formatter`, `refactoring`, `diff`, and `xml`
  returned a promise that never settled. Formatter/diff/xml/typescript/refactoring tool tests were
  entirely render/UI assertions plus direct unit calls into pure helpers — not one asserted on actual
  worker output, so nothing could have failed even though the mock was silently broken.
- Extracted each worker's pure logic into a sibling `*.api.ts` module (`typescript.api.ts`,
  `formatter.api.ts`, `diff.api.ts`, `xml.api.ts`, `refactoring.api.ts`) that both the real
  `*.worker.ts` (now just `handleRpc(api)` over the extracted functions) and a new mock import —
  mirroring the existing `regex.api.ts` / `regex-worker.ts` split. No logic is duplicated between the
  real worker and its mock.
- Added five real per-worker mocks (`src/__mocks__/{typescript,formatter,diff,xml,refactoring}-worker.ts`)
  that parse the real `{id, method, args}` RPC request, run the real extracted logic, and reply via
  `queueMicrotask` with `{id, result}` or `{id, error}` — the same pattern as `regex-worker.ts`.
  Verified all five dependencies (TypeScript compiler, Prettier standalone + sql-formatter, the `diff`
  package, `@xmldom/xmldom`, and `jscodeshift`) are pure JS/npm packages with no `self`-only or real
  `Worker`-only API dependency, so all five run correctly in-process under Vitest/Node — no worker
  needed a stub-with-a-comment fallback.
- Updated `vitest.config.ts` to map each of the five `@/workers/*.worker?worker` specifiers to its own
  live mock, ahead of the bare `'@'` entry (order-matters comment retained). Deleted the now-unused
  `src/__mocks__/worker.ts` no-op stub — nothing else referenced it.
- Added worker round-trip tests to all five affected tool test files
  (`code-formatter.test.tsx`, `diff-viewer.test.tsx`, `xml-tools.test.tsx`, `ts-playground.test.tsx`,
  `refactoring-toolkit.test.tsx`) that drive the component through the UI and assert on output that
  only the real worker logic can produce: Prettier reformatting messy JS and a real parse-error
  message, a real unified diff patch swapping in the diff view, a real `@xmldom/xmldom` validation
  error and reformatted XML, TypeScript-to-JS transpilation output plus a real type-checker
  diagnostic, and a real jscodeshift `var` → `const` transform applied through the Apply button.
  json-tools and yaml-tools share the formatter worker and benefit from the same live mock without
  additional changes.
- Added `src/workers/__tests__/worker-mock-aliases.test.ts`, which dynamically imports each of the
  five `@/workers/*.worker?worker` specifiers, instantiates the factory, and drives a real RPC call
  end-to-end — proving the specifier resolves to a live mock and not the bare `@/...` fallback or a
  no-op. This is a stronger guard than inspecting config text: an alias-ordering regression makes
  these tests time out waiting for `onmessage`, or throw at import time.
- Verified all 13 new tests fail as expected: temporarily repointed the five aliases at a no-op stub,
  confirmed every new round-trip and alias-guard test failed (timeouts on `onmessage`), then restored
  `vitest.config.ts` from the working version and re-ran the full suite to confirm it was back to
  passing.
- Cross-checked "Add worker RPC round-trip regression coverage" (P0, above) — confirmed and annotated
  with a correction note in place: its `handleRpc` coverage is real but only exercises a toy `{ add }`
  API, not any actual worker, so the round-trip gap this item closes was real and is now closed.
- Verified the full suite (79 files / 664 tests, up from 78 files / 650), TypeScript, and ESLint.
- Left open: none. All acceptance criteria met — round-trip assertions added, alias-shadowing guard
  added, P0 cross-check done and annotated.

### [x] Relocate `useToolState` tests to the documented location

Area: test organisation

`src/tools/__tests__/useToolState.test.ts` covers a hook, not a tool, and belongs in
`src/hooks/__tests__/`. Left in place during the P0 fix to keep that diff scoped. Move it and confirm
no other test files sit in the wrong directory.

Completed 2026-07-31:

- `git mv`'d `src/tools/__tests__/useToolState.test.ts` → `src/hooks/__tests__/useToolState.test.ts`.
  Uses `@/` alias imports throughout, so no import changes were needed.
- The sweep for other misplaced files found a second one: `src/tools/__tests__/sidebar.test.tsx`
  tests `SidebarItem`, `SidebarGroup`, `SidebarPinned`, and `SidebarCollapsedGroup` from
  `src/components/shell/` — components, not a tool. Moved it to
  `src/components/shell/__tests__/sidebar.test.tsx`, alongside the other shell component tests
  already living there (`CommandPalette.test.tsx`, `NotesDrawer.test.tsx`, etc.).
- Checked every remaining file in `src/tools/__tests__/` against its imports; all import from
  `@/tools/<id>/...` or tool-scoped test utilities and are correctly placed. `test-setup.ts` and
  `test-utils.tsx` are shared fixtures, not tests, and stay where `vitest.config.ts` and the other
  tool tests expect them.
- Both moved files pass in their new locations; full suite still green (79 files / 664 tests,
  unchanged from before the move).

### [x] Narrow the re-allowed `className` in the markdown sanitize schema

Area: markdown rendering / defense in depth

`markdownSanitizeSchema` re-allows `className` on `code` and `span` as an unrestricted string, where
`defaultSchema` restricts it to `/^language-./`. The widening is needed for the `hljs-*` classes
rehype-highlight emits, but it is broader than required — a prefix restriction such as
`/^(hljs|language)-/` plus the bare `hljs` would cover the real output. Likewise `input` `type` is
allowed as any value where only `checkbox` is ever produced.

Not currently exploitable: both pipelines run `remarkRehype` with `allowDangerousHtml: false` and
neither uses `rehype-raw`, so no user-controlled string can reach a `className` or `type` attribute —
those elements can only be produced by remark/rehype-highlight/remark-gfm themselves. The risk is
future: adding a raw-HTML pass without re-auditing this schema would turn it into a live CSS/class
injection surface on user-authored notes. Tighten it while the reason is still fresh, and keep the
`hljs` highlighting test as the guard.

Completed 2026-07-31:

- Restricted `code`/`span` `className` to hast-util-sanitize's tuple/regex syntax:
  `['className', /^hljs-/, /^language-/, 'hljs']`. Restricted `input`'s `type` to
  `['type', 'checkbox']` and `disabled` to `['disabled', true]`, explicitly, rather than relying on
  `defaultSchema`'s own (currently equivalent) restriction.
- Verified against the installed `hast-util-sanitize@5.0.2` by sanitizing hand-built hast trees
  directly (both before and after the change): `findDefinition` picks the _first_ array entry
  matching a given property name, so the new restrictive tuples must be listed before any spread of
  `defaultSchema`'s own entries for the same property, or they are silently never consulted. Got this
  wrong on the first pass (spread first, tuple second — the tuple was dead code) and caught it with
  that direct check before it shipped.
- That same check showed the pre-existing code was _not_ actually exploitable for `input`'s
  `type`/`disabled` — `defaultSchema`'s own restrictive entries for `input` already won under the
  first-match rule, so the unrestricted strings added alongside them were dead code. `span`'s
  `className` genuinely was exploitable: `defaultSchema` has no entry for `span` at all, so the
  unrestricted addition was the only definition and any class value passed through untouched.
  `code`'s widening was also dead code (same first-match reason, in the other direction — the
  default's restrictive `code` entry came first).
- **Pipeline-ordering observation, not fixed here:** `src/lib/markdown.ts` runs `rehypeHighlight`
  before `rehypeSanitize`, so the narrowed schema is load-bearing there. `MarkdownEditor.tsx` runs
  `rehypeSanitize` before `rehypeHighlight`, so rehype-highlight's classes are added _after_
  sanitization and are never sanitized at all in that pipeline — the schema is inert for `className`
  in that order (though still meaningful for `input`/`type`, which comes from GFM task lists parsed
  earlier). Not reordering either pipeline as part of this change; flagging for a follow-up.
- Since neither pipeline uses `rehype-raw`, markdown source can't inject raw HTML to reach `code`,
  `span`, or `input` through `processMarkdown()` directly (confirmed empirically — raw HTML tags in
  markdown source are dropped entirely, not parsed as elements). The new tests therefore exercise
  `markdownSanitizeSchema` directly against hand-built hast trees via rehype-sanitize's transform,
  rather than through `processMarkdown()`, to test the schema's actual guarantee rather than what the
  current pipeline happens to produce.
- Added four tests: arbitrary `className` stripped from `code` (keeping `hljs`/`language-js`),
  arbitrary `className` stripped from `span` (keeping `hljs-keyword`), non-`checkbox` `input` `type`
  stripped and defaulted back to `checkbox`, and a `checkbox` `input`'s `type`/`checked` preserved.
  All prior tests (including the `hljs` highlighting guard and the `javascript:`/`data:` href tests)
  still pass.
- Verified `npx tsc --noEmit`, `bun run lint`, `bunx vitest run` (79 files / 668 tests, up from 664).

### [x] Use the `void` prefix on async click handlers in the export paths

Area: convention consistency

`onClick={handleDownload}` in `ImageTool.tsx`, `SnippetsManager.tsx`, `MarkdownEditor.tsx`, and
`MermaidEditor.tsx` (two sites) passes an async function directly. Harmless today — every one of
those handlers catches internally and surfaces the failure through `setLastAction` — but `CLAUDE.md`
documents `void handler()` for async handlers, and the current form would silently produce an
unhandled rejection if any of them ever grows a throw outside its `try`.

Completed 2026-07-31:

- The TODO's file list was partly stale: `MarkdownEditor.tsx` was already fully compliant (lines
  922-949 already use `void handleX()`) — nothing to do there. `MermaidEditor.tsx` had four sites, not
  two: `handleCopySvg`, `handleDownloadSvg`, `handleCopyPng`, `handleDownloadPng`.
- Widened the scope repo-wide rather than fixing only the four named files: re-swept every
  `onClick={handleX}` and `onClick={() => handleX(...)}` in `src/**/*.tsx` against handlers defined
  `async`, found ~28 sites across 11 files (larger than the ~22/9 estimate handed off — the estimate
  missed `CopyButton.tsx`'s `handleCopy`, `NotesDrawer`/`SnippetsManager`'s `handleRemoveTag`, and
  three sites in `CollectionsSidebar.tsx`'s context menus). Fixed all of them: same one-line change,
  and leaving known violations in unnamed files would have applied the convention half-way.
- Files touched: `SettingsPanel.tsx`, `CollectionsSidebar.tsx`, `EnvironmentModal.tsx`,
  `CssValidator.tsx`, `JsonSchemaValidator.tsx`, `JsonTools.tsx`, `ImageModal.tsx`,
  `MermaidEditor.tsx`, `SnippetsManager.tsx`, `YamlTools.tsx`, `ImageTool.tsx`, `CopyButton.tsx`.
- `ImageTool.tsx`'s `handleDownload`/`handleCopyImage` are passed to `ExportPanel` as
  `onDownload`/`onCopy` props (typed `() => void`); wrapped at the consuming `onClick` inside
  `ExportPanel` rather than at the prop definition, keeping the prop's fire-and-forget contract
  explicit at the call site.
- Confirmed via a second, independent regex sweep after the edits that no `onClick={asyncHandler}` or
  `onClick={() => asyncHandler(...)}` site remains unwrapped anywhere in `src/**/*.tsx`.
- `handleToggleFavorite` and `handleDuplicate` in `SnippetsManager.tsx` have no internal `try`/`catch`
  — the `void` prefix suppresses the unhandled-rejection warning but does not give the user any
  feedback if the underlying store call fails. Flagging as follow-up candidates for real error
  handling; not redesigned in this pass.
- Verified `npx tsc --noEmit`, `bun run lint`, `bunx vitest run` (79 files / 668 tests, unchanged by
  this item — it's a behavior-preserving refactor).

### [x] Cover init-rejection recovery for the other six stores

Area: test parity

The P1 bootstrap fix applied a textually identical `initPromise = null` rejection clear to seven
stores, but only `settings.store.test.ts` has a regression test for it. `snippets.store.test.ts` and
`prompt-templates.store.test.ts` do not exist at all; the `notes`, `history`, `api`, and `mcp` test
files exist but do not cover this path. Functional risk is low because the code is identical, but
nothing stops one of them being refactored back. A shared helper asserting the failed-then-retried
sequence, applied to all seven, would be cheap.

Completed 2026-07-31:

- Added `src/stores/__tests__/init-rejection-helper.ts` — a shared, non-test `.ts` module (mirrors
  `src/tools/__tests__/test-utils.tsx`, which is likewise a fixture rather than a suite; neither
  matches vitest's `*.test.ts(x)` glob) exporting `expectInitRejectionRecovers()`. It takes closures
  for arranging the failing/succeeding call, running `init()`, and asserting state before/after, so
  each store's differing state shape (see below) can plug in without the helper needing to know it.
- Refactored `settings.store.test.ts`'s existing rejection test onto the helper — one implementation,
  not eight copies.
- Applied it to `api`, `mcp`, `notes`, `history` (existing files, new nested `describe` blocks using
  `vi.resetModules()` + dynamic `await import(...)`, matching the existing settings/mcp pattern) and
  created `snippets.store.test.ts` / `prompt-templates.store.test.ts` from scratch, scoped to only the
  init-rejection path as directed — no broader coverage added for those two stores in this pass.
- Module-level `initPromise` leaks across tests sharing one module instance, which is why every new
  test does `vi.resetModules()` in `beforeEach` and dynamically imports the store fresh inside the
  test body rather than relying on the file's top-level static import. Documented this requirement in
  the helper's docstring since it is easy to silently get wrong (a test would just never observe a
  rejection because a prior test already latched a resolved `initPromise`).
- `api.store` has no `initialized` field, so its assertion checks that `environments` stays at its
  module-fresh default (`set()` never ran) instead.
- `mcp.store` needed a different failure-injection strategy, found by reading the code rather than
  assuming the template generalized: its `init()` wraps `getSetting`/`persistSettings`/`invoke` in an
  _internal_ try/catch that swallows every realistic failure and never rethrows (confirmed by the
  existing "keeps initialization non-blocking..." test in the same file) — so a plain
  `getSetting` rejection never reaches the outer `.catch(() => { initPromise = null; throw err })`
  guard at all, and the P1 fix's rejection-clearing code is otherwise unreachable for mcp.store. The
  only path that does reach it is `useUiStore.getState().addToast()` throwing from inside the internal
  catch block (not itself wrapped in a nested try), which the new test uses deliberately, with a
  comment explaining why. This also surfaced a genuine asymmetry, documented in the test rather than
  smoothed over: because `set({ initialized: true, ... })` already ran before `addToast()` throws, a
  rejected mcp.store `init()` call leaves `initialized: true` — unlike the other six stores, which
  leave it `false`.
- Did not need to report any store as unable to cleanly reset module state — all seven store modules
  reload cleanly via `vi.resetModules()` + dynamic import.
- Verified `npx tsc --noEmit`, `bun run lint`, and the full suite (see final verification below).

### [x] Give `getDb()` the same rejection recovery the stores got

Area: SQLite / lifecycle

`getDb()` in `src/lib/db.ts` caches `dbPromise` and never clears it on rejection — the same defect
fixed in all seven Zustand stores under the P1 bootstrap item. A transient `Database.load()` failure
latches for the process lifetime and every subsequent DB call fails. It was left alone during that
fix because it is a documented singleton rather than a store, and no failure has been observed in
practice. Apply the same `.catch(() => { dbPromise = null; throw err })` treatment and add a
failed-then-successful test.

Completed 2026-07-31:

- `getDb()` now chains `.catch((err) => { dbPromise = null; throw err })` after the `Database.load()`
  `.then(...)` that also runs the two `PRAGMA` statements, so the cache clears whether `Database.load()`
  itself rejects or one of the two `conn.execute()` PRAGMA calls inside the `.then` does.
- Added two tests to `src/lib/__tests__/db.core.test.ts` rather than creating a new `db.test.ts`: that
  file already locally `vi.mock`s `@tauri-apps/plugin-sql` with a `vi.hoisted` `load: vi.fn()`
  (independent of the static `src/__mocks__/tauri-plugin-sql.ts` used elsewhere via the vitest alias),
  so it was the natural home and required no changes to the shared static mock — every other test
  using that mock is unaffected. One test rejects `Database.load()` itself and retries; the other
  makes the connection load successfully but the first `PRAGMA` `execute()` reject, confirming the
  cache clears on that path too, not just the `Database.load()` path.
- Verified `npx tsc --noEmit`, `bun run lint`, and the full suite (see final verification below).

### [x] Move tool capability flags into the tool registry

Area: tool registry / drift prevention

Problem: `src/app/tool-registry.ts` is documented as the single source of truth for tools, but three
hardcoded tool-id sets live outside it and must be kept in sync by hand:

- `OPEN_FILE_TOOLS` and `SAVE_FILE_TOOLS` in `src/lib/tool-actions.ts`
- `MONACO_TOOL_IDS` in `src/components/shell/Workspace.tsx`

All three are currently correct — this is a latent risk, not an active bug. But nothing enforces it.
A renamed or removed tool leaves a stale string that fails silently: the file-open shortcut reports
"not supported by the active tool", or the workspace applies the wrong overflow mode. Neither
surfaces as a type error or a test failure.

Expected outcome: Tool capabilities are declared once, next to the tool.

Acceptance criteria:

- `supportsOpenFile`, `supportsSaveFile`, and `usesMonaco` become fields on the registry entry type.
- `tool-actions.ts` and `Workspace.tsx` read from the registry; the three id sets are deleted.
- A test asserts every capability flag refers to a registered tool id.

Completed 2026-07-31:

- Added `supportsOpenFile?: boolean`, `supportsSaveFile?: boolean`, and `usesMonaco?: boolean` to
  `ToolDefinition` in `src/types/tools.ts`, all optional. Chose optional over an exhaustive
  `Record<keyof ...>`-style required trio deliberately: 25 of 30 tools need at least one `false`, and
  most need all three, so making every entry spell out three `false`s would add noise disproportionate
  to the benefit — only the tools that actually opt in carry the field. Tradeoff versus a
  compile-time-exhaustive shape: adding a new capability flag later still requires remembering to opt
  tools in by hand, same as before, just declared next to each tool instead of in a separate `Set`.
- Migrated all 25 flag placements from the three deleted `Set`s onto the matching `TOOLS` entries in
  `src/app/tool-registry.ts`, preserving the exact existing capability assignment (verified by diffing
  against the original sets, not by re-deriving from scratch): `supportsOpenFile` on 5 tools
  (`api-client`, `code-formatter`, `csv-tools`, `json-tools`, `markdown-editor`), `supportsSaveFile` on
  3 (`code-formatter`, `json-tools`, `markdown-editor`), `usesMonaco` on 17 (`api-client`,
  `code-formatter`, `css-to-tailwind`, `css-validator`, `csv-tools`, `curl-to-fetch`, `diff-viewer`,
  `html-validator`, `json-schema-validator`, `json-tools`, `markdown-editor`, `mermaid-editor`,
  `refactoring-toolkit`, `snippets`, `ts-playground`, `xml-tools`, `yaml-tools`).
- Added `OPEN_FILE_TOOL_IDS`, `SAVE_FILE_TOOL_IDS`, and `MONACO_TOOL_IDS` to `tool-registry.ts`,
  each derived from `TOOLS.filter(...)` rather than hand-listed, and deleted the three original `Set`s
  from `tool-actions.ts` and `Workspace.tsx`. Both now import the derived sets from the registry.
- Checked for the import-cycle risk called out in the brief: `tool-actions.ts` and `Workspace.tsx` now
  statically import from `@/app/tool-registry`, which itself only statically imports
  `@/types/tools`, Phosphor icons, and React — every tool component import is behind `React.lazy()`,
  so no tool component module is pulled in at `tool-registry.ts` evaluation time. `tsc --noEmit`, the
  full Vitest run, and manual inspection of `tool-registry.ts`'s imports confirm there is no cycle;
  a separate lightweight capabilities export was not needed.
- Updated `Workspace.test.tsx`'s `vi.mock('@/app/tool-registry', ...)` to also export
  `MONACO_TOOL_IDS`, `OPEN_FILE_TOOL_IDS`, and `SAVE_FILE_TOOL_IDS` (scoped to the two tool ids that
  test actually renders) — the mock previously only exported `getToolById`, and importing the derived
  sets in `Workspace.tsx`/`tool-actions.ts` made that mock incomplete, which surfaced immediately as
  two failing tests rather than a silent gap.
- Extended `src/app/__tests__/tool-registry.test.ts` (rather than duplicating a new file) with a
  `describe('tool capability flags', ...)` block. Per the brief's own observation, "every flag refers
  to a registered tool id" is close to tautological once the sets are `TOOLS.filter(...)` outputs — it
  can only fail on a typo'd filter predicate. Noting that explicitly in the test file's comment. To
  make the guard actually earn its keep, the tests also pin the exact expected membership (5 / 3 / 17,
  listing every id) against the audited values above, so a mass-deletion or bad merge that silently
  drops a tool's flags fails loudly instead of passing vacuously.
- Verified `npx tsc --noEmit`, `bun run lint`, and the full suite: 81 files / 682 tests, up from the
  79 files / 668 tests baseline (added by this item and the two above it).

### [x] Derive the persisted settings object instead of hand-listing keys

Area: settings persistence / silent data loss

Problem: `update()` in `src/stores/settings.store.ts` builds the object it persists by enumerating
all eighteen `AppSettings` fields by hand. Adding a field to `AppSettings` and forgetting to add it
here compiles cleanly, passes lint, and passes tests — the setting simply never persists, and the
user sees it silently reset on every relaunch. It is a bug waiting for the next feature.

Expected outcome: Adding a settings field cannot silently skip persistence.

Acceptance criteria:

- Derive the persisted object from the keys of `DEFAULT_SETTINGS` rather than restating them.
- If the explicit list is kept for typing reasons, make omission a compile error via an exhaustive
  `Record<keyof AppSettings, true>` key map.
- A test asserts every `AppSettings` key round-trips through `update()` and `init()`.

Completed 2026-07-31:

- Added an exhaustive `APP_SETTINGS_KEY_MAP: Record<keyof AppSettings, true>` in
  `src/stores/settings.store.ts`, plus `APP_SETTINGS_KEYS = Object.keys(APP_SETTINGS_KEY_MAP) as
(keyof AppSettings)[]`. `update()` now builds the persisted object via a `pickAppSettings()` helper
  that loops over `APP_SETTINGS_KEYS` instead of restating all eighteen fields. A generic
  `assignAppSettingsKey<K extends keyof AppSettings>(target, source, key: K)` helper binds the key
  type per call to avoid TypeScript widening the indexed assignment to `never` inside the loop.
- Verified the exhaustiveness mechanism directly: temporarily added a 19th field
  (`_tempTestField19: boolean`) to both the `AppSettings` type and `DEFAULT_SETTINGS` in
  `src/types/models.ts`, ran `npx tsc --noEmit`, and confirmed it failed with `TS2741: Property
'_tempTestField19' is missing in type '{ ... }' but required in type 'Record<keyof AppSettings,
true>'` at `settings.store.ts`'s key map — i.e. the `Record<keyof AppSettings, true>` map is the
  mechanism that turns a forgotten field into a compile error, not just a runtime gap. Reverted both
  temporary additions afterward.
- Added a test asserting the persisted object's keys exactly match `DEFAULT_SETTINGS`'s keys (no
  field silently dropped), and a round-trip test that drives every `AppSettings` key through
  `update()` then `init()` and asserts each comes back unchanged (`editorKeybindingMode` excluded from
  the driven set since `init()` force-normalizes it to `'standard'` by design).

### [x] Tidy shell-level React and shortcut patterns

Area: shell / code quality

Small cleanups found while auditing; none is user-visible on its own.

- `src/hooks/useGlobalShortcuts.ts` defines nine near-identical `switchWorkspaceTabN` callbacks and
  nine `useMemo` combos that differ only by index. Generate them from a loop over indices.
- Each `useKeyboardShortcut` call registers its own `window` keydown listener — roughly 24 listeners
  for the shell. A single dispatching listener over a combo table would do.
- `useKeyboardShortcut` calls `target.closest(...)` on `event.target` without confirming it is an
  `Element`. Guard it; a non-element target throws inside the handler.
- `Workspace.tsx` resets its error boundary by calling `errorBoundaryRef.current?.setState(...)` from
  outside the component. Expose an imperative `reset()` method on the boundary instead of mutating
  another component's state.
- `NotesDrawer`'s `MarkdownRenderer` calls `processMarkdown(content).then(setHtml)` with no
  cancellation, so rapid edits can resolve out of order and render stale HTML. Add a cancel flag.
- `src-tauri/Cargo.toml` still declares `version = "0.1.0"` while `tauri.conf.json` and
  `package.json` are at `0.1.51`. Cosmetic today because `getVersion()` reads the Tauri config, but
  it makes crate metadata misleading.

Completed 2026-07-31:

- Replaced `useGlobalShortcuts.ts`'s nine `comboN` memos and nine `switchWorkspaceTabN` callbacks with
  a single `digitCombos = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1),
mod: true })), [])`, one `switchWorkspaceTabAt(index)` callback, and a fixed-length `for` loop
  calling `useKeyboardShortcut(digitCombos[i]!, () => switchWorkspaceTabAt(i))`. The loop is
  fixed-length (always 9 iterations, never conditional or data-length-dependent), so it does not
  violate rules-of-hooks in practice; ESLint's `react-hooks/rules-of-hooks` still flags it statically,
  so it carries a scoped `eslint-disable-next-line` with a comment explaining why it's safe.
  `useGlobalShortcuts.test.ts` (10 tests) passed unmodified — it asserts by registered combo, not by
  call-site shape.
- Evaluated consolidating the ~28 `useKeyboardShortcut` call sites onto one shared `window` listener
  and judged it worth doing (not abandoned): the public `useKeyboardShortcut(combo, handler)` API
  didn't need to change, so the entire risk was containable to one file
  (`src/hooks/useKeyboardShortcut.ts`). Rewrote it around a module-level `Set` of registrations (combo
  - handler refs); a single `window.addEventListener('keydown', ...)` attaches when the first
    registration is added and detaches when the last is removed, and dispatch iterates the set,
    preserving per-registration behavior: the editable-target filter, sync and async handler error
    handling (`try`/`catch` plus a `.catch()` on the returned promise), cleanup on unmount, and
    independence from registration order. All 28 existing call sites and their test suites (including
    `useKeyboardShortcut.test.ts`, `useGlobalShortcuts.test.ts`, and consumer tests across
    `base64`, `api-client`, `diff-viewer`, `url-codec`, `code-formatter`) passed unmodified — they
    exercise the hook's public behavior, not its internals.
- Fixed the unchecked `event.target as HTMLElement` cast in `useKeyboardShortcut.ts`. `target
instanceof Element` was tried first but throws at runtime in this project's test environment —
  `vitest.config.ts` uses `environment: 'node'` with a hand-built `jsdom` window in
  `src/test-setup.ts`, which doesn't expose a global `Element` constructor. Replaced it with duck
  typing (`typeof target.closest === 'function' && typeof target.tagName === 'string'`), which works
  regardless of what global constructors exist. Added a test dispatching a keydown with `window` itself
  as the event target, asserting it doesn't throw and the shortcut still fires.
- Added a public `reset(): void` method to `ErrorBoundary` (`src/components/shell/ErrorBoundary.tsx`)
  that calls `this.setState({ hasError: false, error: null })`, and switched both the boundary's own
  "Try Again" button and `Workspace.tsx`'s `errorBoundaryRef.current?.setState(...)` call to
  `errorBoundaryRef.current?.reset()`.
- Rewrote `NotesDrawer`'s `MarkdownRenderer` effect to track a `cancelled` flag, only calling `setHtml`
  if the effect hasn't been cleaned up by the time `processMarkdown` resolves. Added tests for
  no-setState-after-unmount while a render is pending, and for an earlier in-flight request resolving
  after a later one without clobbering the latest result.
- Bumped `src-tauri/Cargo.toml`'s `version` from `0.1.0` to `0.1.54` to match `tauri.conf.json` and
  `package.json`. Confirmed `scripts/bump-version.mjs` only touches `package.json` and
  `tauri.conf.json`, never `Cargo.toml`, so this won't be fought by release automation. Ran
  `cargo check`; it passed and only updated the `cockpit` package's own `version` field in
  `Cargo.lock`.

Verification for all three P2 items above:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
PATH="/opt/homebrew/bin:$PATH" bun run lint
```

### [x] Ratchet ESLint warnings toward zero

Area: static analysis / maintainability

Problem: The current lint script allows up to 100 warnings. That keeps CI green, but it allows new
warning debt unless warning count is actively ratcheted down.

Expected outcome: Warnings are treated as real maintenance work and eventually blocked in CI.

Acceptance criteria:

- Capture the current warning count explicitly.
- Reduce `--max-warnings` in stages: current count, then 25, then 10, then 0.
- Fix or intentionally document every remaining warning category before lowering the threshold.
- Revisit disabled or relaxed rules such as `@typescript-eslint/no-misused-promises` only after the
  current warnings are under control.

Completed 2026-07-31:

- The recon claim of zero warnings was confirmed accurate: `bun run lint` was already clean (0
  warnings) against the `100` ceiling before this item started, so the staged 100→25→10→0 reduction
  had no intermediate warnings to fix — collapsed it directly to `--max-warnings 0` in
  `package.json`'s `lint` script rather than landing three no-op intermediate commits.
- Attempted enabling `@typescript-eslint/no-misused-promises` (previously `'off'`) per the decision
  tree: full-strength first, which surfaced 35 warnings; narrowed to `checksVoidReturn: { attributes:
true, arguments: false, properties: false }` (JSX event-handler props only — the exact class of bug
  the branch's earlier commit `092994e` had already fixed by hand via `void`-prefixing), which brought
  it down to 25, all genuine (async handlers passed where a `() => void` prop was expected). Judged 25
  a "handful of genuine issues" per the task's own threshold and fixed all of them — mostly wrapping
  `onChange`/`onClick`/`onBlur`/`onSave`/`onDownload`/`onCopy` handlers in `void (...)` at the JSX call
  site — across `SettingsPanel.tsx` (13), `Sidebar.tsx` and `SidebarFooter.tsx` (2 each, via their
  shared toggle definitions), `ApiClient.tsx`, `CollectionsSidebar.tsx`, `ImageTool.tsx` (2), and
  `SnippetsManager.tsx` (4). Left the rule at `'warn'` (not `'error'`) since every other rule in this
  config uses `'warn'` and `--max-warnings 0` already makes any warning fail the script.
  `no-misused-promises` was never left on while raising `--max-warnings` to accommodate it — the two
  changes landed together with the ceiling at 0 throughout.
- Before/after: 0 warnings under the old `--max-warnings 100` ceiling before this item; 35 warnings
  once `no-misused-promises` was turned on at full strength (not shipped); 25 warnings once narrowed
  to `checksVoidReturn: { attributes: true }` (not shipped, all fixed instead); 0 warnings in the
  final state, shipped with `--max-warnings 0`.
- Checked whether root-level config files (`eslint.config.js`, `vitest.config.ts`) are linted at all,
  without changing scope: no. `eslint.config.js`'s own `ignores` block excludes `*.config.js` and
  `*.config.ts` (and the `files` glob for the main rule block is scoped to `src/**/*.{ts,tsx}` in the
  first place), so both files run outside ESLint entirely — a syntax or lint issue in either would go
  undetected by `bun run lint`. Left as-is; not in scope for this item.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bun run lint
```

### [x] Fix mcp.store init() error handling that never actually retries

Area: state management / error recovery

Problem: `init()` in `src/stores/mcp.store.ts` wraps its body in its own `try`/`catch` that already
sets error state and shows a toast on failure, then never rethrows. The outer
`.catch((err) => { initPromise = null; throw err })` attached to that same IIFE was written to clear
the cached promise so a later `init()` call retries after a transient failure — but because the inner
catch swallows the error first, the IIFE always resolves successfully, so the outer `.catch` is dead
code and `initPromise` is never cleared on failure. A transient MCP init failure (e.g. a locked
setting read) latches the store in its error state for the rest of the process lifetime; calling
`init()` again just returns the already-resolved promise instead of retrying.

Expected outcome: A failed MCP init can be retried by a later `init()` call, matching the comment's
stated intent and the pattern used elsewhere (e.g. `api.store.ts`'s `init()`, which rethrows).

Acceptance criteria:

- Either let the inner catch rethrow after setting error state (so the outer `.catch` actually runs),
  or drop the outer `.catch` and clear `initPromise` directly in the inner catch.
- A test confirms a failed `init()` allows a subsequent `init()` call to retry rather than reusing the
  stale error-state promise.

Judged priority: P2 — not user-visible today (MCP init failures are rare and already surfaced via
toast), but it silently defeats a retry mechanism the code believes it has.

Completed 2026-07-31:

- Dropped the outer `.catch((err) => { initPromise = null; throw err })` entirely and clear
  `initPromise = null` directly inside the inner catch instead. Verified the ordering is safe: the
  inner catch only runs on the async continuation _after_ an `await` (the first is `getSetting`),
  which is scheduled as a microtask — by the time it runs, the synchronous
  `initPromise = (async () => {...})()` assignment has already completed, so clearing it there is not
  immediately clobbered by that assignment.
- **Deliberate decision — not in the TODO's own acceptance criteria:** did _not_ make the inner catch
  rethrow. `useMcpStore.init()` has exactly one call site — `providers.tsx`'s bootstrap sequence,
  which `await`s it — and MCP is an optional, disabled-by-default feature. Making init() reject would
  turn a degraded MCP server into a full app-startup failure screen, which is strictly worse than the
  bug being fixed. `init()` still resolves on failure, still sets `initialized: true` (so the UI shows
  a degraded MCP rather than a permanent spinner), and now also clears `initPromise` so a later call
  genuinely retries. The `addToast` call is additionally wrapped in its own `try`/`catch` so even an
  unexpected toast failure can't turn this into an unhandled rejection.
- Rewrote `src/stores/__tests__/mcp.store.test.ts`'s rejection test (previously forced `addToast` to
  throw just to reach the now-deleted outer catch, and asserted the broken behavior). The new test
  calls `init()`, fails it via a rejected `getSetting`, asserts `initialized: true` /
  `status.lastError` are set, then calls `init()` again and asserts `getSetting` was called a second
  time — proving the retry actually happens.
- `bunx vitest run src/stores/__tests__/mcp.store.test.ts` — 11/11 passing.

### [x] Add error handling to SnippetsManager's handleDuplicate and handleToggleFavorite

Area: snippets tool / error handling consistency

Problem: In `src/tools/snippets/SnippetsManager.tsx`, `handleDelete` is wrapped by its caller
(`handleDeleteClick`) with `.catch(() => {})`, but the sibling handlers `handleDuplicate` (line ~416)
and `handleToggleFavorite` (line ~449) have no error handling at all — their `await addSnippet(...)`
/ `await updateSnippet(...)` calls can reject (e.g. DB write failure), and both are invoked from JSX
as `void handleDuplicate()` / `void handleToggleFavorite()`, so a rejection becomes an unhandled
promise rejection with no user feedback, unlike every other mutating action in the file.

Expected outcome: Every snippet mutation handler fails visibly (toast) instead of silently or as an
unhandled rejection.

Acceptance criteria:

- Wrap `handleDuplicate` and `handleToggleFavorite` bodies in `try`/`catch`, surfacing failures via
  `setLastAction(..., 'error')` (the pattern already used elsewhere in this file).
- A test forces `addSnippet`/`updateSnippet` to reject and asserts the failure is surfaced rather than
  thrown as an unhandled rejection.

Judged priority: P2 — inconsistent error handling within one file, not a reliability blocker.

Completed 2026-07-31:

- `handleDuplicate` and `handleToggleFavorite` in `src/tools/snippets/SnippetsManager.tsx` now wrap
  their bodies in `try`/`catch`, surfacing failures via `setLastAction('...', 'error')` — the same
  idiom already used by `handleExport`/`handleDownload` in this file.
- **Extended beyond the letter of the TODO, per explicit instruction:** `handleDeleteClick`'s
  `.catch(() => {})` around `handleDelete()` swallowed delete failures with zero user feedback — same
  class of defect as the two handlers named in the TODO. Changed it to
  `.catch(() => setLastAction('Delete failed', 'error'))`.
- Added a new `describe('SnippetsManager — mutation error handling')` block in
  `src/tools/__tests__/snippets.test.tsx` that overrides `add`/`update`/`remove` on the live
  `useSnippetsStore` with rejecting mocks (captured and restored via `afterEach` since the store is a
  shared module instance across the test file) and asserts each failure surfaces through
  `useUiStore`'s `lastAction` instead of throwing.
- `bunx vitest run src/tools/__tests__/snippets.test.tsx` — 27/27 passing (24 existing + 3 new).

### [x] Reconcile markdown rehype plugin order between src/lib/markdown.ts and MarkdownEditor.tsx

Area: markdown rendering / sanitize-vs-highlight ordering

Problem: `src/lib/markdown.ts` (used by `NotesDrawer`'s `MarkdownRenderer`) runs
`.use(rehypeHighlight).use(rehypeSanitize, markdownSanitizeSchema)` — highlight before sanitize. Its
tool counterpart, `src/tools/markdown-editor/MarkdownEditor.tsx`, runs the same two plugins in the
opposite order: `.use(rehypeSanitize, markdownSanitizeSchema).use(rehypeHighlight, { detect: true })`.
Sanitizing after highlighting means the sanitize schema must explicitly allow whatever
classes/attributes `rehypeHighlight` injects or highlighting is silently stripped; sanitizing before
highlighting (the editor's order) avoids that class but means the sanitizer never sees
highlight-injected markup. The two renderers can visibly disagree on the same input, and one of the
two orderings is likely unintentional rather than a deliberate choice.

Expected outcome: Notes and the Markdown Editor tool render syntax-highlighted, sanitized code blocks
identically, and the chosen order is deliberate rather than incidental.

Acceptance criteria:

- Decide the correct order (sanitize-then-highlight is the safer default) and make both pipelines
  match, or document why they must differ.
- A test renders a fenced code block containing an XSS-shaped payload through both pipelines and
  asserts identical, safe output.

Judged priority: P2 — no known exploit today since `markdownSanitizeSchema` still runs either way, but
divergent behavior between two markdown surfaces is exactly the kind of drift that becomes a bug once
either pipeline changes independently.

Completed 2026-07-31:

- **Overriding the TODO's stated preference, deliberately:** the acceptance criteria above suggested
  "sanitize-then-highlight is the safer default." That is backwards. Unified on
  **highlight → sanitize** instead — the order already used by `src/lib/markdown.ts` — so the
  sanitizer is the last thing to touch the tree before output, which is the standard rehype posture.
  `markdownSanitizeSchema` already explicitly allows the `hljs-`/`language-` classes highlighting
  emits and has a passing test (`keeps syntax highlighting classes on fenced code`) pinning that, so
  nothing is lost by sanitizing last.
- Extracted one shared `markdownProcessor` (a `unified()` instance) into `src/lib/markdown.ts`, built
  with `remarkParse → remarkGfm → remarkRehype → rehypeHighlight({ detect: true }) → rehypeSanitize →
rehypeStringify`. `processMarkdown()` now just calls `markdownProcessor.process()`, unchanged from
  the outside for `NotesDrawer`. `MarkdownEditor.tsx` deleted its local, differently-ordered `unified()`
  chain and imports `markdownProcessor` directly; its own `renderMarkdownContent()` wrapper (HTML-escaped
  error reporting) is preserved and now just delegates processing to the shared processor. The two
  surfaces can no longer drift apart because there is only one processor.
- Dropped `remarkRehype`'s explicit `{ allowDangerousHtml: false }` option from the editor's old chain
  — it was already the library default and thus a no-op; the shared processor doesn't pass it either.
- **Visible rendering change for Notes, not a no-op:** the unified pipeline uses `detect: true`
  (matching the editor's prior behavior), so unlabelled code fences in Notes are now
  syntax-highlighted where they previously rendered as plain text. This is an intentional improvement
  and brings Notes in line with the editor, but it is a real behavior change worth calling out.
- `renderMarkdownContent` was exported from `MarkdownEditor.tsx` (previously module-private) so tests
  can exercise it directly rather than only indirectly through component rendering.
- New tests in `src/lib/__tests__/markdown.test.ts`: one confirms unlabelled fences now get
  highlighted (the visible Notes change above), and one renders a fenced code block containing an
  XSS-shaped payload (`<script>`, an `onerror`-bearing `<img>`, and a `javascript:` link, all inside
  the fence) through both `processMarkdown()` and `renderMarkdownContent()` and asserts byte-identical,
  safe output — plus a follow-up assertion that a real (non-fenced) `javascript:` link is still
  stripped by the sanitizer.
- All existing tests in `markdown.test.ts` (GFM tables/images/strikethrough/task-lists,
  `javascript:`/`data:` href stripping) and in `markdown-editor.test.tsx` remain green, unmodified.
- `bunx vitest run src/lib/__tests__/markdown.test.ts src/tools/__tests__/markdown-editor.test.tsx` —
  45/45 passing (14 + 31, up from 12 + 31 baseline — 2 new tests).

### [x] Add an `initialized` field to api.store for consistency with other stores

Area: state management / store consistency

Problem: `settings.store.ts` and `mcp.store.ts` both expose an `initialized: boolean` field so
consumers can distinguish "not yet loaded" from "loaded and empty." `src/stores/api.store.ts` has the
same idempotent `init()` promise-guard pattern but no `initialized` field, so API Client UI code has
no store-level way to know whether the initial DB load has completed versus genuinely having zero
environments/collections/requests.

Expected outcome: `api.store.ts` matches the established pattern used by the other stores.

Acceptance criteria:

- Add `initialized: boolean` to `ApiStore`, defaulting to `false` and set to `true` once `init()`'s
  initial load (success or failure) completes.
- Any UI currently guessing readiness from array emptiness can use the new field instead (optional,
  not required to land in the same change).

Judged priority: P2 — cosmetic/consistency; no observed bug from its absence today.

Completed 2026-07-31:

- Added `initialized: boolean` to `ApiStore` in `src/stores/api.store.ts`, defaulting to `false`.
- Set to `true` only inside the `set()` call on the success path of `init()`'s `Promise.all` load —
  matching `settings.store`'s pattern, **not** `mcp.store`'s. Unlike mcp.store's deliberately
  degraded-mode design (see the mcp.store item above), a failed api.store `init()` leaves `initialized`
  at its default `false` since the `catch` never calls `set()`.
- Did not go hunting for UI call sites inferring readiness from array emptiness, per the TODO's own
  "optional" carve-out — none were found during recon either.
- Extended `src/stores/__tests__/api.store.test.ts`'s existing `expectInitRejectionRecovers` rejection
  test to assert `initialized` stays `false` after the failed `init()` call and flips to `true` after
  the retried, successful one.
- `bunx vitest run src/stores/__tests__/api.store.test.ts` — 5/5 passing.

### [ ] Add a no-regression audit for cockpit non-negotiables

Area: contributor safety / architecture guardrails

Problem: `AGENTS.md` lists critical rules that prevent known failures: DB singleton access, no
StrictMode, no new Tauri windows, DPI conversion, worker imports, theme timing, CSS variables, and
Phosphor icons. Some are checked by hooks, but the coverage should be explicit and easy to run.

Expected outcome: New PRs get fast, deterministic feedback for cockpit-specific architecture rules.

Acceptance criteria:

- Add or document a single audit command that checks the non-negotiables.
- Audit covers `Database.load()` outside `src/lib/db.ts`, `React.StrictMode`,
  `new WebviewWindow`, Comlink `expose`, module worker construction, module-level `applyTheme`,
  missing DPI conversion near window APIs, hardcoded colors, npm/yarn commands, and non-Phosphor
  icons.
- The audit runs in CI or is explicitly required in the PR checklist.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bun run lint
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
```

### [ ] Improve updater behavior coverage

Area: updater / release channel reliability

Problem: The updater depends on GitHub release assets and `latest.json`. Release workflow verifies
asset presence, but UI behavior around network errors, manual checks, automatic checks, and silent
downloads needs focused coverage.

Expected outcome: Update checks are reliable, non-blocking, and clear when offline or when the
manifest is incomplete.

Acceptance criteria:

- Tests cover available update, no update, network failure, malformed manifest, missing platform,
  dismissed notifications, and manual retry.
- Manual smoke confirms automatic checks do not block startup.
- Release workflow still fails when expected platform assets or `latest.json` are missing.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/stores src/components
```

### [ ] Add performance budgets for large inputs

Area: tool responsiveness / desktop UX

Problem: Several tools can process large text, CSV, XML, images, or generated history. Regressions
may show up as UI stalls rather than test failures.

Expected outcome: Large-input handling has practical budgets and protects the main thread where
possible.

Acceptance criteria:

- Define representative large-input fixtures for JSON, XML, CSV, Markdown, Diff Viewer, Regex
  Tester, and Image Tool.
- Measure parse/format/render behavior with repeatable local scripts or Vitest performance checks.
- Add debouncing, workers, chunking, or limits where a tool blocks interaction beyond the agreed
  budget.
- Document any intentional input-size limits in tool UI or troubleshooting docs.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run src/tools/__tests__
```

### [ ] Keep quality docs synchronized

Area: documentation / contributor onboarding

Problem: `README.md`, `PRODUCT_MAP.md`, `TESTING.md`, `RELEASE_SMOKE_TESTS.md`, `AGENTS.md`, and
this backlog can drift as quality work lands.

Expected outcome: Contributors can find the current source of truth without stale test counts,
commands, or status claims.

Acceptance criteria:

- Update test counts in docs when the suite changes materially.
- Move completed release-smoke or testing improvements into `TESTING.md` and
  `RELEASE_SMOKE_TESTS.md`.
- Keep `AGENTS.md` command guidance aligned with CI and package scripts.
- Link new quality artifacts from the README documentation table when they become permanent.

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run
PATH="/opt/homebrew/bin:$PATH" bun run lint
```

## Release Readiness Checklist

Before cutting or promoting a cockpit release, confirm:

- [ ] Cockpit CI is green for the release commit.
- [ ] Frontend typecheck, lint, and Vitest pass locally.
- [ ] Rust `cargo check` and `cargo clippy -- -D warnings` pass locally or have a documented,
      environment-specific exception.
- [ ] Release workflow produced all expected platform artifacts.
- [ ] `latest.json` exists and maps `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and
      `linux-x86_64`.
- [ ] Cross-platform smoke results are recorded against downloaded release artifacts.
- [ ] Any platform-specific defect is documented before the release leaves internal validation.

## Maintenance Notes

- Prefer small PRs that improve one risk area at a time.
- Do not add new npm packages for quality work unless platform APIs and existing tools are
  insufficient.
- New tests should follow established locations: tool tests in `src/tools/__tests__/`, library tests
  in `src/lib/__tests__/`, store tests in `src/stores/__tests__/`, and component tests colocated per
  subdirectory in `src/components/<subdir>/__tests__/` (e.g. `src/components/shell/__tests__/`,
  `src/components/shared/__tests__/`) — there is no single flat `src/components/__tests__/`.
- Keep commands Bun-first and run cockpit commands from `apps/cockpit`.
