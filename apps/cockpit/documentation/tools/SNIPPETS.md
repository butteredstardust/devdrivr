# Snippets Manager

## Overview

The Snippets Manager tool provides a code snippet library for storing, organizing, and quickly accessing reusable code blocks. Snippets are persisted to SQLite and support tagging, search, and import/export functionality.

## Features

### CRUD Operations

- **Create**: Add new snippets with title, content, language, and tags
- **Read**: Browse snippets by tags, search by title/content
- **Update**: Edit snippet content, language, tags, or title
- **Delete**: Remove snippets with confirmation

### Organization

- **Tags**: Assign multiple tags to each snippet for categorization
- **Favorites**: Mark frequently used snippets as favorites for quick access
- **Search**: Full-text search across snippet titles, content, and tags

### Sorting & Filtering

- **Sort by**: Title, date created, date modified, language
- **Filter by**: Language, tags, favorites

### Import/Export

- **Export**: Download all snippets as a JSON file
- **Import**: Load snippets from a JSON file (merge or replace)

### Quick Actions

- **Copy to clipboard**: One-click copy snippet content
- **Duplicate**: Create a copy of an existing snippet
- **Send to**: Send snippet content to another tool (via SendTo menu)

## Usage

### Creating a Snippet

1. Click "New Snippet" or press `Cmd+N`
2. Enter a title for the snippet
3. Select the programming language from the dropdown
4. Add tags (comma-separated or click to add)
5. Enter the code content
6. Click "Save" or press `Cmd+S`

### Using a Snippet

1. Browse or search for the snippet
2. Click "Copy" or press `Cmd+Shift+C` to copy to clipboard
3. Use the code in your editor or another tool

### Managing Tags

- Tags are displayed as colored chips on each snippet
- Click a tag to filter snippets by that tag
- Multi-select tags to filter by multiple tags

### Import/Export

**Export**:

1. Click the "Export" button in the toolbar
2. Choose where to save the JSON file
3. All snippets (including metadata) are exported

**Import**:

1. Click the "Import" button
2. Select a JSON file to import
3. Choose: "Merge" (add to existing) or "Replace" (replace all)
4. Review the snippets to be imported
5. Confirm import

## Keyboard Shortcuts

- **Cmd+N**: New snippet
- **Cmd+S**: Save current snippet
- **Cmd+Shift+C**: Copy snippet to clipboard
- **Cmd+F**: Focus search input
- **Delete**: Delete selected snippet (with confirmation)

## Technical Details

### State Management

The tool uses `useToolState` for persistent state:

- `snippets`: Array of all snippets
- `searchQuery`: Current search text
- `selectedTags`: Currently selected tag filters
- `sortBy`: Current sort order
- `selectedSnippet`: Currently selected snippet for editing

### Database Schema

Snippets are stored in the `snippets` table:

- `id`: Unique identifier (UUID)
- `title`: Snippet title
- `content`: Code content (text)
- `language`: Programming language
- `tags`: JSON array of tag strings
- `created_at`: Creation timestamp
- `updated_at`: Last modified timestamp

### Tool Integration

Snippets can be sent to other tools via the `dispatchToolAction` system:

- Select "Send to" from the snippet menu
- Choose the target tool
- The content is passed to the tool's input

## Supported Languages

The tool supports syntax highlighting for:

- JavaScript / TypeScript
- Python
- Rust
- Go
- HTML / CSS
- JSON / YAML
- SQL
- Markdown
- Shell / Bash
- And many more (via Monaco Editor's language support)

## Dependencies

- Monaco Editor for code editing with syntax highlighting
- Zustand for state management
- SQLite via `@tauri-apps/plugin-sql` for persistence

## Customization

The component follows the application theme system and uses CSS variables:

- `--color-bg`: Main background
- `--color-surface`: Panel backgrounds
- `--color-border`: Border colors
- `--color-text`: Text color
- `--color-accent`: Accent color for buttons and highlights
- `--color-success`: Success states
