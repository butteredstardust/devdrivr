# TODO - Cockpit Quality and Reliability Backlog

Last updated: 2026-07-30

This is the working backlog for bug fixes, quality improvements, and reliability hardening in
`apps/cockpit`. Keep this document focused on actionable engineering work: every item should have
evidence, an expected outcome, acceptance criteria, and a verification path.

## Current Snapshot

Verified locally from `apps/cockpit` on 2026-07-30:

| Gate        | Command                                           | Result                                            |
| ----------- | ------------------------------------------------- | ------------------------------------------------- |
| TypeScript  | `PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit` | Passing                                           |
| Tests       | `PATH="/opt/homebrew/bin:$PATH" bunx vitest run`  | Passing: 69 files, 546 tests                      |
| ESLint      | `PATH="/opt/homebrew/bin:$PATH" bun run lint`     | Passing under current `--max-warnings 100` policy |
| Rust check  | `cargo check` from `src-tauri`                    | Passing                                           |
| Rust clippy | `cargo clippy -- -D warnings` from `src-tauri`    | Passing                                           |

Known context:

- Cockpit is the active app in this monorepo.
- The product map lists 30 registered tools across 7 groups.
- Remaining documented gaps include native worker/SQLite integration, release smoke automation,
  and complete tool render coverage.
- CI already runs frontend lint/typecheck/tests plus Rust `cargo check` and `cargo clippy`.

## How To Use This Backlog

- Work P0 before P1, and P1 before P2 unless a lower-priority item is blocking current release work.
- Convert broad TODOs into small PRs with one clear risk area per PR.
- Keep completed items in this file until the next release branch is cut, then move notable outcomes
  into release notes or the relevant documentation.
- For each PR, update the item with links to tests, manual smoke notes, or follow-up issues.

## P0 - Reliability Blockers

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

### [ ] Complete registered-tool render smoke coverage

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

### [ ] Add focused API Client persistence and import/export coverage

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

### [ ] Harden MCP server security and lifecycle coverage

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

### [ ] Expand file open, file drop, and save-output tests

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

## P2 - Quality Ratchets and Maintainability

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
