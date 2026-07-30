# Cockpit State Review and Roadmap

Date: 2026-06-12
Audience: product, engineering, QA, and release owners

## Executive Summary

Cockpit is in a healthy implementation state. The app has a clear local-first product position, a stable Tauri 2 + React 19 architecture, SQLite-backed persistence, a mature keyboard-driven shell, MCP agent access, auto-update checks, and 30 registered tools across 7 groups.

The current quality gates pass:

| Gate                 | Result                                        |
| -------------------- | --------------------------------------------- |
| TypeScript           | `npx tsc --noEmit` passed                     |
| Unit/component tests | `bunx vitest run` passed: 69 files, 546 tests |
| Lint                 | `bun run lint` passed                         |

The next work should not start with broad rewrites. The highest-value sequence is: fix small product correctness bugs, align documentation with the actual app, harden security/release posture, then invest in cross-platform readiness and higher-confidence end-to-end coverage.

## Current State

### Product Surface

- 30 tools are registered in `src/app/tool-registry.ts`.
- Primary workflows are shell-driven: sidebar, workspace tabs, command palette, notes drawer, settings, shortcuts, send-to menu, status bar, update notification.
- Persistent local data includes settings, tool state, notes, snippets, history, API collections/requests, and prompt templates.
- MCP server exposes notes, snippets, prompt templates, API requests, search, help, introspection, multi-get, and counts over local HTTP with bearer-token auth.

### Architecture Health

- SQLite access is centralized through `getDb()` with a singleton promise, WAL mode, busy timeout, and queued writes.
- Store initialization follows idempotent promise guards.
- Worker tools use the custom `handleRpc` / `useWorker` pattern instead of Comlink.
- Window geometry persistence is DPI-aware.
- Tool state persistence uses in-memory cache plus debounced SQLite writes.
- Tauri remains a single-window app at the UI layer.

### Documentation Health

At review time, documentation was useful but stale in several user-visible places:

- README, Product Map, and cockpit AGENTS disagreed on the registered tool total.
- Settings UI reports the live tool count from `TOOLS.length`, currently 30.
- Product map and testing docs cited older test-suite totals.
- README theme list shows the original 7 themes, while the app supports `system` plus 22 concrete themes.

## Confirmed Bugfixes and Improvements

| Priority | Item                                                               | Why It Matters                                                                                                  | Recommended Fix                                                                                                                                                                                 | Acceptance Criteria                                                                                                                        |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Settings import only accepts the older theme list                  | Export/import settings can fail to round-trip newer themes such as Catppuccin, Dracula, GitHub, Solarized, etc. | Build the valid theme set from `['system', ...ALL_THEMES]` instead of a hardcoded 7-theme list.                                                                                                 | Export settings with each supported theme, import them, and confirm the theme is preserved. Add a focused test.                            |
| P0       | Documentation count drift                                          | Users and contributors cannot trust product docs as the source of truth.                                        | Update README, product map, testing docs, and AGENTS count references to match the registry and test suite. Prefer wording like “registered tools” and avoid duplicating counts where possible. | All tool/test count references match current source or are generated/avoided.                                                              |
| P1       | Tauri capability includes `core:window:allow-create`               | The app explicitly bans new Tauri windows, but the capability still allows window creation.                     | Remove the permission if no runtime path needs it. Keep the single-window architecture rule intact.                                                                                             | App builds and core window actions still work; no capability grants unused window creation.                                                |
| P1       | MCP first-run behavior needs a product/security decision           | Even with localhost and bearer auth, a local server starting by default may surprise users.                     | Default MCP to opt-in on first run, while preserving explicit saved settings.                                                                                                                   | First-run behavior is documented and tested. Settings copy matches actual behavior.                                                        |
| P1       | Platform readiness remains incomplete                              | Release automation targets all platforms, but runtime validation needs a repeatable checklist.                  | Document the release matrix and add smoke-test coverage for macOS, Windows, and Linux. Validate updater artifact naming and manifest coverage.                                                  | Release checklist includes install, launch, persistence, file open/save, updater check, and MCP disabled/enabled smoke tests per platform. |
| P2       | Test docs lag behind actual coverage                               | The app has grown substantially, and some documented gaps are no longer accurate.                               | Refresh coverage map around `useToolState`, tool component coverage, stores, workers, MCP, updater, and shell shortcuts.                                                                        | Testing doc reflects current test files and the remaining highest-risk gaps.                                                               |
| P2       | Security/privacy wording around API secrets and MCP can be clearer | API Client and MCP can store or expose request auth material locally.                                           | Add an explicit “local secrets model” section covering storage, redaction, export/import, MCP exposure, and update downloads.                                                                   | User-facing docs explain when secrets are stored, redacted, exported, or sent to tools.                                                    |

