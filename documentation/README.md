# devdrivr Documentation

devdrivr is a local-first, keyboard-driven developer utility workspace. It is built with Tauri 2 and
React 19.

This directory holds the documentation. Start with the section that matches your task.

## Start here

- [QUICK_START.md](QUICK_START.md) — install devdrivr and run your first tool.
- [USER_GUIDE.md](USER_GUIDE.md) — every tool, in depth.
- [PRODUCT_MAP.md](PRODUCT_MAP.md) — authoritative tool inventory, shortcuts and persisted data.
- [MCP_SERVER.md](MCP_SERVER.md) — connect a CLI agent to local devdrivr data.

## Develop

Read [`../AGENTS.md`](../AGENTS.md) first. It holds the coding rules, the file map and the
non-negotiables. [`../CLAUDE.md`](../CLAUDE.md) and [`../GEMINI.md`](../GEMINI.md) are short
tool-specific pointers to it.

- [ONBOARDING.md](ONBOARDING.md) — set up the development environment.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to propose a change.
- [infrastructure/CODING_PATTERNS.md](infrastructure/CODING_PATTERNS.md) — conventions for tools,
  stores and workers.
- [infrastructure/DIRECTORY_MAP.md](infrastructure/DIRECTORY_MAP.md) — find any file fast.
- [infrastructure/ARCHITECTURE_DECISIONS.md](infrastructure/ARCHITECTURE_DECISIONS.md) — why the
  system is built this way.
- [API_COMPONENTS.md](API_COMPONENTS.md) — core components, hooks, libraries and types.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — visual language, theming and CSS tokens.
- [TESTING.md](TESTING.md) — test strategy and coverage.
- [BACKLOG.md](BACKLOG.md) — open work items.

## Debug

- [HARNESSES.md](HARNESSES.md) — **start here.** Picks the harness for your symptom.
- [BROWSER_HARNESS.md](BROWSER_HARNESS.md) — Chromium with stubbed IPC, for DOM-level debugging.
- [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md) — Chromium driving the live app, with real IPC,
  database, filesystem and MCP.
- [NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md) — the real Tauri window on macOS and Windows.
- [infrastructure/TROUBLESHOOTING.md](infrastructure/TROUBLESHOOTING.md) — when something breaks.

## Release

- [DEPLOYMENT.md](DEPLOYMENT.md) — build and release process.
- [RELEASE_SMOKE_TESTS.md](RELEASE_SMOKE_TESTS.md) — cross-platform validation checklist.
- [RELEASE_SMOKE_REPORT_TEMPLATE.md](RELEASE_SMOKE_REPORT_TEMPLATE.md) — template used by
  `bun run smoke:report`.

## License

See the project repository.
