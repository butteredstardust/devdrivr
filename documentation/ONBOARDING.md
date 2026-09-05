# ONBOARDING — devdrivr

> Developer environment setup. Use [QUICK_START.md](QUICK_START.md) after you install the app.

---

## Prerequisites

### 1. Rust toolchain

Tauri 2 requires Rust. Install it with `rustup`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Restart your terminal, then verify:
rustc --version   # should print rustc 1.78 or later
cargo --version
```

### 2. Bun

This project uses Bun as its package manager and runtime. **Never use npm or yarn.**

```bash
curl -fsSL https://bun.sh/install | bash
# Restart your terminal, then verify:
bun --version   # should print 1.x or later
```

### 3. Platform-specific Tauri dependencies

#### macOS

Install the Xcode Command Line Tools:

```bash
xcode-select --install
```

WebKit is included with macOS.

#### Windows

Install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

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

For other distributions, see the [Tauri 2 Linux prerequisites](https://tauri.app/start/prerequisites/#linux).

---

## Clone and Install

```bash
# Clone the repository
git clone https://github.com/butteredstardust/devdrivr.git
cd devdrivr

# Install dependencies
bun install
```

---

## Run the App

```bash
bun run tauri dev
```

This command does the following:

1. Starts the Vite development server on `localhost:1420`.
2. Compiles the Rust Tauri binary.
3. Opens the app window.

Vite updates TypeScript and React changes while the development app runs.

---

## Verify Everything Works

```bash
# From the repository root
npx tsc --noEmit   # zero errors expected
bunx vitest run    # all tests should pass
```

---

## Database Location

The app creates its SQLite database on first launch:

| Platform | Path                                                            |
| -------- | --------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/com.devdrivr.cockpit/cockpit.db` |
| Windows  | `%APPDATA%\com.devdrivr.cockpit\cockpit.db`                     |
| Linux    | `~/.local/share/com.devdrivr.cockpit/cockpit.db`                |

WARNING: A full reset removes all local workspace data. Inspect or reset the database only when required:

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
devdrivr/
├── src/                      ← React + TypeScript frontend
├── src-tauri/                ← Rust backend
├── documentation/            ← Product and developer documentation
├── scripts/                  ← Build and development helpers
├── package.json              ← App scripts and dependencies
├── bun.lock                  ← Dependency lockfile
├── vite.config.ts
├── tsconfig.json
└── CLAUDE.md                 ← AI development guidance
```

Run each development command from the repository root unless a command says otherwise.

---

## Key Commands Reference

```bash
# From the repository root

bun run tauri dev        # Start dev server + Tauri window
bun run tauri build      # Production build (outputs to src-tauri/target/release)
bun run clean            # Delete node_modules, dist, src-tauri/target
bun install              # Re-install after clean
npx tsc --noEmit         # Type-check (must pass before any commit)
bunx vitest run          # Run unit tests
bun run test:watch       # Watch mode during development
```

---

## Editor Setup

### VS Code (recommended)

Install these extensions if you use VS Code:

- **rust-analyzer** — Rust language server
- **Tauri** (tauri-apps.tauri-vscode) — Tauri-specific commands and snippets
- **ESLint** — JavaScript/TypeScript linting
- **Prettier** — Code formatting (`semi: false`, `singleQuote: true`)

The workspace includes `.prettierrc`. VS Code uses it automatically.

### TypeScript strict mode

The project uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Check `documentation/infrastructure/CODING_PATTERNS.md` for required patterns.

---

## Common First-Run Issues

### Rust compile takes forever

The first Rust build can take several minutes. Later builds use the local build cache.

### "error: linker `cc` not found" (Linux)

Install build-essential: `sudo apt install build-essential`

### App opens but stays blank / "Loading..."

Check the terminal for Rust errors. A stale lockfile after a dependency update can cause this issue.

```bash
bun run clean && bun install && bun run tauri dev
```

### Window opens at wrong size or position

Reset the saved `windowBounds` value:

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "UPDATE settings SET value = '{\"x\":100,\"y\":100,\"width\":1200,\"height\":800}' WHERE key = 'windowBounds';"
```

---

## Making Your First Change

1. Open a tool in `src/tools/`.
2. Update its `.tsx` file.
3. Run `npx tsc --noEmit`.
4. Run `bunx vitest run`.
5. Follow the repository contribution workflow.

See `documentation/infrastructure/CODING_PATTERNS.md` before you submit a PR.
