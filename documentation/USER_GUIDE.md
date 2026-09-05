# User Guide

Use this guide to open tools, manage workspace data, and use the local MCP server.

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Interface Overview](#interface-overview)
4. [Core Features](#core-features)
5. [Tools Reference](#tools-reference)
6. [Settings and Customization](#settings-and-customization)
7. [Keyboard Shortcuts](#keyboard-shortcuts)
8. [Data Management](#data-management)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Usage](#advanced-usage)
11. [MCP Server](#mcp-server)

## Introduction

devdrivr is a local-first, keyboard-driven developer utility workspace. See [PRODUCT_MAP.md](PRODUCT_MAP.md) for the authoritative tool inventory.

## Getting Started

### System Requirements

- **Operating System**: macOS 12.0+ on Apple Silicon, Windows 10+, or Linux with a modern desktop
  environment
- **Runtime**: Tauri 2
- **Framework**: React 19
- **Storage**: SQLite with WAL mode for fast local data persistence

### Installation

Download the installer for your platform from the
[latest release](https://github.com/butteredstardust/devdrivr/releases/latest):
`devdrivr_<version>_aarch64.dmg`, `devdrivr_<version>_x64-setup.exe`, or
`devdrivr_<version>_amd64.AppImage`.

The builds carry no paid developer signature, so the first launch is blocked — on macOS with
_Apple could not verify "devdrivr.app" is free of malware_, on Windows by SmartScreen. The
[Unsigned builds](../README.md#unsigned-builds) section of the root README walks through both,
plus the _"devdrivr" is damaged_ message that releases up to 0.1.82 produced.

### Developer setup

Use [ONBOARDING.md](ONBOARDING.md) to set up a development environment.

## Interface Overview

The workspace keeps tools in the sidebar and their content in workspace tabs.

### Main Components

1. **Sidebar**: Open a tool by group.
2. **Workspace**: Use the active tool in a tab.
3. **Notes drawer**: Create and update notes.
4. **Command palette**: Search and open a tool with `Cmd/Ctrl + K`.

### Sidebar Navigation

The sidebar groups tools by their purpose:

- **Code**: Formatting, TypeScript, diff, and refactoring.
- **Data**: JSON, XML, YAML, schema, and CSV tools.
- **Web**: CSS and HTML tools.
- **Convert**: Value, text, and image conversion tools.
- **Test**, **Network**, and **Write**: Testing, HTTP, documentation, and reusable content tools.

## Core Features

### Tool System

Each tool has one focused task. Use the command palette or sidebar to open it.

### State Persistence

The workspace saves local state between sessions:

- Notes and snippets persist in SQLite.
- Tool state persists after a short delay.
- Window position and size persist locally.

### Keyboard-Driven Navigation

Use global shortcuts for common workspace actions:

- `Cmd/Ctrl + K` for quick tool switching
- `Cmd/Ctrl + ,` for settings
- `Cmd/Ctrl + /` for the shortcut reference
- Tool-specific shortcuts for each utility

## Tools Reference

### Code Formatter

Paste source, select a language, then format it.

- JavaScript, TypeScript, JSON, CSS, HTML, and more
- Configurable formatting options
- Real-time syntax highlighting
- Keyboard shortcut: `Cmd/Ctrl + Enter` to format

### JSON Tools

Use this tool to validate and transform JSON.

- Format with proper indentation
- Minify by removing whitespace
- Sort object keys alphabetically
- Validate syntax with detailed error messages

### YAML Tools

Use this tool to validate, view, and transform YAML.

- Lint and format YAML content
- Interactive tree view browser
- Convert between JSON and YAML
- Sort keys and validate syntax

### API Client

Use this tool to send HTTP requests and inspect responses.

- Create collections for organizing requests
- Set up environment variables
- View request history
- Inspect detailed response information

### Notes

Use the notes drawer to create and update local notes.

- Color-coded note system
- Automatic saving and syncing
- Searchable notes list
- Rich text support

### Snippets

Use Snippets to save and find reusable code.

- Categorize by language or purpose
- Quick insert with keyboard shortcuts
- Syntax highlighting
- Export/import capabilities

## Settings and Customization

Open Settings with `Cmd/Ctrl + ,`.

### Appearance

- **Theme**: Choose between Light, Dark, or System preference
- **Editor Settings**: Font size, tab size, word wrap, line numbers
- **Window Behavior**: Window management preferences

### Editor

The **Editor** tab configures every tool that embeds a code editor — the JSON,
YAML, XML and CSV panes, the diff viewer, the TypeScript playground and the
rest. There is no per-tool override; a change here applies everywhere at once.

| Setting             | Default              | Effect                                                 |
| ------------------- | -------------------- | ------------------------------------------------------ |
| Font Family / Size  | JetBrains Mono, 14px | Editor typeface and size; line height follows          |
| Indent Size         | 2 spaces             | Spaces per indent level (tab width when tabs are used) |
| Editor Theme        | Dark                 | Editor colours, or match the app theme                 |
| Format on Paste     | Off                  | Reformat pasted code                                   |
| Word Wrap           | On                   | Wrap long lines instead of scrolling sideways          |
| Insert Spaces       | On                   | Off indents with real tab characters                   |
| Line Numbers        | On                   | Gutter line numbers                                    |
| Code Folding        | On                   | Collapse blocks from the gutter                        |
| Minimap             | Off                  | Overview strip down the right edge                     |
| Sticky Scroll       | Off                  | Pin enclosing scopes to the top of the pane            |
| Bracket Pair Colors | On                   | Tint matching brackets by nesting depth                |
| Render Whitespace   | None                 | Show spaces and tabs (`none` / `boundary` / `all`)     |
| Cursor Style        | Line                 | Caret shape (`line` / `block` / `underline`)           |

Word Wrap is worth calling out: with it off, a long line scrolls horizontally,
and the editor's horizontal scrollbar is a thin strip that is easy to miss. The
app pins that scrollbar permanently visible whenever wrap is off, so the rest of
the line is always reachable. Minimap and Sticky Scroll default off because these
panes are often half a window wide, where both cost more room than they earn.

### Keyboard Shortcuts

Use the shortcut reference to check the global bindings.

- Global shortcuts are defined by the app.
- Tools can provide their own actions.

### Data Management

Use the data controls to manage local workspace data:

- Clear history
- Export/import notes and snippets
- Reset settings to defaults
- Manage API collections and environments

### MCP

The MCP settings tab controls the local agent server:

- Enable or disable automatic MCP startup
- View server status and URL
- Start, stop, or restart the MCP server
- Copy or rotate the bearer token used by MCP clients
- Configure per-resource permissions for notes, snippets, prompt templates, and API requests
- Decide whether saved API request auth secrets are exposed or redacted

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut               | Action                  |
| ---------------------- | ----------------------- |
| `Cmd/Ctrl + ,`         | Open Settings           |
| `Cmd/Ctrl + K`         | Quick tool search       |
| `Cmd/Ctrl + Shift + K` | Global command palette  |
| `Cmd/C/trl + /`        | Show keyboard shortcuts |
| `Cmd/Ctrl + [`         | Previous tool           |
| `Cmd/Ctrl + ]`         | Next tool               |

### Tool-Specific Shortcuts

Each tool may have its own keyboard shortcuts for common operations like formatting, saving, or clearing content.

## Data Management

### Local Storage

The app stores workspace data locally in SQLite:

- Settings are stored in the `settings` table
- Tool states are stored in the `tool_state` table
- Notes are stored in the `notes` table
- Snippets are stored in the `snippets` table
- History is stored in the `history` table
- API data is stored in `api_environments`, `api_collections`, and `api_requests` tables

### Data Persistence

The app updates memory first and writes persistent state after a delay:

1. In-memory cache for instant response
2. Debounced SQLite writes for persistence

### Backup and Restore

Check the data controls before you reset local data:

1. Settings can be reset in the Settings panel
2. Individual tool states can be cleared
3. All data can be exported to files

## Troubleshooting

### Common Issues

1. **Application won't start**
   - Check that Rust and cargo-cp-artifact are installed
   - Verify Bun version is 1.0+
   - Check system requirements

2. **Tools not loading**
   - Clear application cache in Settings
   - Restart the application
   - Check for corrupted state data

3. **Performance issues**
   - Close unused tools
   - Clear history in Settings
   - Restart the application

### Resetting the Application

If you encounter persistent issues:

1. Open Settings
2. Navigate to the Data section
3. Choose what data to reset
4. Confirm the reset action

## Advanced Usage

### Developer commands

Use [ONBOARDING.md](ONBOARDING.md) for development commands and checks.

```bash
# Run tests
bun run test

# Build for production
bun run build

# Check types (also runs automatically as part of `bun run build`)
npx tsc --noEmit

# Lint
bun run lint
```

### Tool actions

Use the tool action controls shown by the active tool.

1. Open Settings (`Cmd/Ctrl + ,`)
2. Navigate to Keyboard Shortcuts
3. Click "Add Shortcut"
4. Define trigger and action

### API Access

Use the built-in MCP server for local agent automation. See [MCP Server](#mcp-server)
for setup details.

The legacy API example below is illustrative only:

```javascript
// Example API usage
import { ApiClient } from './api'

const client = new ApiClient()
client.get('/api/data').then((response) => {
  console.log(response.data)
})
```

### Workspace performance

The workspace uses local state and workers for supported operations:

- Web Workers handle heavy computational tasks
- Virtualized lists for large data sets
- Efficient state management with Zustand
- Memoized components
- Database connection pooling

### Interface settings

Update the theme and editor settings in Settings:

- Change themes in Settings
- Customize editor settings
- Modify keyboard shortcuts
- Adjust window behavior

## Resources

- [Documentation index](README.md)
- [GitHub Repository](https://github.com/butteredstardust/devdrivr)
- [Contribution Guide](../CONTRIBUTING.md)

## Feedback and Support

For help or a problem report:

1. Check the documentation
2. Search [existing issues](https://github.com/butteredstardust/devdrivr/issues)
3. Submit a [GitHub issue](https://github.com/butteredstardust/devdrivr/issues/new)

## Glossary

- **Tool**: A self-contained utility for a specific developer task
- **State**: The saved data for a tool when last used
- **Workspace**: The collection of tools and settings
- **Collection**: A group of related API requests
- **Environment**: A set of variables for API testing
- **Snippet**: A saved piece of code for reuse

## MCP Server

devdrivr includes a local MCP server for CLI agents. It manages local notes, snippets, prompt templates, and saved API requests with configured permissions.

Default endpoint:

```text
http://127.0.0.1:17347/mcp
```

Basic setup:

1. Open Settings (`Cmd/Ctrl + ,`) and choose MCP.
2. Enable MCP and copy the API key.
3. Export the key for your MCP client:

```bash
export DEVDRIVR_MCP_KEY="copy-from-devdrivr-settings"
```

4. Register devdrivr with your client. Example for Codex CLI:

```bash
codex mcp add devdrivr --url http://127.0.0.1:17347/mcp --bearer-token-env-var DEVDRIVR_MCP_KEY
```

Security defaults:

- The server binds to `127.0.0.1` only.
- Read permissions are enabled by default; write permissions are opt-in.
- Saved API request auth secrets are redacted unless secret exposure is enabled.
- The MCP API key is never returned by MCP help or schema tools.

Useful first agent requests:

```text
Use devdrivr MCP to search for snippets tagged react.
Use devdrivr MCP help to show available workflows.
Use devdrivr MCP to count my notes and snippets.
```

For full setup, tool reference, limits, and troubleshooting, see
[MCP_SERVER.md](MCP_SERVER.md).
