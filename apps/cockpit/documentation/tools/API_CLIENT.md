# API Client

## Overview

The API Client tool provides a full-featured HTTP client for testing APIs. It supports multiple environments, request collections, various authentication methods, and comprehensive response inspection.

## Features

### Environments

- **Multi-environment support**: Create and manage multiple environments (Development, Staging, Production, etc.)
- **Per-environment configuration**: Each environment stores its own base URL and headers
- **Variable substitution**: Use `{{variable}}` syntax to reference environment variables in requests

### Collections

- **Request organization**: Group related requests into collections
- **Save & load requests**: Persist requests to SQLite for later use
- **Quick access**: Recently used requests appear in the sidebar

### Request Builder

- **HTTP Methods**: Support for GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **URL params**: Key-value editor for query parameters
- **Headers**: Custom headers with autocomplete for common headers
- **Body types**:
  - JSON (with syntax highlighting)
  - Form Data
  - URL Encoded
  - Raw text
  - Binary file upload

### Authentication

- **No Auth**: Default option for public APIs
- **Basic Auth**: Username/password authentication
- **Bearer Token**: OAuth2-style bearer tokens
- **API Key**: Custom header or query param API keys

### Response Inspector

- **Status display**: HTTP status code with color-coded meaning
- **Timing**: Request duration in milliseconds
- **Headers**: Response headers table
- **Body viewer**:
  - JSON (formatted with syntax highlighting)
  - HTML (rendered preview)
  - Raw text
- **Copy response**: One-click copy of response body

## Usage

### Creating an Environment

1. Click the "Environments" button in the toolbar
2. Click "Add Environment"
3. Enter a name (e.g., "Development")
4. Add base URL (e.g., `https://api.example.com`)
5. Add any default headers or variables
6. Click "Save"

### Making a Request

1. Select an environment from the dropdown (or leave as "No Environment")
2. Choose HTTP method from the dropdown
3. Enter the endpoint path (or full URL)
4. Add URL params, headers, and body as needed
5. Click "Send" or press `Cmd+Enter`
6. View the response in the response panel

### Saving a Request

1. After crafting a request, click "Save Request"
2. Choose or create a collection
3. Enter a name for the request
4. Click "Save"

### Using Variables

Reference environment variables in your requests:

```
{{baseUrl}}/users/{{userId}}
```

Variable substitution happens at request time.

## Keyboard Shortcuts

- **Cmd+Enter**: Send request
- **Cmd+S**: Save current request

## Technical Details

### State Management

The tool uses `useToolState` for persistent state:

- `environment`: Currently selected environment
- `method`: HTTP method
- `url`: Request URL
- `params`: URL parameters
- `headers`: Request headers
- `body`: Request body
- `bodyType`: Body content type

### Database Schema

API Client uses three tables:

- `api_environments`: id, name, base_url, headers, created_at, updated_at
- `api_collections`: id, name, description, created_at, updated_at
- `api_requests`: id, collection_id, name, method, url, headers, body, created_at, updated_at

### Tauri Integration

- HTTP requests use Tauri's `@tauri-apps/plugin-http`
- File dialogs use `@tauri-apps/plugin-dialog`
- Database access via `@tauri-apps/plugin-sql`

## Dependencies

- `@tauri-apps/plugin-http` - HTTP client
- `@tauri-apps/plugin-dialog` - File dialogs
- `@tauri-apps/plugin-sql` - SQLite storage
- Monaco Editor for JSON body editing
- Zustand for state management

## Customization

The component follows the application theme system and uses CSS variables:

- `--color-bg`: Main background
- `--color-surface`: Panel backgrounds
- `--color-border`: Border colors
- `--color-text`: Text color
- `--color-success`: Success status (2xx)
- `--color-warning`: Warning status (3xx)
- `--color-error`: Error status (4xx, 5xx)
