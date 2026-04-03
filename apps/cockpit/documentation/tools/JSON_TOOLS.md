# JSON Tools

## Overview

JSON Tools is a comprehensive utility for working with JSON data. It provides features for validating, formatting, parsing, and analyzing JSON content through multiple visualization modes.

## Features

### Lint & Format
- **Validation**: Real-time JSON syntax validation with error highlighting
- **Formatting**: Pretty-print JSON with proper indentation
- **Minification**: Compress JSON by removing whitespace
- **Key Sorting**: Sort object keys alphabetically
- **Path Querying**: Query specific values using JSONPath syntax

### Tree View
- **Interactive Tree**: Expandable/collapsible JSON structure visualization
- **Value Copying**: Click on any value to copy it to clipboard
- **Path Copying**: Click on property names to copy their JSONPath

### Table View
- **Tabular Display**: View JSON arrays as tables
- **Cell Copying**: Click on any cell to copy its contents
- **Column Detection**: Automatically detect all object keys for column headers

## Usage

### Basic Operations

1. **Input JSON**: Paste or type JSON in the editor
2. **Format**: Click the "Format" button to pretty-print valid JSON
3. **Minify**: Click "Minify" to compress whitespace
4. **Sort Keys**: Click "Sort Keys" to alphabetically sort object properties

### Path Queries

Use JSONPath syntax to query specific values:
- `$.key` - Access property "key" at root level
- `$.array[0]` - Access first item in array
- `$.nested.key` - Access nested property

### Tree View Navigation

- Click ▶ to expand/collapse objects and arrays
- Click on values to copy them
- Click on property names to copy their JSONPath
- Use "Expand All" and "Collapse All" buttons

### Table View

- Displays JSON arrays as tables with automatic column detection
- Click on any cell to copy its value
- Works with arrays of objects (e.g., `[{name: "John", age: 30}, {name: "Jane", age: 25}]`)

## Technical Details

### Component Structure

The JSON Tools component is organized into three main tabs:

1. **Lint & Format**: Main editor with formatting controls
2. **Tree View**: Interactive JSON structure browser
3. **Table View**: Tabular display of JSON arrays

### Key Functions

- `sortKeysDeep()`: Recursively sorts object keys alphabetically
- `jsonStats()`: Calculates key count, depth, and size of JSON data
- `queryJsonPath()`: Extracts values using JSONPath syntax
- `handleFormat()`: Formats JSON using Prettier worker
- `handleMinify()`: Removes whitespace from JSON
- `handleSortKeys()`: Sorts object keys in JSON

### State Management

The component uses `useToolState` for persistent state across sessions:
- `input`: Current JSON content
- `activeTab`: Currently selected view tab
- `query`: Current JSONPath query string

### Error Handling

- Real-time validation with detailed error messages
- Graceful handling of malformed JSON
- Visual error indicators in the editor
- Separate error display for format failures

### Performance Considerations

- Web Workers handle heavy formatting operations off the main thread
- Memoized parsing and statistics computation
- Virtualized rendering for large JSON structures
- Efficient tree view rendering with key-based updates

## Dependencies

- `@monaco-editor/react` for code editing
- Custom Web Worker for Prettier formatting
- Zustand for state management
- Tailwind CSS for styling

## Customization

The component respects the application theme system and uses CSS variables for consistent styling:
- `--color-bg`: Main background
- `--color-surface`: Panel backgrounds
- `--color-text`: Primary text
- `--color-text-muted`: Secondary text
- `--color-border`: Border colors
- `--color-accent`: Accent/highlight color
- `--color-error`: Error state color
- `--color-success`: Success state color
- `--color-warning`: Warning state color