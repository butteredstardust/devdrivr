# devdrivr

<div align="center">

> A local-first, keyboard-driven developer utility workspace. 28 tools in a single desktop app — no browser, no cloud, no latency.

**Download for macOS →** | [Windows](https://github.com/devdrivr/devdrivr/releases) | [Linux](https://github.com/devdrivr/devdrivr/releases)

</div>

![License: MIT](https://img.shields.io/badge/license-MIT-39ff14?style=flat)
![Platform: macOS, Windows, Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333333?style=flat)
![Tauri](https://img.shields.io/badge/Tauri-2-6929CF?style=flat)
![Bun](https://img.shields.io/badge/Bun-FEC042?style=flat&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat)
![SQLite](https://img.shields.io/badge/SQLite-003B27?style=flat&logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38BDF8?style=flat&logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-FFFFFF?style=flat&logo=vitest&logoColor=4FC3F7)
![Tests](https://img.shields.io/badge/tests-604-39ff14?style=flat)

---

## Why I Built This

I got tired of tab-switching. Every task — validate JSON, convert timestamps, decode JWTs — meant loading a browser, finding the right site, waiting for it to load, fighting cookies, and wondering about my data.

Devdrivr combines the 28 tools I use most into one fast, local app. No accounts, no cloud, no latency. Just open, type, done.

If you're a developer who prefers keyboard over mouse, this is for you.

— **devdrivr**

---

## Table of Contents

- [Why devdrivr?](#why-devdrivr)
- [Tools](#tools)
- [Apps](#apps)
- [Getting Started](#getting-started)
- [Monorepo](#monorepo)
- [Contributing](#contributing)
- [Documentation](#documentation)

## Why devdrivr?

devdrivr is a **developer utility workspace** that combines 28 essential tools into one fast, local-first application.

| Benefit            | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| **Keyboard-first** | Every action accessible via shortcuts — never touch your mouse   |
| **Local-first**    | Your data never leaves your machine — no accounts, no cloud      |
| **Instant**        | No loading screens, no network latency — everything runs locally |
| **Persistent**     | Remembers your themes, notes, snippets, and tool state           |
| **Native**         | Lives in your dock/taskbar, responds to system themes            |

## Key Features

| Feature            | Description                                         |
| ------------------ | --------------------------------------------------- |
| **Keyboard-first** | Every action via shortcuts — never touch your mouse |
| **Local-only**     | Your data never leaves your machine                 |
| **Instant**        | No network latency — everything runs locally        |
| **Persistent**     | Remembers themes, notes, snippets, and tool state   |
| **SQLite state**   | All history saved locally in WAL mode               |

## Tools

> All 28 tools organized by workflow

### Code (4)

`Code Formatter` · `TypeScript Playground` · `Diff Viewer` · `Refactoring Toolkit`

### Data (5)

`JSON Tools` · `XML Tools` · `YAML Tools` · `JSON Schema Validator` · `CSV Tools`

### Web (4)

`CSS Validator` · `HTML Validator` · `CSS Specificity` · `CSS → Tailwind`

### Convert (8)

`Case Converter` · `Color Converter` · `Timestamp Converter` · `Base64` · `URL Encode/Decode` · `cURL → Fetch` · `UUID Generator` · `Hash Generator`

### Test (2)

`Regex Tester` · `JWT Decoder`

### Network (2)

`API Client` · `Docs Browser`

### Write (3)

`Markdown Editor` · `Mermaid Editor` · `Snippets Manager`

## Apps

| App                            | Status    | Description                                   |
| ------------------------------ | --------- | --------------------------------------------- |
| [`apps/cockpit`](apps/cockpit) | 🟢 Active | Desktop — Tauri 2 + React 19 (in development) |

> The rest are T4 Stack templates — stubs for future extensibility.

## Quick Start

```bash
# Install
bun install

# Run desktop app
bun run desktop
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0` — Package manager
- [Rust](https://rustup.rs) stable — For Tauri
- [Tauri system dependencies](https://tauri.app/start/prerequisites/)

### Quick Start

```bash
# Prerequisites: Bun >= 1.0, Rust stable, Tauri system deps
# See: https://tauri.app/start/prerequisites/

cd apps/cockpit
bun install
bun run tauri dev
```

See [`apps/cockpit/README.md`](apps/cockpit/README.md) for full documentation.

## Monorepo Structure

Built on the [T4 Stack](https://t4stack.com) — Turborepo monorepo targeting Cloudflare's edge platform.

```
apps/
├── cockpit/    # Desktop — Tauri 2 + React 19 (active)
├── next/       # Web — Next.js 13 (legacy)
├── expo/       # Mobile — Expo (inactive)
├── docs/       # Documentation — Nextra
└── cli/        # create-t4-app CLI

packages/
├── api/        # Backend — Hono + Drizzle + Cloudflare D1
├── ui/         # Shared — Tamagui component library
└── app/        # Shared — cross-platform screens
```

### Common Commands

| Command               | Description                 |
| --------------------- | --------------------------- |
| `bun run dev`         | Start web + API dev servers |
| `bun run desktop`     | Start cockpit (Tauri)       |
| `bun run native`      | Start Expo dev server       |
| `bun run check-types` | Type-check all packages     |
| `bun run build:web`   | Production web build        |
| `bun run generate`    | Generate Drizzle migrations |
| `bun run studio`      | Open Drizzle Studio GUI     |

### Tech Stack

| Layer    | Technology                       |
| -------- | -------------------------------- |
| Desktop  | Tauri 2 (Rust + WebKit)          |
| Web      | Next.js 13 (Pages router)        |
| Mobile   | Expo 49 / React Native 0.72      |
| Backend  | Hono on Cloudflare Workers       |
| Database | Drizzle ORM + D1 (SQLite)        |
| State    | Jotai (frontend), TanStack Query |
| UI       | Tamagui (cross-platform)         |

## Documentation

### For Users

- [apps/cockpit/README.md](apps/cockpit/README.md) — Full cockpit documentation
- [QUICK_START.md](apps/cockpit/documentation/QUICK_START.md) — Quick start guide

### For Developers

- [ONBOARDING.md](apps/cockpit/documentation/ONBOARDING.md) — First-time dev setup
- [CODING_PATTERNS.md](apps/cockpit/documentation/infrastructure/CODING_PATTERNS.md) — Code patterns to follow
- [ARCHITECTURE_DECISIONS.md](apps/cockpit/documentation/infrastructure/ARCHITECTURE_DECISIONS.md) — Technical decisions (ADRs)
- [DIRECTORY_MAP.md](apps/cockpit/documentation/infrastructure/DIRECTORY_MAP.md) — File locations

### For AI Assistants

- [apps/cockpit/CLAUDE.md](apps/cockpit/CLAUDE.md) — Claude Code guidance
- [apps/cockpit/AGENTS.md](apps/cockpit/AGENTS.md) — General AI agent guidance
- [apps/cockpit/GEMINI.md](apps/cockpit/GEMINI.md) — Gemini guidance

## Contributing

Contributions are welcome! Please read our [contributing guidelines](apps/cockpit/CONTRIBUTING.md) before submitting PRs.

### Running Tests

```bash
# All packages
bun run test

# Cockpit only
cd apps/cockpit && bun run test

# Check types
bun run check-types
```

### Database

```bash
# Generate migrations (after schema changes)
bun run generate

# Apply local migrations
bun run migrate:local

# Open Drizzle Studio
bun run studio
```

## Troubleshooting

**Tauri won't start?**

- Verify Rust is installed: `rustc --version`
- Update Rust: `rustup update`
- Check system dependencies: [tauri.app/start/prerequisites/](https://tauri.app/start/prerequisites/)

**SQLite errors?**

- Ensure `@tauri-apps/plugin-sql` is installed in `src-tauri/Cargo.toml`
- Run migrations: `bun run migrate:local`

**Type errors?**

- Run type check: `bun run check-types`
- Clear cache: `rm -rf node_modules/.cache`

---

## Screenshots

| Code                                                             | Data                                                             | Web                                                             | Convert                                                             | Test                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ![Code](screenshots/Screenshot%202026-04-06%20at%2023.00.27.png) | ![Data](screenshots/Screenshot%202026-04-06%20at%2023.01.25.png) | ![Web](screenshots/Screenshot%202026-04-06%20at%2023.01.36.png) | ![Convert](screenshots/Screenshot%202026-04-06%20at%2023.02.05.png) | ![Test](screenshots/Screenshot%202026-04-06%20at%2023.02.24.png) |

| Tool Group  | Highlights                                                                  |
| ----------- | --------------------------------------------------------------------------- |
| **Code**    | Code Formatter, TypeScript Playground, Diff Viewer, Refactoring Toolkit     |
| **Data**    | JSON Tools, XML Tools, JSON Schema Validator                                |
| **Web**     | CSS Validator, HTML Validator, CSS Specificity, CSS → Tailwind              |
| **Convert** | Case Converter, Color Converter, Timestamp, Base64, URL Codec, cURL → Fetch |
| **Test**    | Regex Tester, JWT Decoder                                                   |

## License

MIT
