# ONBOARDING — devdrivr cockpit

> First-time setup guide. Follow this top to bottom and you'll have the app running in under 15 minutes.

---

## Prerequisites

### 1. Rust toolchain

Tauri 2 requires Rust. Install via `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Restart your terminal, then verify:
rustc --version   # should print rustc 1.78 or later
cargo --version
```

### 2. Bun

This project uses Bun as the package manager and runtime. **Never use npm or yarn.**

```bash
curl -fsSL https://bun.sh/install | bash
# Restart your terminal, then verify:
bun --version   # should print 1.x or later
```

### 3. Platform-specific Tauri dependencies

#### macOS

Install Xcode Command Line Tools:
```bash
xcode-select --install
```

That's it — WebKit is bundled with macOS.

#### Windows

Install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 11). Also install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

For other distros, see the [Tauri 2 Linux prerequisites](https://tauri.app/start/prerequisites/#linux).

---

## Clone and Install

```bash
# Clone the monorepo
git clone https://github.com/your-org/devdrivr.git
cd devdrivr

# Install all dependencies (hoisted to monorepo root)
bun install
```

Dependencies are hoisted — `node_modules` lives at the monorepo root, not inside `apps/cockpit/`.

---

## Run the App

```bash
cd apps/cockpit
bun run tauri dev
```

This command:
1. Starts Vite dev server on `localhost:1420`
2. Compiles the Rust Tauri binary (first run takes 2–5 minutes; subsequent runs are fast)
3. Opens the app window

Hot-reload is active — TypeScript/React changes apply instantly without restarting Tauri.

---

## Verify Everything Works

```bash
# From apps/cockpit/
npx tsc --noEmit   # zero errors expected
bun run test       # 34/34 tests should pass
```

---

## Database Location

The SQLite database is created automatically on first launch:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/com.devdrivr.cockpit/cockpit.db` |
| Windows | `%APPDATA%\com.devdrivr.cockpit\cockpit.db` |
| Linux | `~/.local/share/com.devdrivr.cockpit/cockpit.db` |

To inspect or reset:
```bash
# macOS — inspect
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db
.tables
.quit

# macOS — full reset (loses all data)
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
```

---

## Project Structure at a Glance

```
devdrivr/                     ← monorepo root
├── apps/cockpit/             ← the desktop app (work here)
│   ├── src/                  ← React + TypeScript frontend
│   ├── src-tauri/            ← Rust backend
│   ├── package.json          ← cockpit-specific scripts
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── CLAUDE.md             ← AI dev guidance
├── bun.lockb                 ← monorepo lockfile
└── package.json              ← root scripts
```

All development happens inside `apps/cockpit/`. Always run commands from that directory unless noted.

---

## Key Commands Reference

```bash
# From apps/cockpit/

bun run tauri dev        # Start dev server + Tauri window
bun run tauri build      # Production build (outputs to src-tauri/target/release)
bun run clean            # Delete node_modules, dist, src-tauri/target
bun install              # Re-install after clean
npx tsc --noEmit         # Type-check (must pass before any commit)
bun run test             # Run 34 unit tests
bun run test:watch       # Watch mode during development
```

---

## Editor Setup

### VS Code (recommended)

Install these extensions:
- **rust-analyzer** — Rust language server
- **Tauri** (tauri-apps.tauri-vscode) — Tauri-specific commands and snippets
- **ESLint** — JavaScript/TypeScript linting
- **Prettier** — Code formatting (`semi: false`, `singleQuote: true`)

The workspace already has a `.prettierrc` — VS Code will pick it up automatically.

### TypeScript strict mode

The project runs with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Your editor will show more "possibly undefined" errors than a typical TypeScript project — this is intentional. See `documentation/infrastructure/CODING_PATTERNS.md` for how to handle them.

---

## Common First-Run Issues

### Rust compile takes forever
Normal on first run. The Tauri Rust binary takes 2–5 minutes to compile cold. It's cached after that.

### "error: linker `cc` not found" (Linux)
Install build-essential: `sudo apt install build-essential`

### App opens but stays blank / "Loading..."
The DB init failed. Check the terminal (not the browser console) for Rust errors. Most common cause: stale lockfile after a dependency change.
```bash
bun run clean && bun install && bun run tauri dev
```

### Window opens at wrong size or position
SQLite has a stale `windowBounds` value. Reset it:
```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "UPDATE settings SET value = '{\"x\":100,\"y\":100,\"width\":1200,\"height\":800}' WHERE key = 'windowBounds';"
```

---

## Making Your First Change

1. Open `src/tools/` — pick any tool
2. Edit its `.tsx` file — the Vite dev server hot-reloads instantly
3. Run `npx tsc --noEmit` — fix any type errors
4. Run `bun run test` — ensure all 34 pass
5. Commit with a conventional commit message: `fix(cockpit): description`

See `documentation/infrastructure/CODING_PATTERNS.md` for all patterns you must follow before submitting a PR.
