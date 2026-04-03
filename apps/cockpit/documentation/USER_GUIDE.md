# User Guide

This comprehensive user guide covers all aspects of using the devdrivr cockpit application, from basic navigation to advanced features.

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

## Introduction

devdrivr cockpit is a powerful, local-first developer utility workspace that provides a collection of essential tools for developers. It's designed to be fast, efficient, and fully offline-capable with a focus on keyboard-driven workflows.

## Getting Started

### System Requirements

- **Operating System**: macOS 12.0+, Windows 10+, or Linux with a modern desktop environment
- **Runtime**: Tauri 2
- **Framework**: React 19
- **Storage**: SQLite with WAL mode for fast local data persistence

### Installation

1. Ensure you have Rust and cargo-cp-artifact installed
2. Install Bun v1.0+ from [bun.sh](https://bun.sh)
3. Clone the repository: `git clone https://github.com/your-username/devdrivr.git`
4. Install dependencies: `bun install`
5. Start the application: `bun run tauri dev`

## Interface Overview

The devdrivr cockpit interface is designed for efficiency and keyboard navigation:

### Main Components

1. **Sidebar**: Contains all tools organized by category
2. **Main Content Area**: Where the active tool is displayed
3. **Status Bar**: Shows current application status and connection information
4. **Command Palette**: Accessible via `Cmd/Ctrl + Shift + K`

### Sidebar Navigation

The sidebar is organized into tool groups:

- **Core Tools**: Essential utilities like Code Formatter, JSON Tools, YAML Tools
- **Data Tools**: JSON/YAML processors, API client, database utilities
- **Text Processing**: Regex tester, text utilities, string processors
- **Development Tools**: Code comparison, minifier, formatter
- **Utilities**: Base64 encoder/decoder, color picker, password generator

## Core Features

### Tool System

The application provides 27+ tools organized by function. Each tool is designed to be self-contained and focused on a specific developer task.

### State Persistence

All tool states are automatically saved and restored between sessions:

- Notes and snippets are saved to local SQLite database
- Tool states are preserved with automatic debouncing
- Window position and size are remembered between sessions

### Keyboard-Driven Navigation

The application is optimized for keyboard use:

- `Cmd/Ctrl + K` for quick tool switching
- `Cmd/Ctrl + ,` for settings
- `Cmd/Ctrl + /` for the command palette
- Tool-specific shortcuts for each utility

## Tools Reference

### Code Formatter

Format code in multiple languages with consistent styling:

- JavaScript, TypeScript, JSON, CSS, HTML, and more
- Configurable formatting options
- Real-time syntax highlighting
- Keyboard shortcut: `Cmd/Ctrl + Enter` to format

### JSON Tools

Work with JSON data:

- Format with proper indentation
- Minify by removing whitespace
- Sort object keys alphabetically
- Validate syntax with detailed error messages

### YAML Tools

Comprehensive YAML utility:

- Lint and format YAML content
- Interactive tree view browser
- Convert between JSON and YAML
- Sort keys and validate syntax

### API Client

Test and debug API endpoints:

- Create collections for organizing requests
- Set up environment variables
- View request history
- Inspect detailed response information

### Notes

Create and manage notes:

- Color-coded note system
- Automatic saving and syncing
- Searchable notes list
- Rich text support

### Snippets

Store and organize code snippets:

- Categorize by language or purpose
- Quick insert with keyboard shortcuts
- Syntax highlighting
- Export/import capabilities

## Settings and Customization

Access settings through the gear icon in the top right or with `Cmd/Ctrl + ,`.

### Appearance

- **Theme**: Choose between Light, Dark, or System preference
- **Editor Settings**: Font size, tab size, word wrap, line numbers
- **Window Behavior**: Window management preferences

### Keyboard Shortcuts

All keyboard shortcuts can be customized:

- Global navigation shortcuts
- Tool-specific shortcuts
- Custom user-defined shortcuts

### Data Management

Control your data:

- Clear history
- Export/import notes and snippets
- Reset settings to defaults
- Manage API collections and environments

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

All data is stored locally in SQLite:

- Settings are stored in the `settings` table
- Tool states are stored in the `tool_state` table
- Notes are stored in the `notes` table
- Snippets are stored in the `snippets` table
- History is stored in the `history` table
- API data is stored in `api_environments`, `api_collections`, and `api_requests` tables

### Data Persistence

Data is automatically saved with a two-tier system:

1. In-memory cache for instant response
2. Debounced SQLite writes for persistence

### Backup and Restore

The application automatically preserves your data between sessions. In case of issues:

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

### Command Line Interface

Use the CLI for advanced operations:

```bash
# Format files from command line
bun run format file.js

# Run tests
bun run test

# Build for production
bun run build

# Check types
bun run check-types
```

### Custom Shortcuts

Create custom keyboard shortcuts:

1. Open Settings (`Cmd/Ctrl + ,`)
2. Navigate to Keyboard Shortcuts
3. Click "Add Shortcut"
4. Define trigger and action

### API Access

Use the built-in API for automation:

```javascript
// Example API usage
import { ApiClient } from './api'

const client = new ApiClient()
client.get('/api/data').then((response) => {
  console.log(response.data)
})
```

### Performance Optimization

The application uses several techniques to maintain performance:

- Web Workers handle heavy computational tasks
- Virtualized lists for large data sets
- Efficient state management with Zustand
- Memoized components
- Database connection pooling

### Customizing the Interface

Adjust the interface to your preferences:

- Change themes in Settings
- Customize editor settings
- Modify keyboard shortcuts
- Adjust window behavior

## Resources

- [Documentation](./documentation/)
- [GitHub Repository](https://github.com/your-username/devdrivr)
- [Community Discord](https://discord.gg/devdrivr)
- [API Documentation](https://api.devdrivr.com)
- [Contribution Guide](CONTRIBUTING.md)

## Feedback and Support

For issues, suggestions, or questions:

1. Check the documentation
2. Search existing issues
3. Join our community Discord
4. Submit a GitHub issue
5. Contact support

## Glossary

- **Tool**: A self-contained utility for a specific developer task
- **State**: The saved data for a tool when last used
- **Workspace**: The collection of tools and settings
- **Collection**: A group of related API requests
- **Environment**: A set of variables for API testing
- **Snippet**: A saved piece of code for reuse
