# MCP Server

devdrivr cockpit includes a local Model Context Protocol (MCP) server so CLI agents
such as Codex CLI and Claude Code can use Cockpit data and workflows directly.

The MCP server is local-first:

- It binds to `127.0.0.1` only.
- It uses bearer-token authentication.
- It starts automatically when Cockpit starts if MCP is enabled.
- It reads and writes the same local SQLite database as the desktop app.
- It never sends data to a cloud service by itself.

## What Agents Can Access

The MCP server exposes Cockpit resources as tools:

| Resource         | What It Contains                                 | MCP Capabilities                             |
| ---------------- | ------------------------------------------------ | -------------------------------------------- |
| Notes            | User notes, content, color, pinned state, tags   | List, get, create, update, delete            |
| Snippets         | Saved code/text snippets, language, folder, tags | List, get, create, update, delete            |
| Prompt templates | Built-in and user prompt templates               | List, get, create, update, delete user-owned |
| API requests     | Saved API client requests and collections        | List, get, create, update, delete requests   |

The server also exposes discovery tools:

| Tool         | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `help`       | Topic-based Markdown help for agents and users               |
| `introspect` | Machine-readable schemas, permissions, and settings metadata |
| `search`     | Unified search across primary resources                      |
| `multi_get`  | Fetch multiple resources by ID in one call                   |
| `counts`     | Count primary resources without fetching records             |

## Settings

Open **Settings > MCP** in Cockpit.

| Setting                    | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| Enabled                    | Starts the MCP server automatically when Cockpit starts         |
| Host                       | Local bind host. MVP supports `127.0.0.1` only                  |
| Port                       | Local MCP port. Default is `17347`; valid range is `1024-65535` |
| API key                    | Bearer token required by MCP clients                            |
| Permissions                | Per-resource read/create/update/delete access                   |
| Expose API request secrets | Controls whether saved API request auth secrets are returned    |

The settings panel also supports server status, start, stop, restart, key copy, and
key rotation.

## Connect a CLI Agent

Copy the MCP key from **Settings > MCP**, then store it in an environment variable:

```bash
export COCKPIT_MCP_KEY="copy-from-cockpit-settings"
```

Codex CLI:

```bash
codex mcp add cockpit --url http://127.0.0.1:17347/mcp --bearer-token-env-var COCKPIT_MCP_KEY
```

Claude Code:

```bash
claude mcp add --transport http cockpit http://127.0.0.1:17347/mcp --header "Authorization: Bearer $COCKPIT_MCP_KEY"
```

After connecting, ask the agent:

```text
Use Cockpit MCP to search for notes about Rust.
```

## Permissions

Cockpit MCP defaults to read-only access:

- `notes.read`
- `snippets.read`
- `promptTemplates.read`
- `apiRequests.read`

Write access is opt-in. To allow an agent to create, update, or delete a resource:

1. Open **Settings > MCP > Permissions**.
2. Enable the exact create, update, or delete action needed.
3. Apply settings or restart MCP.
4. Restart the MCP client if it caches tool metadata.

Use the smallest permission set needed for the task.

## Secret Handling

The MCP API key is never returned by `help` or `introspect`.

Saved API request auth secrets are redacted by default. Redacted auth fields use:

```json
{
  "__cockpitRedacted": true,
  "token": "***REDACTED***"
}
```

If **Expose API request secrets** is disabled, agents can still list and update API
requests without receiving bearer tokens or basic auth passwords. Updating a redacted
auth value preserves the existing secret unless the agent provides a new value.

## Useful Agent Workflows

Find related context:

```text
search({ "query": "react auth", "limit": 10 })
```

Search only snippets tagged with both `react` and `hooks`:

```text
search({ "types": ["snippets"], "tags": ["react", "hooks"] })
```

Fetch selected resources after search:

```text
multi_get({
  "ids": [
    { "type": "notes", "id": "..." },
    { "type": "snippets", "id": "..." }
  ]
})
```

Ask the server for topic-specific guidance:

```text
help({ "topic": "workflows" })
```

Ask for schemas and permissions:

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

| Symptom                      | Check                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| Client cannot connect        | Confirm Cockpit is running and MCP is enabled                    |
| Unauthorized                 | Re-copy the key from Settings > MCP and update `COCKPIT_MCP_KEY` |
| Permission denied            | Enable the specific resource action in Settings > MCP            |
| Port already in use          | Change the MCP port in Settings > MCP and restart                |
| Missing data in results      | Check resource permissions and search filters                    |
| API auth fields are redacted | Enable secret exposure only if the task requires it              |

For agent-side discovery, call:

```text
help({ "topic": "overview" })
```
