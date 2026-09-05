# Quick Start Guide

Use this guide after you install devdrivr. It describes the app, not developer environment setup.

## What is devdrivr?

devdrivr is a local-first, keyboard-driven developer utility workspace. See [PRODUCT_MAP.md](PRODUCT_MAP.md) for all tools.

## Install the App

Download an installer from the [latest release](https://github.com/butteredstardust/devdrivr/releases/latest). For a development environment, use [ONBOARDING.md](ONBOARDING.md).

## First Launch

On first launch, the sidebar lists the tools. The app then:

1. Opens a workspace.
2. Applies the saved theme.
3. Saves workspace data locally.

## Navigation

### Keyboard Shortcuts

- `Cmd/Ctrl + ,` - Open Settings
- `Cmd/Ctrl + K` - Quick search tools
- `Cmd/Ctrl + Shift + N` - Toggle the notes drawer
- `Cmd/Ctrl + /` - Show keyboard shortcuts
- `Cmd/Ctrl + [` - Go to previous tool
- `Cmd/Ctrl + ]` - Go to next tool

### Mouse Navigation

- Click a tool in the sidebar to open it.
- Use `Cmd/Ctrl + K` to search tools.
- Open Settings with `Cmd/Ctrl + ,`.

## Using Tools

### Code Formatter

Use Code Formatter to format supported source text:

1. **Paste Code**: Enter or paste code in the editor
2. **Select Language**: Choose from JavaScript, TypeScript, JSON, CSS, HTML, and more
3. **Format**: Click "Format" or press `Cmd/Ctrl + Enter`
4. **Copy Result**: Use the copy button to save formatted code

### JSON Tools

Use JSON Tools to validate and transform JSON:

1. **Format**: Pretty-print JSON with proper indentation
2. **Minify**: Compress JSON by removing whitespace
3. **Sort Keys**: Alphabetically sort object properties
4. **Validate**: Check JSON syntax and get detailed error messages

### YAML Tools

Use YAML Tools to validate and transform YAML:

1. **Lint & Format**: Real-time YAML syntax validation
2. **Tree View**: Interactive YAML structure browser
3. **JSON ↔ YAML**: Bidirectional conversion between formats

### API Client

Use API Client to send HTTP requests:

1. **Create Collections**: Organize API requests into collections
2. **Environment Variables**: Set up different environments (dev, staging, prod)
3. **Request History**: Track all API calls
4. **Response Inspection**: View detailed response information

## Customization

### Themes

Use Settings to select Light, Dark, or System theme:

1. Open Settings (`Cmd/Ctrl + ,`)
2. Navigate to the Appearance section
3. Choose between Light, Dark, or System preference

### Editor Settings

Use Settings to update shared editor preferences:

1. **Font Size**: Adjust text size in editors
2. **Tab Size**: Set indentation preferences
3. **Word Wrap**: Toggle word wrapping in editors
4. **Line Numbers**: Show/hide line numbers

## Data Management

### Notes

Use the notes drawer to create and update local notes:

1. **Create Notes**: Click the + button in the notes panel
2. **Color Coding**: Choose from multiple note colors
3. **Persistence**: All notes are automatically saved
4. **Search**: Find notes quickly with the search function

### Snippets

Use Snippets to save reusable code:

1. **Create Snippets**: Save code snippets for reuse
2. **Categorization**: Organize snippets by language or purpose
3. **Quick Insert**: Insert snippets with keyboard shortcuts
4. **Syntax Highlighting**: Language-aware code formatting

## Performance Tips

### Workspace behavior

1. Workers process supported tool operations.
2. The workspace writes state to local storage.

### Keyboard use

- Use `Tab`/`Shift+Tab` to navigate between fields
- Use `Cmd/Ctrl + Enter` to format in most tools
- Use `Cmd/Ctrl + K` for quick tool switching
- Use `Cmd/Ctrl + /` to access the command palette

## Troubleshooting

### Common Issues

1. **Application will not start**
   - Check the installer and platform requirements.
   - See the root README for unsigned-build guidance.

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
2. **Issues**: Report bugs on [GitHub Issues](https://github.com/butteredstardust/devdrivr/issues)
3. **Contributing**: See [`../CONTRIBUTING.md`](../CONTRIBUTING.md)

## Advanced Features

### Developer setup

Use [ONBOARDING.md](ONBOARDING.md) for development commands.

### More tool actions

Use tool controls for actions that apply to the active tool.

1. Open Settings (`Cmd/Ctrl + ,`)
2. Navigate to Keyboard Shortcuts
3. Click "Add Shortcut"
4. Define trigger and action

### Local MCP access

Use the local MCP server for agent access. See [USER_GUIDE.md](USER_GUIDE.md#mcp-server).

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for contribution guidance:

1. **Reporting Issues**: How to file bug reports
2. **Code Contributions**: Guidelines for submitting code
3. **Documentation**: Improving these docs
4. **Testing**: Writing and running tests

### Developer environment

Use [ONBOARDING.md](ONBOARDING.md) to create a development environment.

## Getting Started Checklist

- [ ] Explore the tools in the sidebar
- [ ] Customize your settings
- [ ] Try the keyboard shortcuts
- [ ] Create your first note or snippet

## Next Steps

1. **Explore Tools**: Open tools from the sidebar.
2. **Customize Settings**: Adjust the theme and editor settings
3. **Learn Shortcuts**: Practice the keyboard navigation
4. **Add Data**: Create your first note or snippet
5. **Test APIs**: Use the API Client to test endpoints
6. **Format Code**: Use the Code Formatter with your projects

## Resources

- [Documentation index](README.md)
- [GitHub Repository](https://github.com/butteredstardust/devdrivr)
- [Contribution Guide](../CONTRIBUTING.md)
