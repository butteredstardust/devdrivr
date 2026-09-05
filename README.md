<div align="center">

<img src="src-tauri/icons/source/dodecastar-1024.png" alt="" width="128" height="128">

# devdrivr

**A local-first, keyboard-driven workspace for developer tools.**
**30 developer tools in one desktop app. No browser, cloud, or network delay.**

[![Release](https://img.shields.io/github/v/release/butteredstardust/devdrivr?style=for-the-badge&logo=github&color=181717)](https://github.com/butteredstardust/devdrivr/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/butteredstardust/devdrivr/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/butteredstardust/devdrivr/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20%7C%20Linux%20%7C%20Windows-lightgrey?style=for-the-badge)](https://github.com/butteredstardust/devdrivr/releases/latest)

<br>

![devdrivr showing the Mermaid Editor in split view](screenshots/devdrivr-overview.png)

</div>

---

## Install

Open the [latest release](https://github.com/butteredstardust/devdrivr/releases/latest) and select the installer for your platform:

| Platform              | Asset                               |
| --------------------- | ----------------------------------- |
| macOS (Apple Silicon) | `devdrivr_<version>_aarch64.dmg`    |
| Windows 10+           | `devdrivr_<version>_x64-setup.exe`  |
| Linux x64             | `devdrivr_<version>_amd64.AppImage` |

WARNING: The builds are **unsigned**. macOS Gatekeeper and Windows SmartScreen warn on first open. See [Unsigned builds](#unsigned-builds) for the required action.

> [!NOTE]
> Intel macOS is not supported. `0.1.82` is the last release with an `x64.dmg`.

---

## Tools

Use one keyboard-driven app during a coding session. All tools run on your machine. No account, telemetry, or internet connection is required.

| Group       | Tools                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**    | Code Formatter · TypeScript Playground · Diff Viewer · Refactoring Toolkit                                                              |
| **Data**    | JSON Tools · XML Tools · YAML Tools · JSON Schema Validator · CSV Tools                                                                 |
| **Web**     | CSS Validator · HTML Validator · CSS Specificity · CSS → Tailwind                                                                       |
| **Convert** | Case Converter · Color Converter · Timestamp Converter · Base64 · URL Encode/Decode · cURL → Fetch · UUID Generator · Hash · Image Tool |
| **Test**    | Regex Tester · JWT Decoder                                                                                                              |
| **Network** | API Client · Docs Browser                                                                                                               |
| **Write**   | Notes · Markdown Editor · Mermaid Editor · Snippets Manager · Prompt Templates                                                          |

### Shell features

- **Command palette** — fuzzy search every tool (`Cmd+K`)
- **Notes drawer** — persistent notes with color tags and full-text search
- **Per-tool history** — inputs and outputs are saved automatically
- **Snippets library** — tagged code snippets accessible from any tool
- **MCP server** — local agent access for notes, snippets, prompt templates, and saved API requests
- **Themes** — system mode plus 32 built-in themes
- **Always-on-top** — pin the window over your editor or browser
- **Window state persistence** — remembers size and position across launches
- **Auto-updater** — checks GitHub releases, then installs and restarts on your say-so

---

## Screenshots

![Code Formatter with the Style popover open over formatted JavaScript](screenshots/devdrivr-code-formatter.png)

**Format** — Use Prettier-backed formatting. Set indent, quote, semicolon, and trailing-comma controls in a popover.

![Diff Viewer comparing two files side by side above a unified patch](screenshots/devdrivr-code-tools.png)

**Compare** — View side-by-side or unified diffs. Fold whitespace and case. Copy or save patches.

![YAML Tools showing source and an expandable tree inspector](screenshots/devdrivr-data-tools.png)

**Data** — Inspect, validate, format, and convert structured data in split view.

![CSV Tools showing raw CSV beside a sortable, filterable table](screenshots/devdrivr-csv-tools.png)

**Tabular** — Read CSV in a sortable table. Convert it to JSON. Validate it against a schema.

![API Client showing a GET request and its 200 OK JSON response](screenshots/devdrivr-api-client.png)

**Network** — Send requests and inspect responses. Use saved requests, environments, and authentication.

![Markdown Editor showing source and rendered preview](screenshots/devdrivr-writing-tools.png)

**Write** — Use Markdown, Mermaid diagrams, snippets, notes, and reusable prompts.

---

## Keyboard shortcuts

| Shortcut        | Action                                |
| --------------- | ------------------------------------- |
| `Cmd+K`         | Command palette                       |
| `Cmd+B`         | Toggle sidebar                        |
| `Cmd+]` / `[`   | Next / previous tool                  |
| `Cmd+Shift+N`   | Toggle notes drawer                   |
| `Cmd+Enter`     | Execute / run                         |
| `Cmd+Shift+C`   | Copy output                           |
| `Cmd+1`–`Cmd+9` | Switch to a workspace tab by position |
| `Cmd+O`         | Open file                             |
| `Cmd+S`         | Save file                             |
| `Cmd+,`         | Settings                              |
| `Cmd+Shift+T`   | Toggle theme                          |
| `Cmd+Shift+P`   | Toggle always-on-top                  |
| `Cmd+/`         | Keyboard shortcuts reference          |

Use `Ctrl` in place of `Cmd` on Windows and Linux.

---

## Themes

| Theme family          | Options                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| System                | `system`                                                                                                                 |
| devdrivr originals    | `midnight`, `warm-terminal`, `neon-brutalist`, `earth-code`, `cyber-luxe`, `soft-focus`                                  |
| Popular editor themes | `tokyo-night`, `tokyo-night-light`, `dracula`, `monokai`, `nord`, `night-owl`, `oceanic-next`, `tomorrow-night`          |
| Catppuccin            | `catppuccin-latte`, `catppuccin-frappe`, `catppuccin-macchiato`, `catppuccin-mocha`                                      |
| GitHub and Solarized  | `github-dark`, `github-light`, `solarized-dark`, `solarized-light`                                                       |
| Extras                | `inked`, `urban-nocturne`, `amethyst-haze`, `lapis-velvet`, `amethyst-mint`, `fireside`, `marina`, `pearl`, `yacht-club` |
| Brand                 | `dodecastar` — drawn from the app icon's palette                                                                         |

Use `Cmd+Shift+T` to cycle themes. Set a theme in Settings (`Cmd+,`).

---

## MCP server

devdrivr includes a local MCP server for CLI agents such as Codex CLI and Claude Code. It is disabled by default. Enable it in Settings to run it with the app. It provides authenticated tools for notes, snippets, prompt templates, saved API requests, search, schema introspection, and topic help.

Key details:

- Binds to `127.0.0.1` only.
- Default URL: `http://127.0.0.1:17347/mcp`.
- Uses a bearer token copied from Settings → MCP.
- Defaults to read-only permissions.
- Redacts saved API request auth secrets unless explicitly allowed.

Open [`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md) for setup commands, permissions, tools, limits, and troubleshooting.

---

## App updater

devdrivr checks [GitHub releases](https://github.com/butteredstardust/devdrivr/releases) against an `updater.json` manifest for each release. It installs the update in place and restarts. Updates do not show a Gatekeeper or SmartScreen prompt because the app downloads the payload.

The app validates each update against a built-in signing key before installation. This key is not Apple or Microsoft code signing. It limits updates to payloads from this repository. See [Unsigned builds](#unsigned-builds).

**Update settings** (in Settings → General):

| Setting                         | Default | Description                                          |
| ------------------------------- | ------- | ---------------------------------------------------- |
| Check for updates automatically | On      | Checks once per hour in the background               |
| Download update automatically   | Off     | Downloads in the background, then offers the restart |
| Notify when update available    | On      | Shows a dismissible banner when an update is found   |

Use **Check Now** in Settings to check manually.

---

## Tech stack

| Layer         | Technology                             |
| ------------- | -------------------------------------- |
| Desktop shell | Tauri 2 (Rust + WebKit)                |
| UI            | React 19, TypeScript 5.9               |
| Styling       | Tailwind CSS 4, CSS custom properties  |
| State         | Zustand 5                              |
| Persistence   | SQLite via tauri-plugin-sql (WAL mode) |
| Build         | Vite 7                                 |
| Tests         | Vitest                                 |

---

## Build from source

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0`
- [Rust](https://rustup.rs) stable toolchain
- Tauri system dependencies — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
git clone https://github.com/butteredstardust/devdrivr
cd devdrivr

# Install JS dependencies
bun install

# Start dev server (Vite + Tauri hot-reload)
bun run tauri dev

# Type-check
npx tsc --noEmit

# Run tests
bun run test

# Production build
bun run tauri build
```

Local `tauri build` output is unsigned. Your bundle shows the same Gatekeeper or SmartScreen prompt as an unsigned release artifact.

---

## Project structure

```
devdrivr/
├── src/
│   ├── app/
│   │   ├── App.tsx               # Root layout (Sidebar + Workspace + overlays)
│   │   ├── providers.tsx         # Bootstrap: stores, window geometry, theme, update check
│   │   ├── tool-registry.ts      # Registered tools (lazy imports + metadata)
│   │   └── tool-groups.tsx       # Sidebar group definitions with Phosphor icons
│   ├── components/
│   │   ├── shell/                # Layout chrome (Sidebar, Workspace, SettingsPanel, etc.)
│   │   └── shared/               # Reusable UI (Button, Toggle, Toast, TabBar, etc.)
│   ├── hooks/
│   │   ├── useGlobalShortcuts.ts # All keyboard shortcuts
│   │   └── useFileDropZone.ts    # Drag-and-drop file loading
│   ├── stores/
│   │   ├── settings.store.ts     # Theme, sidebar state, editor prefs, update settings
│   │   ├── updater.store.ts      # GitHub release checker and installer download
│   │   ├── notes.store.ts        # Notes CRUD
│   │   ├── snippets.store.ts     # Snippets CRUD
│   │   └── history.store.ts      # Per-tool history
│   ├── lib/
│   │   ├── db.ts                 # SQLite singleton + all query functions
│   │   └── theme.ts              # applyTheme() with localStorage cache
│   ├── tools/                    # One folder per tool
│   │   └── <tool-id>/<ToolName>.tsx
│   └── types/
│       ├── models.ts             # Note, Snippet, HistoryEntry, AppSettings
│       └── tools.ts              # ToolDefinition, ToolGroupMeta
├── src-tauri/
│   ├── src/lib.rs                # Tauri builder + plugin registration
│   ├── capabilities/default.json # IPC permissions
│   ├── migrations/001_initial.sql
│   └── tauri.conf.json
└── index.html                    # Inline theme cache script
```

---

## Adding a new tool

1. Create `src/tools/<tool-id>/<ToolName>.tsx`
2. Add a lazy import in `src/app/tool-registry.ts`
3. Add an entry to `TOOLS` with `id`, `name`, `group`, `description`, `component`

Tool components receive no props. Use `dispatchToolAction` / `useToolActionListener` from `src/lib/tool-actions.ts` for file open, execute, copy output, and tab switching.

---

## Documentation

| Doc                                                                                                                | Description                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`documentation/README.md`](documentation/README.md)                                                               | Index of everything below                       |
| [`documentation/PRODUCT_MAP.md`](documentation/PRODUCT_MAP.md)                                                     | Full tool list, product status, shortcuts       |
| [`documentation/BACKLOG.md`](documentation/BACKLOG.md)                                                             | Open work items                                 |
| [`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md)                                                       | Local MCP server setup and agent tool reference |
| [`documentation/RELEASE_SMOKE_TESTS.md`](documentation/RELEASE_SMOKE_TESTS.md)                                     | Release-blocking smoke reports and validation   |
| [`documentation/ONBOARDING.md`](documentation/ONBOARDING.md)                                                       | First-time setup for new contributors           |
| [`documentation/TESTING.md`](documentation/TESTING.md)                                                             | Test strategy and coverage map                  |
| [`documentation/DESIGN_SYSTEM.md`](documentation/DESIGN_SYSTEM.md)                                                 | Color tokens, typography, component patterns    |
| [`documentation/HARNESSES.md`](documentation/HARNESSES.md)                                                         | Which debugging harness to reach for            |
| [`documentation/infrastructure/CODING_PATTERNS.md`](documentation/infrastructure/CODING_PATTERNS.md)               | Patterns to follow before writing any code      |
| [`documentation/infrastructure/ARCHITECTURE_DECISIONS.md`](documentation/infrastructure/ARCHITECTURE_DECISIONS.md) | ADRs — why things are the way they are          |
| [`documentation/infrastructure/TROUBLESHOOTING.md`](documentation/infrastructure/TROUBLESHOOTING.md)               | When something breaks                           |

Use [`AGENTS.md`](AGENTS.md) as the coding contract. Use [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.

---

## Unsigned builds

devdrivr has no Apple Developer ID or Windows code-signing certificate. [`.github/workflows/release.yml`](.github/workflows/release.yml) builds release binaries from the tagged commit. You can build the app from source with the steps above. macOS bundles use ad-hoc signing. This validates bundle integrity but not the builder identity.

The first open requires one extra action.

### macOS — Gatekeeper

macOS validates the ad-hoc-signed bundle but cannot identify a paid developer. The browser adds a `com.apple.quarantine` attribute. These conditions cause a one-time first-open prompt.

#### _"devdrivr.app" Not Opened — Apple could not verify "devdrivr.app" is free of malware_

The dialog shows **Move to Trash** and **Done** only. Click **Done**, then complete these steps:

1. Drag `devdrivr.app` to Applications and double-click it. Let the prompt appear, then click
   **Done**.
2. Open **System Settings → Privacy & Security** and scroll to the Security section.
3. Next to _"devdrivr.app" was blocked to protect your Mac_, click **Open Anyway**.
4. Confirm with Touch ID or your password.
5. Open the app again. Click **Open**.

macOS saves this decision after the first open.

On macOS 14 and earlier, right-click the app and select **Open**. On macOS 15 (Sequoia), use System Settings.

WARNING: Clearing the quarantine attribute removes the check. Use this command only for a file you intended to download:

```bash
xattr -dr com.apple.quarantine /Applications/devdrivr.app
```

Add `sudo` if it reports `Operation not permitted`.

#### _"devdrivr" is damaged and can't be opened. You should move it to the Trash._ (0.1.82 and earlier)

The app is not damaged. Builds through 0.1.82 have no explicit signing identity. macOS cannot validate their linker-applied signature. Gatekeeper shows this message for quarantined apps. The dialog has no **Open Anyway** button.

For builds through 0.1.82, clear the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/devdrivr.app
```

Move the app to Applications first. This clears the flag on the app you open. Add `sudo` if the command reports `Operation not permitted`.

If the message remains, the download may be incomplete. Remove it. Empty the Trash. Download the release asset again.

### Windows — SmartScreen

The installer can show _Windows protected your PC_ and hide the **Run** button.

1. Click **More info** in the dialog.
2. Click **Run anyway**.

If the installer does not run, Windows may mark the file. Right-click `devdrivr_<version>_x64-setup.exe`. Select **Properties**. Select **Unblock** at the General tab bottom. Select **OK**. The PowerShell equivalent is `Unblock-File .\devdrivr_<version>_x64-setup.exe`.

SmartScreen uses reputation. It can warn for a new version after you allow an earlier version.

### Linux — AppImage

Set the executable bit:

```bash
chmod +x devdrivr_<version>_amd64.AppImage
./devdrivr_<version>_amd64.AppImage
```

These prompts apply to installers you download. Updates from the app updater do not show them.

---

## License

MIT
