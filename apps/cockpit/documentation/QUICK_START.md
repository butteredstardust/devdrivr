# Quick Start Guide

Welcome to devdrivr cockpit! This guide will help you get up and running quickly with the application.

## What is devdrivr cockpit?

devdrivr cockpit is a local-first, keyboard-driven developer utility workspace that provides a collection of essential tools for developers. It's designed to be fast, efficient, and fully offline-capable.

## Installation

### Prerequisites

- [Rust and cargo-cp-artifact](https://www.rust-lang.org/tools/install)
- [Bun](https://bun.sh) (v1.0+)

### Installing Bun (macOS)

```bash
curl -fsSL https://bun.sh/install | bash
```

### Installing Bun (Windows)

```powershell
# Install using PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### Installing Bun (Linux)

```bash
# Install via package manager or official script
curl -fsSL https://bun.sh/install | bash
```

### Project Setup

```bash
# Clone the repository
git clone https://github.com/your-username/devdrivr.git
cd devdrivr

# Install dependencies
bun install

# Start development server
bun run tauri dev
```

## First Launch

When you first launch devdrivr cockpit, you'll see the main interface with the sidebar containing all available tools. The application will:

1. Restore your previous window position and size
2. Load your last used tool
3. Apply your theme preferences

## Navigation

### Keyboard Shortcuts

- `Cmd/Ctrl + ,` - Open Settings
- `Cmd/Ctrl + K` - Quick search tools
- `Cmd/Ctrl + Shift + K` - Global command palette
- `Cmd/Ctrl + /` - Show keyboard shortcuts
- `Cmd/Ctrl + [` - Go to previous tool
- `Cmd/Ctrl + ]` - Go to next tool

### Mouse Navigation

- Click on tool names in the sidebar to switch tools
- Use the search bar to quickly find tools
- Settings icon in the top right for application settings

## Using Tools

### Code Formatter

The Code Formatter tool helps you format code in multiple languages:

1. **Paste Code**: Enter or paste code in the editor
2. **Select Language**: Choose from JavaScript, TypeScript, JSON, CSS, HTML, and more
3. **Format**: Click "Format" or press `Cmd/Ctrl + Enter`
4. **Copy Result**: Use the copy button to save formatted code

### JSON Tools

Work with JSON data easily:

1. **Format**: Pretty-print JSON with proper indentation
2. **Minify**: Compress JSON by removing whitespace
3. **Sort Keys**: Alphabetically sort object properties
4. **Validate**: Check JSON syntax and get detailed error messages

### YAML Tools

Comprehensive YAML utility with multiple features:

1. **Lint & Format**: Real-time YAML syntax validation
2. **Tree View**: Interactive YAML structure browser
3. **JSON ↔ YAML**: Bidirectional conversion between formats

### API Client

Test and debug API endpoints:

1. **Create Collections**: Organize API requests into collections
2. **Environment Variables**: Set up different environments (dev, staging, prod)
3. **Request History**: Track all API calls
4. **Response Inspection**: View detailed response information

## Customization

### Themes

devdrivr cockpit supports both light and dark themes. You can change your theme in Settings:

1. Open Settings (`Cmd/Ctrl + ,`)
2. Navigate to the Appearance section
3. Choose between Light, Dark, or System preference

### Editor Settings

Customize your editing experience:

1. **Font Size**: Adjust text size in editors
2. **Tab Size**: Set indentation preferences
3. **Word Wrap**: Toggle word wrapping in editors
4. **Line Numbers**: Show/hide line numbers

## Data Management

### Notes

Create and manage notes with the built-in note-taking system:

1. **Create Notes**: Click the + button in the notes panel
2. **Color Coding**: Choose from multiple note colors
3. **Persistence**: All notes are automatically saved
4. **Search**: Find notes quickly with the search function

### Snippets

Store and organize code snippets:

1. **Create Snippets**: Save code snippets for reuse
2. **Categorization**: Organize snippets by language or purpose
3. **Quick Insert**: Insert snippets with keyboard shortcuts
4. **Syntax Highlighting**: Language-aware code formatting

## Performance Tips

### Optimizing devdrivr cockpit

1. **Web Workers**: Heavy operations run off the main thread
2. **State Persistence**: Two-tier system (cache + debounced DB writes)
3. **Memory Management**: Automatic cleanup of unused resources
4. **Efficient Rendering**: Virtualized lists for large datasets

### Keyboard Efficiency

- Use `Tab`/`Shift+Tab` to navigate between fields
- Use `Cmd/Ctrl + Enter` to format in most tools
- Use `Cmd/Ctrl + K` for quick tool switching
- Use `Cmd/Ctrl + /` to access the command palette

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

### Getting Help

1. **Documentation**: Check the documentation in `documentation/`
2. **Community**: Join our Discord for support
3. **Issues**: Report bugs on GitHub
4. **Contributing**: See `CONTRIBUTING.md`

## Advanced Features

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
client.get('/api/data').then(response => {
  console.log(response.data)
})
```

## Contributing

We welcome contributions! See `CONTRIBUTING.md` for details on:

1. **Reporting Issues**: How to file bug reports
2. **Code Contributions**: Guidelines for submitting code
3. **Documentation**: Improving these docs
4. **Testing**: Writing and running tests

### Development Setup

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Run tests
bun run test

# Check types
npx tsc --noEmit
```

## Getting Started Checklist

- [ ] Install Rust and cargo-cp-artifact
- [ ] Install Bun v1.0+
- [ ] Clone the repository
- [ ] Run `bun install`
- [ ] Start with `bun run tauri dev`
- [ ] Explore the tools in the sidebar
- [ ] Customize your settings
- [ ] Try the keyboard shortcuts
- [ ] Create your first note or snippet

## Next Steps

1. **Explore Tools**: Try each tool in the sidebar
2. **Customize Settings**: Adjust the theme and editor settings
3. **Learn Shortcuts**: Practice the keyboard navigation
4. **Add Data**: Create your first note or snippet
5. **Test APIs**: Use the API Client to test endpoints
6. **Format Code**: Use the Code Formatter with your projects

## Resources

- [Documentation](./documentation/)
- [GitHub Repository](https://github.com/your-username/devdrivr)
- [Community Discord](https://discord.gg/devdrivr)
- [API Documentation](https://api.devdrivr.com)
- [Contribution Guide](CONTRIBUTING.md)