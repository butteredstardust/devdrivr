# YAML Tools

## Overview

YAML Tools is a comprehensive utility for working with YAML data. It provides features for validating, formatting, parsing, and converting YAML content through multiple visualization and conversion modes.

## Features

### Lint & Format
- **Validation**: Real-time YAML syntax validation with error highlighting
- **Formatting**: Pretty-print YAML with proper indentation
- **Minification**: Compress YAML by removing unnecessary whitespace
- **Key Sorting**: Sort object keys alphabetically

### Tree View
- **Interactive Tree**: Expandable/collapsible YAML structure visualization
- **Value Copying**: Click on any value to copy it to clipboard

### JSON ↔ YAML Conversion
- **YAML to JSON**: Convert YAML documents to JSON format
- **JSON to YAML**: Convert JSON documents to YAML format
- **Bidirectional Conversion**: Easy switching between conversion directions

## Usage

### Basic Operations

1. **Input YAML**: Paste or type YAML in the editor
2. **Format**: Click the "Format" button to pretty-print valid YAML
3. **Minify**: Click "Minify" to compress whitespace
4. **Sort Keys**: Click "Sort Keys" to alphabetically sort object properties

### Tree View Navigation

- Click ▼ to expand/collapse objects and arrays
- Click on values to copy them
- View statistics about the YAML structure

### JSON/YAML Conversion

Switch between conversion modes:
- **YAML → JSON**: Convert YAML to JSON format
- **JSON → YAML**: Convert JSON to YAML format

## Technical Details

### Component Structure

The YAML Tools component is organized into three main tabs:

1. **Lint & Format**: Main editor with formatting controls
2. **Tree View**: Interactive YAML structure browser
3. **JSON ↔ YAML**: Bidirectional conversion interface

### Key Functions

- `parseYaml()`: Parse and validate YAML content
- `stringifyYaml()`: Convert data to YAML string format
- `yamlToJson()`: Convert YAML to JSON format
- `jsonToYaml()`: Convert JSON to YAML format
- `sortKeysDeep()`: Recursively sort object keys
- `handleFormat()`: Format YAML using Prettier worker
- `handleMinify()`: Remove unnecessary whitespace from YAML
- `handleSortKeys()`: Sort object keys in YAML
- `handleConvert()`: Convert between YAML and JSON formats

### State Management

The component uses `useToolState` for persistent state across sessions:
- `input`: Current YAML content
- `activeTab`: Currently selected view tab
- `jsonInput`: Current JSON content for conversion

### Error Handling

- Real-time validation with detailed error messages
- Visual error indicators in the editor
- Separate error display for format failures

### Performance Considerations

- Web Workers handle heavy formatting operations off the main thread
- Memoized parsing and statistics computation
- Efficient tree view rendering with key-based updates

## Dependencies

- `js-yaml` for YAML parsing and stringification
- `@monaco-editor/react` for code editing
- Custom Web Worker for Prettier formatting
- Zustand for state management
- Tailwind CSS for styling