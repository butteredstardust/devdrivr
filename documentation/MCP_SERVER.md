# MCP Server

Use the local Model Context Protocol (MCP) server to let CLI agents use devdrivr data and workflows.

The MCP server uses these local-first settings:

- It binds to `127.0.0.1` only.
- It uses bearer-token authentication.
- It is disabled by default on first run.
- It starts automatically when devdrivr starts if MCP is enabled.
- It reads and writes the same local SQLite database as the desktop app.
- It never sends data to a cloud service by itself.

## What Agents Can Access

The MCP server exposes devdrivr resources as tools:

| Resource         | What It Contains                                 | MCP Capabilities                             |
| ---------------- | ------------------------------------------------ | -------------------------------------------- |
| Notes            | User notes, content, color, pinned state, tags   | List, get, create, update, delete            |
| Snippets         | Saved code/text snippets, language, folder, tags | List, get, create, update, delete            |
| Prompt templates | Built-in and user prompt templates               | List, get, create, update, delete user-owned |
| API requests     | Saved API client requests and collections        | List, get, create, update, delete requests   |

Use the discovery tools to inspect and search available resources:

| Tool         | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `help`       | Topic-based Markdown help for agents and users               |
| `introspect` | Machine-readable schemas, permissions, and settings metadata |
| `search`     | Unified search across primary resources                      |
| `multi_get`  | Fetch multiple resources by ID in one call                   |
| `counts`     | Count primary resources without fetching records             |

## Settings

Open **Settings > MCP** before you connect an MCP client.

| Setting                    | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| Enabled                    | Off by default; starts the MCP server automatically when enabled |
| Host                       | Local bind host. MVP supports `127.0.0.1` only                   |
| Port                       | Local MCP port. Default is `17347`; valid range is `1024-65535`  |
| API key                    | Bearer token required by MCP clients                             |
| Permissions                | Per-resource read/create/update/delete access                    |
| Expose API request secrets | Controls whether saved API request auth secrets are returned     |

Use the settings panel to check status, start, stop, restart, copy keys, and rotate keys.

## Connect a CLI Agent

Start the server and copy the MCP key from **Settings > MCP**. Then store the key in an environment variable:

```bash
export DEVDRIVR_MCP_KEY="copy-from-devdrivr-settings"
```

Codex CLI:

```bash
codex mcp add devdrivr --url http://127.0.0.1:17347/mcp --bearer-token-env-var DEVDRIVR_MCP_KEY
```

Claude Code:

```bash
claude mcp add --transport http devdrivr http://127.0.0.1:17347/mcp --header "Authorization: Bearer $DEVDRIVR_MCP_KEY"
```

After you connect, send this request to the agent:

```text
Use devdrivr MCP to search for notes about Rust.
```

## Permissions

MCP uses read-only access by default:

- `notes.read`
- `snippets.read`
- `promptTemplates.read`
- `apiRequests.read`

WARNING: Write permissions let an agent change local data. Enable only the action required for the task.

To allow an agent to create, update, or remove a resource:

1. Open **Settings > MCP > Permissions**.
2. Enable the exact create, update, or remove action needed.
3. Apply settings or restart MCP.
4. Restart the MCP client if it caches tool metadata.

Use the smallest permission set for the task.

## Secret Handling

The server never returns the MCP API key through `help` or `introspect`.

Saved API request authentication secrets are redacted by default. Redacted fields use:

```json
{
  "__devdrivrRedacted": true,
  "token": "***REDACTED***"
}
```

When **Expose API request secrets** is disabled, agents can list and update API requests without bearer tokens or basic-auth passwords. Updating a redacted value keeps the existing secret unless the agent supplies a new value.

## Useful Agent Workflows

Use this command to find related context:

```text
search({ "query": "react auth", "limit": 10 })
```

Use this command to search snippets with both `react` and `hooks` tags:

```text
search({ "types": ["snippets"], "tags": ["react", "hooks"] })
```

Use this command to read selected resources after a search:

```text
multi_get({
  "ids": [
    { "type": "notes", "id": "..." },
    { "type": "snippets", "id": "..." }
  ]
})
```

Use this command to request topic guidance:

```text
help({ "topic": "workflows" })
```

Use this command to request schemas and permissions:

```text
introspect()
```

## Limits

| Limit                   | Value        |
| ----------------------- | ------------ |
| Search/list max results | 500          |
| `multi_get` max IDs     | 100          |
| MCP host                | `127.0.0.1`  |
| UI port range           | `1024-65535` |

## Troubleshooting

| Symptom                      | Check                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| Client cannot connect        | Confirm devdrivr is running and MCP is enabled                    |
| Unauthorized                 | Re-copy the key from Settings > MCP and update `DEVDRIVR_MCP_KEY` |
| Permission denied            | Enable the specific resource action in Settings > MCP             |
| Port already in use          | Change the MCP port in Settings > MCP and restart                 |
| Missing data in results      | Check resource permissions and search filters                     |
| API auth fields are redacted | Enable secret exposure only if the task requires it               |

For agent discovery, call:

```text
help({ "topic": "overview" })
```