## Now / Next / Later Roadmap

### Now: Stabilize Trust and Release Readiness

Target: 1-2 weeks

1. Fix settings import theme validation.
2. Refresh README, product map, testing docs, and contributor docs to match the actual registry and test suite.
3. Remove unused `core:window:allow-create` capability or document why it is required.
4. Decide and document MCP first-run behavior.
5. Add focused tests for settings import/export, MCP default normalization, and capability-sensitive assumptions where feasible.

Success measures:

- No known settings export/import data loss for supported themes.
- Docs match the app state.
- Security-sensitive defaults are explicit.
- Quality gates remain green.

### Next: Cross-Platform and Workflow Confidence

Target: 2-6 weeks

1. Add release smoke tests for macOS, Windows, and Linux.
2. Validate updater manifests and downloadable installers across supported platform keys.
3. Build a lightweight Tauri smoke test plan for launch, DB persistence, file dialogs, workspace tabs, notes, snippets, API Client, MCP start/stop, and updater check.
4. Standardize tool actions so every applicable tool handles execute, copy output, open file, and save file consistently.
5. Improve API Client import/export confidence, especially auth redaction and collection/request round-tripping.

Success measures:

- Each supported platform has a repeatable release validation path.
- Tool behavior is predictable from global shortcuts and command palette actions.
- API/MCP workflows are safe by default and tested around secrets.

### Later: Product Depth and Local-First Power

Target: 6-12 weeks

1. Add workspace-level import/export or backup restore for local data.
2. Add optional encrypted storage for sensitive API auth material and MCP-adjacent secrets.
3. Add richer history workflows: starred history, replay/send-to, cleanup policies, and per-tool search.
4. Expand MCP workflows from data access to local automation recipes, while preserving least-privilege permissions.
5. Explore extension/plugin boundaries only after core platform and security posture are solid.

Success measures:

- Users can move or recover their local workspace without manual database access.
- Sensitive data handling has a clear user-controlled model.
- MCP creates local workflow leverage without broad permissions.

## Risk Register

| Risk                                                              | Probability | Impact | Response                                                              |
| ----------------------------------------------------------------- | ----------- | ------ | --------------------------------------------------------------------- |
| Stale docs lead contributors to implement against old assumptions | High        | Medium | Fix docs now and avoid duplicated counts.                             |
| New themes fail settings import                                   | Medium      | Medium | Replace hardcoded validator and test round-trips.                     |
| Cross-platform builds ship without enough runtime validation      | Medium      | High   | Add platform smoke checklist before broad release claims.             |
| MCP default behavior surprises privacy-sensitive users            | Medium      | High   | Make default explicit or change to opt-in.                            |
| Secret-bearing API data leaks through export or MCP settings      | Low-Medium  | High   | Document, test redaction paths, and consider encrypted local storage. |

## Suggested Ownership

| Workstream                       | Product Owner | Engineering Owner     | QA Owner |
| -------------------------------- | ------------- | --------------------- | -------- |
| Docs and product map refresh     | Product       | Frontend              | QA       |
| Settings import bugfix           | Product       | Frontend              | QA       |
| Capability/security hardening    | Product       | Tauri/Rust            | QA       |
| MCP default and secrets model    | Product       | Tauri/Rust + Frontend | QA       |
| Cross-platform release readiness | Product       | Release Engineering   | QA       |
| Tool action consistency          | Product       | Frontend              | QA       |

## Open Questions

1. Should any MCP onboarding prompt be added after the new opt-in default, or is Settings documentation enough?
2. Which platforms are first-class for the next public release: macOS only, or macOS + Windows + Linux?
3. Should API request auth remain plain local SQLite JSON, or should the roadmap include encrypted-at-rest storage before broader API Client promotion?
4. Should docs present an exact tool count, or should the registry be treated as the only source of truth?

## Recommended Immediate Backlog

1. `fix(cockpit): preserve all themes during settings import`
2. `docs(cockpit): refresh product map and testing coverage`
3. `fix(cockpit): remove unused window create capability`
4. `docs(cockpit): clarify MCP defaults and local secret handling`
5. `test(cockpit): cover settings import and MCP default normalization`
