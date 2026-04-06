# devdrivr

A local-first, keyboard-driven developer utility workspace. 28 tools in a single desktop app — no browser, no cloud, no latency.

## Overview

![Cockpit Main Interface](screenshots/Screenshot%202026-04-06%20at%2023.00.12.png)

The cockpit app combines 28 developer tools into a single, fast, local-first desktop experience — no browser, no cloud, no latency.

## Tools

### Code Tools

**Code** — Code Formatter, TypeScript Playground, Diff Viewer, Refactoring Toolkit

### Data Tools

**Data** — JSON Tools, XML Tools, JSON Schema Validator

### Web Tools

**Web** — CSS Validator, HTML Validator, CSS Specificity, CSS → Tailwind

### Convert Tools

**Convert** — Case Converter, Color Converter, Timestamp, Base64, URL Codec, cURL → Fetch, UUID Generator, Hash Generator

### Test Tools

**Test** — Regex Tester, JWT Decoder

### Network Tools

**Network** — API Client, Docs Browser

### Write Tools

**Write** — Markdown Editor, Mermaid Editor, Snippets Manager

## Apps

| App | Description |
|-----|-------------|
| [`apps/cockpit`](apps/cockpit) | Desktop app — Tauri 2 + React 19 (active development) |
| [`apps/next`](apps/next) | Web app — Next.js |
| [`apps/expo`](apps/expo) | Mobile app — Expo / React Native |
| [`packages/api`](packages/api) | Backend — Hono on Cloudflare Workers + D1 |

## cockpit

The primary focus of this repo. A developer toolbox desktop app built with:

- **Tauri 2** — native desktop shell (Rust + WebKit)
- **React 19 + TypeScript 5.9** — UI
- **Tailwind CSS 4 + Zustand 5** — styling and state
- **SQLite** — local-first persistence

### Quick Start

```bash
# Prerequisites: Bun >= 1.0, Rust stable, Tauri system deps
# See: https://tauri.app/start/prerequisites/

cd apps/cockpit
bun install
bun run tauri dev
```

See [`apps/cockpit/README.md`](apps/cockpit/README.md) for full documentation.

## Monorepo

Built on the [T4 Stack](https://t4stack.com) — Turborepo monorepo targeting Cloudflare's edge platform.

```
apps/
cockpit/ # Desktop — Tauri 2 + React 19 (active)
next/ # Web — Next.js
expo/ # Mobile — Expo / React Native
docs/ # Documentation — Nextra
packages/
api/ # Backend — Hono + Drizzle + Cloudflare D1
ui/ # Shared — Tamagui component library
app/ # Shared — cross-platform screens
```

### Common Commands

```bash
bun run dev # Start web + API dev servers
bun run desktop # Start cockpit (Tauri)
bun run check-types # Type-check all packages
bun run build:web # Production web build
```

## Documentation

- [`apps/cockpit/README.md`](apps/cockpit/README.md) — cockpit overview, tools, dev setup
- [`docs/cockpit/ARCHITECTURE.md`](docs/cockpit/ARCHITECTURE.md) — architecture deep-dive
- [`apps/cockpit/CLAUDE.md`](apps/cockpit/CLAUDE.md) — AI assistant guidance

## Screenshots

![Cockpit Main Interface](screenshots/Screenshot%202026-04-06%20at%2023.00.12.png)

**Code Tools** — Code Formatter, TypeScript Playground, Diff Viewer, Refactoring Toolkit

![Code Tools - Formatter & Playground](screenshots/Screenshot%202026-04-06%20at%2023.00.27.png)

**Data Tools** — JSON Tools, XML Tools, JSON Schema Validator

![Data Tools - JSON/XML Validator](screenshots/Screenshot%202026-04-06%20at%2023.01.25.png)

**Web Tools** — CSS Validator, HTML Validator, CSS Specificity, CSS → Tailwind

![Web Tools - CSS Validator](screenshots/Screenshot%202026-04-06%20at%2023.01.36.png)

**Convert Tools** — Case Converter, Color Converter, Timestamp, Base64, URL Codec, cURL → Fetch, UUID Generator, Hash Generator

![Convert Tools - Case & Color Converter](screenshots/Screenshot%202026-04-06%20at%2023.02.05.png)

**Test Tools** — Regex Tester, JWT Decoder

![Test Tools - Regex Tester](screenshots/Screenshot%202026-04-06%20at%2023.02.24.png)

## License

MIT

