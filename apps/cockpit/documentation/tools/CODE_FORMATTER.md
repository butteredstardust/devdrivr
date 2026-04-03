# Code Formatter

## Overview

The Code Formatter tool provides multi-language code formatting capabilities for various programming languages and markup formats. It supports formatting for JavaScript, TypeScript, JSON, CSS, HTML, and many other languages.

## Supported Languages

- JavaScript
- TypeScript
- JSON
- CSS, SCSS, Less
- HTML
- Markdown
- YAML
- XML
- SQL
- GraphQL

## Features

### Formatting Options

- **Language Selection**: Choose from 12+ supported languages
- **Auto-detection**: Automatically detect the language of input code
- **Indentation**: Configure 2 or 4 space indentation
- **Quote Style**: Toggle between single and double quotes
- **Semicolons**: Enable/disable semicolon insertion
- **Trailing Commas**: Configure trailing comma behavior

### Keyboard Shortcuts

- **Cmd/Ctrl+Enter**: Format the current code immediately

## Usage

### Basic Operation

1. **Paste Code**: Enter or paste code in the editor
2. **Select Language**: Choose the appropriate language from the dropdown
3. **Format**: Click "Format" or press Cmd/Ctrl+Enter
4. **Copy Result**: Use the copy button to save formatted code

### Advanced Options

The tool provides several formatting options that can be customized:

- **Tab Width**: Choose between 2 or 4 spaces for indentation
- **Quote Style**: Toggle between single and double quotes
- **Semicolons**: Choose whether to add semicolons
- **Trailing Commas**: Configure trailing comma behavior

## Technical Details

### Component Structure

The Code Formatter uses Monaco Editor for code editing with real-time syntax highlighting and Web Workers for formatting operations to prevent UI blocking.

### Key Functions

- `handleFormat()`: Formats code using Prettier worker
- `handleAutoDetect()`: Automatically detects code language

### State Management

The component uses `useToolState` for persistent state:

- `input`: Current code content
- `language`: Currently selected language
- `tabWidth`: Indentation setting (2 or 4)
- `singleQuote`: Use single quotes preference
- `trailingComma`: Trailing comma style ('all', 'es5', 'none')
- `semi`: Semicolon insertion preference

### Performance Considerations

- Web Workers handle formatting operations off the main thread
- Monaco Editor provides efficient code editing with syntax highlighting
- Web Worker automatically terminates when component unmounts

## Dependencies

- `@monaco-editor/react` for code editing
- Custom Web Worker for Prettier formatting
- Zustand for state management
- Tailwind CSS for styling

## Customization

The component follows the application theme system and uses CSS variables:

- `--color-bg`: Main background
- `--color-surface`: Panel backgrounds
- `--color-border`: Border colors
- `--color-text`: Text color
- `--color-text-muted`: Muted text color
- `--color-accent`: Accent color for highlights
