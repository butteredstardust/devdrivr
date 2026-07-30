# TODO - Cockpit Quality and Reliability Backlog

Last updated: 2026-07-30

This is the working backlog for bug fixes, quality improvements, and reliability hardening in
`apps/cockpit`. Keep this document focused on actionable engineering work: every item should have
evidence, an expected outcome, acceptance criteria, and a verification path.

## Current Snapshot

Verified locally from `apps/cockpit` on 2026-07-30:

| Gate        | Command                                           | Result                       |
| ----------- | ------------------------------------------------- | ---------------------------- |
| TypeScript  | `PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit` | Passing                      |
| Tests       | `PATH="/opt/homebrew/bin:$PATH" bunx vitest run`  | Passing: 76 files, 623 tests |
| ESLint      | `PATH="/opt/homebrew/bin:$PATH" bunx eslint src`  | Passing with zero warnings   |
| Rust check  | `cargo check` from `src-tauri`                    | Passing                      |
| Rust clippy | `cargo clippy -- -D warnings` from `src-tauri`    | Passing                      |

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
| Notes preview drops tables, images, strikes   | P1       | Reproduced against the real pipeline     | Open   |
| Blob downloads bypass the Tauri save dialog   | P1       | 5 call sites                             | Open   |
| Bootstrap leaks listeners on early unmount    | P1       | Code path in `src/app/providers.tsx`     | Open   |
| Failed store `init()` is cached permanently   | P1       | Shared promise-guard pattern             | Open   |
| Tool capabilities duplicated across 3 id sets | P2       | Registry drift risk                      | Open   |
| `settings.store` hand-rolls persisted object  | P2       | Silent setting loss on future fields     | Open   |

Two further defects surfaced while fixing the P0 items, both filed in P2 below: the `lint` package
script has never been runnable locally, and five worker mocks had never been wired up.

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

### [ ] Fix the Notes markdown pipeline silently destroying content

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

### [ ] Route file downloads through the Tauri save dialog

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

### [ ] Make bootstrap cleanup leak-free and store init recoverable

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

### [ ] Repair the `lint` package script

Area: quality gates / tooling

Problem: `"lint": "eslint src --ext ..."` in `package.json` invokes a bare `eslint`, which does not
resolve under the minimal shell PATH. `bun run lint` exits 127 with `eslint: command not found`. The
documented lint gate has therefore not been runnable locally, and any local "lint passing" claim made
via that script was vacuous. `bunx eslint src --ext .ts,.tsx,.js,.jsx` works and currently reports
zero warnings, so this is a script defect, not lint debt.

Expected outcome: The documented command actually runs the linter.

Acceptance criteria:

- The script uses `bunx eslint` (or otherwise resolves the local binary) and exits 0.
- Confirm whether CI invokes this script; if so, establish why CI has been reporting green and
  whether the gate has been passing for the right reason.
- Update `AGENTS.md` and `CLAUDE.md` command tables to match the working invocation.
- Fold into the ESLint ratchet item below, since `--max-warnings` is meaningless until the script
  runs.

### [ ] Re-examine the five worker mocks that were never active

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

### [ ] Relocate `useToolState` tests to the documented location

Area: test organisation

`src/tools/__tests__/useToolState.test.ts` covers a hook, not a tool, and belongs in
`src/hooks/__tests__/`. Left in place during the P0 fix to keep that diff scoped. Move it and confirm
no other test files sit in the wrong directory.

### [ ] Move tool capability flags into the tool registry

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

### [ ] Derive the persisted settings object instead of hand-listing keys

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

### [ ] Tidy shell-level React and shortcut patterns

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

Verification for all three P2 items above:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bunx vitest run
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit
PATH="/opt/homebrew/bin:$PATH" bun run lint
```

### [ ] Ratchet ESLint warnings toward zero

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

Verification:

```bash
cd apps/cockpit
PATH="/opt/homebrew/bin:$PATH" bun run lint
```

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
  in `src/lib/__tests__/`, store tests in `src/stores/__tests__/`, and component tests in
  `src/components/__tests__/`.
- Keep commands Bun-first and run cockpit commands from `apps/cockpit`.
