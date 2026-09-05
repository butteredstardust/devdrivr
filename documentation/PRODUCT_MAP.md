# PRODUCT MAP — devdrivr

devdrivr is a local-first, keyboard-driven developer utility workspace. It runs as a Tauri 2 desktop app with a React 19 interface. The app stores its data in local SQLite storage.

Use this file as the product inventory. The tool registry defines the available tools.

## Tool Inventory

### Code

| Tool                  | ID                    | Description                                                                          |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Code Formatter        | `code-formatter`      | Format and beautify JS, TS, JSON, CSS, HTML, YAML, SQL, and GraphQL.                 |
| TypeScript Playground | `ts-playground`       | Compile TypeScript to JavaScript with live type checking.                            |
| Diff Viewer           | `diff-viewer`         | Compare text with syntax highlighting, automatic diff, statistics, and patch export. |
| Refactoring Toolkit   | `refactoring-toolkit` | Run AST codemods for JS and TS with a diff preview.                                  |

### Data

| Tool                  | ID                      | Description                                                                                   |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| JSON Tools            | `json-tools`            | Validate, format, minify, sort keys, query paths, and view JSON.                              |
| XML Tools             | `xml-tools`             | Validate XML and use tree, JSON, XPath, format, minify, and copy views.                       |
| YAML Tools            | `yaml-tools`            | Validate YAML and use tree, JSON, format, sort, and compact views.                            |
| JSON Schema Validator | `json-schema-validator` | Validate JSON against a schema. Use templates, inference, sample generation, and strict mode. |
| CSV Tools             | `csv-tools`             | View, filter, convert, inspect, and generate schemas from CSV data.                           |

### Web

| Tool            | ID                | Description                                                                                    |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| CSS Validator   | `css-validator`   | Check CSS, view problems and specificity, and format input.                                    |
| HTML Validator  | `html-validator`  | Validate HTML and use preview, problems, accessibility rules, heading outline, and formatting. |
| CSS Specificity | `css-specificity` | Calculate selector specificity and compare results.                                            |
| CSS → Tailwind  | `css-to-tailwind` | Convert CSS rules to Tailwind classes.                                                         |

### Convert

| Tool                | ID                    | Description                                                                           |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Case Converter      | `case-converter`      | Convert between 12 cases with detection, word splitting, and chaining.                |
| Color Converter     | `color-converter`     | Convert color values and use named colors, scales, harmony, and history.              |
| Timestamp Converter | `timestamp-converter` | Work with timestamps, presets, dates, timezones, and day or week information.         |
| Base64              | `base64`              | Encode and decode Base64. Use URL-safe mode, line wrap, image preview, and data URIs. |
| URL Encode/Decode   | `url-codec`           | Encode and decode URLs. Use recursive, line-by-line, swap, and parsed-parts modes.    |
| cURL → Fetch        | `curl-to-fetch`       | Convert cURL to fetch, axios, ky, XHR, or Node.js.                                    |
| UUID Generator      | `uuid-generator`      | Generate, validate, parse, and export v1, v4, v5, and v7 UUIDs.                       |
| Hash Generator      | `hash-generator`      | Hash text or streamed files with MD5, SHA, SHA-3, BLAKE2b, and HMAC.                  |
| Image Tool          | `image-tool`          | Resize, crop, rotate, flip, compress, and convert JPEG, PNG, and WebP images.         |

### Test

| Tool         | ID             | Description                                                                  |
| ------------ | -------------- | ---------------------------------------------------------------------------- |
| Regex Tester | `regex-tester` | Test and replace text with match highlighting, groups, and export.           |
| JWT Decoder  | `jwt-decoder`  | Decode JWTs and use HMAC verification, claim windows, and color-coded parts. |

### Network

| Tool         | ID             | Description                                                                         |
| ------------ | -------------- | ----------------------------------------------------------------------------------- |
| API Client   | `api-client`   | Send HTTP requests with form or file bodies, cURL export, and a response inspector. |
| Docs Browser | `docs-browser` | Browse devdocs.io documentation.                                                    |

### Write

| Tool             | ID                 | Description                                                                                  |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| Markdown Editor  | `markdown-editor`  | Edit Markdown with find and replace, templates, table of contents, reading time, and export. |
| Mermaid Editor   | `mermaid-editor`   | Edit and preview Mermaid diagrams. Export SVG or PNG.                                        |
| Snippets         | `snippets`         | Organize, search, edit, and back up reusable code snippets.                                  |
| Prompt Templates | `prompt-templates` | Fill AI prompt templates with variables, preview tokens, and copy the result.                |

## Workspace Data

The app opens the SQLite database named `cockpit.db`. The Tauri application identifier is `com.devdrivr.cockpit`.

| Table                   | Contents                            |
| ----------------------- | ----------------------------------- |
| `settings`              | App preferences.                    |
| `tool_state`            | State for a tool tab.               |
| `notes`                 | Notes and their properties.         |
| `snippets`              | Saved code snippets.                |
| `history`               | Tool execution history.             |
| `api_environments`      | API Client environments.            |
| `api_collections`       | API Client collections.             |
| `api_requests`          | Saved API Client requests.          |
| `user_prompt_templates` | Built-in and user prompt templates. |

The first tab for a tool uses its tool ID as the state key. Duplicate tabs use `<toolId>#<tabId>`. Closing a duplicate tab removes its saved state.

## Global Shortcuts

| Shortcut                                | Action                                        |
| --------------------------------------- | --------------------------------------------- |
| `Cmd+K`                                 | Open the command palette.                     |
| `Cmd+B`                                 | Toggle the sidebar.                           |
| `Cmd+Shift+N`                           | Toggle the notes drawer.                      |
| `Cmd+Shift+T`                           | Cycle the theme.                              |
| `Cmd+]` / `Cmd+[`                       | Open the next or previous tool.               |
| `Cmd+Enter`                             | Execute the active tool action.               |
| `Cmd+Shift+C`                           | Copy active tool output.                      |
| `Cmd+O`                                 | Open a file when the active tool supports it. |
| `Cmd+S`                                 | Save output when the active tool supports it. |
| `Cmd+,`                                 | Toggle the settings panel.                    |
| `Cmd+Shift+P`                           | Toggle always-on-top.                         |
| `Cmd+/`                                 | Toggle the shortcut reference.                |
| `Cmd+1` through `Cmd+9`                 | Switch to a workspace tab by position.        |
| `Cmd+W`                                 | Close the current workspace tab.              |
| `Cmd+Ctrl+F` on macOS / `F11` elsewhere | Toggle native fullscreen.                     |

On Windows and Linux, use `Ctrl` where this table shows `Cmd`.

## Product Boundaries

devdrivr does not require an account. The API Client sends network requests when you use it. Other tool behavior depends on the local app and its saved data.
