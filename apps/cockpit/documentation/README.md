# devdrivr cockpit Documentation

Welcome to the devdrivr cockpit documentation. This directory contains all the documentation for the devdrivr cockpit application.

## Table of Contents

1. [PRODUCT_MAP.md](PRODUCT_MAP.md) - Current, authoritative tool inventory, shortcuts, and persisted data
2. [PRODUCT_SPECIFICATION.md](PRODUCT_SPECIFICATION.md) - Historical product/design spec (data model, performance targets, design rationale)
3. [API_COMPONENTS.md](API_COMPONENTS.md) - Comprehensive API documentation for all core components, hooks, libraries, and types
4. [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment and release process documentation
5. [RELEASE_SMOKE_TESTS.md](RELEASE_SMOKE_TESTS.md) - Cross-platform release validation checklist
6. [RELEASE_SMOKE_REPORT_TEMPLATE.md](RELEASE_SMOKE_REPORT_TEMPLATE.md) - Template used by `bun run smoke:report`
7. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) - Visual design language, theming, and CSS tokens
8. [TESTING.md](TESTING.md) - Testing documentation and best practices
9. [HARNESSES.md](HARNESSES.md) - **Start here for debugging:** which of the four harnesses to use for which symptom
10. [BROWSER_HARNESS.md](BROWSER_HARNESS.md) - Running the UI in Chromium with stubbed IPC, for DOM-level debugging
11. [REMOTE_UI_HARNESS.md](REMOTE_UI_HARNESS.md) - Driving the live app from Chromium with real IPC: real database, filesystem, MCP
12. [NATIVE_UI_HARNESS.md](NATIVE_UI_HARNESS.md) - Testing the real Tauri window on macOS and Windows: synthetic input, window controls, IPC health
13. [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines for the project (lives at `apps/cockpit/CONTRIBUTING.md`)
14. [QUICK_START.md](QUICK_START.md) - Quick start guide for new users
15. [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive user guide
16. [MCP_SERVER.md](MCP_SERVER.md) - Local MCP server setup and agent usage
17. [TODO.md](TODO.md) - Active quality/reliability backlog (current source of truth for in-progress work)
18. [infrastructure/](infrastructure/) - Core infrastructure documentation

## Overview

The devdrivr cockpit application is a local-first, keyboard-driven developer utility workspace built with Tauri 2 + React 19. This documentation provides comprehensive guides for developers working with the codebase.

## Getting Started

For new developers, we recommend starting with:

1. [QUICK_START.md](QUICK_START.md) - Get up and running quickly
2. [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive guide to using the application
3. [../CONTRIBUTING.md](../CONTRIBUTING.md) - Guidelines for contributing to the project
4. [MCP_SERVER.md](MCP_SERVER.md) - Connect CLI agents to local Cockpit data

## Development Resources

- [../AGENTS.md](../AGENTS.md) - Canonical coding rules, file map, and non-negotiables (also see `../CLAUDE.md` / `../GEMINI.md` for short tool-specific pointers)
- [ONBOARDING.md](ONBOARDING.md) - First-time setup and development environment
- [infrastructure/ARCHITECTURE_DECISIONS.md](infrastructure/ARCHITECTURE_DECISIONS.md) - Why things are the way they are
- [infrastructure/DIRECTORY_MAP.md](infrastructure/DIRECTORY_MAP.md) - Finding any file fast
- [infrastructure/CODING_PATTERNS.md](infrastructure/CODING_PATTERNS.md) - Conventions for adding tools, stores, and workers
- [infrastructure/TROUBLESHOOTING.md](infrastructure/TROUBLESHOOTING.md) - When something breaks

## Contributing

See [../CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on how to contribute to the project.

## License

See the main project repository for licensing information.
