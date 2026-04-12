<div align="center">

# devdrivr

**27 developer tools. One desktop app. No browser, no cloud, no latency.**

[![Release](https://img.shields.io/github/v/release/butteredstardust/devdrivr?style=for-the-badge&logo=github&color=181717)](https://github.com/butteredstardust/devdrivr/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/butteredstardust/devdrivr/cockpit-ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/butteredstardust/devdrivr/actions/workflows/cockpit-ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=for-the-badge)](https://github.com/butteredstardust/devdrivr/releases/latest)

<br>

![devdrivr cockpit](screenshots/Screenshot%202026-04-06%20at%2023.00.12.png)

</div>

---

## What's inside

The **cockpit** app is the heart of devdrivr — a local-first, keyboard-driven developer workspace built with Tauri 2 + React 19. Everything runs on your machine. No accounts, no telemetry, no internet required.

| Group       | Tools                                                                                                           |
|-------------|----------------------------------------------------------------------------------------------------------------|
| **Code**    | Code Formatter · TypeScript Playground · Diff Viewer · Refactoring Toolkit                                     |
| **Data**    | JSON Tools · XML Tools · YAML Tools · JSON Schema Validator                                                    |
| **Web**     | CSS Validator · HTML Validator · CSS Specificity · CSS → Tailwind                                              |
| **Convert** | Case Converter · Color Converter · Timestamp · Base64 · URL Encode/Decode · cURL → Fetch · UUID · Hash        |
| **Test**    | Regex Tester · JWT Decoder                                                                                     |
| **Network** | API Client · Docs Browser                                                                                      |
| **Write**   | Markdown Editor · Mermaid Editor · Snippets Manager                                                            |

---

## Quick start

> [!NOTE]
> Prerequisites: [Bun](https://bun.sh) ≥ 1.0, [Rust](https://rustup.rs) stable, and [Tauri system dependencies](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/butteredstardust/devdrivr
cd devdrivr/apps/cockpit
bun install
bun run tauri dev
```

See [`apps/cockpit/README.md`](apps/cockpit/README.md) for the full developer guide.

---

## Monorepo structure

This repo is a [T4 Stack](https://t4stack.com) Turborepo. Active development is on `apps/cockpit`.

```
apps/
  cockpit/    # Desktop — Tauri 2 + React 19 (active)
  next/       # Web — Next.js
  expo/       # Mobile — Expo / React Native
  docs/       # Documentation — Nextra
packages/
  api/        # Backend — Hono + Drizzle + Cloudflare D1
  ui/         # Shared — Tamagui component library
  app/        # Shared — cross-platform screens
```

| App | Description |
|-----|-------------|
| [`apps/cockpit`](apps/cockpit) | Desktop app — Tauri 2 + React 19 |
| [`apps/next`](apps/next) | Web app — Next.js |
| [`apps/expo`](apps/expo) | Mobile app — Expo / React Native |
| [`packages/api`](packages/api) | Backend — Hono on Cloudflare Workers + D1 |

```bash
bun run dev          # Start web + API dev servers
bun run desktop      # Start cockpit (Tauri)
bun run check-types  # Type-check all packages
bun run build:web    # Production web build
```

---

## Screenshots

![Code Tools](screenshots/Screenshot%202026-04-06%20at%2023.00.27.png)

**Code** — Code Formatter, TypeScript Playground, Diff Viewer, Refactoring Toolkit

![Data Tools](screenshots/Screenshot%202026-04-06%20at%2023.01.25.png)

**Data** — JSON Tools, XML Tools, YAML Tools, JSON Schema Validator

![Web Tools](screenshots/Screenshot%202026-04-06%20at%2023.01.36.png)

**Web** — CSS Validator, HTML Validator, CSS Specificity, CSS → Tailwind

![Convert Tools](screenshots/Screenshot%202026-04-06%20at%2023.02.05.png)

**Convert** — Case Converter, Color Converter, Timestamp, Base64, URL Encode/Decode, cURL → Fetch, UUID, Hash

![Test Tools](screenshots/Screenshot%202026-04-06%20at%2023.02.24.png)

**Test** — Regex Tester, JWT Decoder

---

## License

MIT
