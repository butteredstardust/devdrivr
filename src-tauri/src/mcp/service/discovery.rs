use super::*;

#[derive(Debug)]
struct SearchCandidate {
    resource_type: ResourceType,
    value: Value,
    score: i64,
    created_at: i64,
    updated_at: i64,
}

impl SearchCandidate {
    fn to_result(&self) -> Value {
        json!({
            "type": self.resource_type.key(),
            "id": self.value.get("id").and_then(Value::as_str).unwrap_or_default(),
            "title": resource_title(self.resource_type, &self.value),
            "summary": resource_summary(self.resource_type, &self.value),
            "tags": self.value.get("tags").cloned().unwrap_or_else(|| json!([])),
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "score": self.score,
        })
    }
}

fn resource_title(resource_type: ResourceType, value: &Value) -> String {
    let field = match resource_type {
        ResourceType::PromptTemplates | ResourceType::ApiRequests => "name",
        ResourceType::Notes | ResourceType::Snippets => "title",
    };
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn resource_summary(resource_type: ResourceType, value: &Value) -> String {
    let summary = match resource_type {
        ResourceType::Notes | ResourceType::Snippets => value
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        ResourceType::PromptTemplates => value
            .get("description")
            .and_then(Value::as_str)
            .filter(|description| !description.trim().is_empty())
            .or_else(|| value.get("prompt").and_then(Value::as_str))
            .unwrap_or_default()
            .to_string(),
        ResourceType::ApiRequests => {
            let method = value
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let url = value.get("url").and_then(Value::as_str).unwrap_or_default();
            format!("{method} {url}").trim().to_string()
        }
    };
    truncate_chars(summary.trim(), 220)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn value_i64(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or_default()
}

fn value_tags(value: &Value) -> Vec<String> {
    value
        .get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(Value::as_str)
                .map(|tag| tag.trim().to_lowercase())
                .filter(|tag| !tag.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn has_all_tags(value: &Value, required_tags: &[String]) -> bool {
    if required_tags.is_empty() {
        return true;
    }
    let tags = value_tags(value);
    required_tags
        .iter()
        .all(|required| tags.iter().any(|tag| tag == required))
}

fn matches_date_filters(value: &Value, args: &SearchArgs) -> bool {
    let created_at = value_i64(value, "createdAt");
    let updated_at = value_i64(value, "updatedAt");
    args.created_after.is_none_or(|after| created_at >= after)
        && args
            .created_before
            .is_none_or(|before| created_at <= before)
        && args.updated_after.is_none_or(|after| updated_at >= after)
        && args
            .updated_before
            .is_none_or(|before| updated_at <= before)
}

fn searchable_text(resource_type: ResourceType, value: &Value) -> String {
    match resource_type {
        ResourceType::Notes => format!(
            "{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::Snippets => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("fragments")
                .map_or_else(String::new, |fragments| {
                    fragments
                        .as_array()
                        .into_iter()
                        .flatten()
                        .flat_map(|fragment| {
                            ["name", "content", "language"].map(|field| {
                                fragment
                                    .get(field)
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                            })
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                }),
            value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::PromptTemplates => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::ApiRequests => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value.get("url").and_then(Value::as_str).unwrap_or_default(),
            value
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value.get("headers").cloned().unwrap_or_else(|| json!([]))
        ),
    }
}

fn search_score(resource_type: ResourceType, value: &Value, query: Option<&str>) -> Option<i64> {
    let Some(query) = query.map(str::trim).filter(|query| !query.is_empty()) else {
        return Some(1);
    };
    let query = query.to_lowercase();
    let title = resource_title(resource_type, value).to_lowercase();
    let tags = value_tags(value).join(" ");
    let text = searchable_text(resource_type, value).to_lowercase();
    let mut score = 0;

    if title == query {
        score += 120;
    } else if title.contains(&query) {
        score += 80;
    }
    if tags.split_whitespace().any(|tag| tag == query) {
        score += 60;
    } else if tags.contains(&query) {
        score += 40;
    }
    if text.contains(&query) {
        score += 20;
    }

    (score > 0).then_some(score)
}

fn build_search_candidate(
    resource_type: ResourceType,
    value: Value,
    query: Option<&str>,
    required_tags: &[String],
    args: &SearchArgs,
) -> Option<SearchCandidate> {
    if !has_all_tags(&value, required_tags) || !matches_date_filters(&value, args) {
        return None;
    }
    let score = search_score(resource_type, &value, query)?;
    Some(SearchCandidate {
        resource_type,
        created_at: value_i64(&value, "createdAt"),
        updated_at: value_i64(&value, "updatedAt"),
        value,
        score,
    })
}

fn compare_search_candidates(
    left: &SearchCandidate,
    right: &SearchCandidate,
    sort: SearchSort,
) -> Ordering {
    let ordering = match sort {
        SearchSort::Relevance => right
            .score
            .cmp(&left.score)
            .then_with(|| right.updated_at.cmp(&left.updated_at)),
        SearchSort::UpdatedDesc => right.updated_at.cmp(&left.updated_at),
        SearchSort::UpdatedAsc => left.updated_at.cmp(&right.updated_at),
        SearchSort::CreatedDesc => right.created_at.cmp(&left.created_at),
        SearchSort::CreatedAsc => left.created_at.cmp(&right.created_at),
    };
    ordering
        .then_with(|| left.resource_type.key().cmp(right.resource_type.key()))
        .then_with(|| {
            resource_title(left.resource_type, &left.value)
                .cmp(&resource_title(right.resource_type, &right.value))
        })
}

fn available_help_topics() -> Vec<&'static str> {
    HELP_TOPICS.to_vec()
}

fn help_payload(topic: &str, content: String) -> Value {
    json!({
        "topic": topic,
        "availableTopics": available_help_topics(),
        "content": content,
    })
}

fn help_response(topic: &str, content: String) -> McpResult {
    to_json_text(help_payload(topic, content))
}

fn mcp_url(settings: &McpSettings) -> String {
    format!("http://{}:{}/mcp", settings.host, settings.port)
}

fn help_overview(settings: &McpSettings) -> String {
    format!(
        r#"# devdrivr MCP Overview

devdrivr MCP lets CLI agents read and manage local devdrivr notes, snippets, prompt templates, and saved API client requests.

Server:
- URL: `{url}`
- Enabled in settings: `{enabled}`
- Authentication: `Authorization: Bearer $DEVDRIVR_MCP_KEY`

Primary resources:
- `notes`: markdown-compatible notes with tags, pinned state, and typed folders.
- `snippets`: reusable code or text snippets with language, typed folders, and legacy folder-name compatibility.
- `promptTemplates`: built-in and user prompt templates with variables and tips.
- `apiRequests`: saved API client requests. Requests are not executed by MCP.

Quick start:
- Search everything: `search({{"query":"react","limit":10}})`
- Search tagged snippets: `search({{"types":["snippets"],"tags":["react","hooks"]}})`
- Inspect schemas: `introspect()`
- Count resources: `counts()`
- Fetch selected records: `multi_get({{"ids":[{{"type":"notes","id":"..."}}]}})`
- Browse folders: `resource_folders_list({{"kind":"notes"}})`
- Undo a delete: `trash_list({{}})` then `trash_restore({{"type":"notes","id":"..."}})`

Use `help({{"topic":"tools"}})` for the tool reference and `help({{"topic":"clients"}})` for CLI setup examples.
"#,
        url = mcp_url(settings),
        enabled = settings.enabled
    )
}

fn permission_for_tool(name: &str) -> &'static str {
    let resource = if name.starts_with("resource_folders_") {
        return "kind-specific resource permission";
    } else if name.starts_with("notes_") {
        "notes"
    } else if name.starts_with("snippets_") {
        "snippets"
    } else if name.starts_with("prompt_templates_") {
        "promptTemplates"
    } else if name.starts_with("api_requests_") || name.starts_with("api_collections_") {
        "apiRequests"
    } else {
        return "none";
    };

    let action = if name.ends_with("_create") {
        "create"
    } else if name.ends_with("_update") {
        "update"
    } else if name.ends_with("_delete") {
        "delete"
    } else {
        "read"
    };

    match (resource, action) {
        ("notes", "read") => "notes.read",
        ("notes", "create") => "notes.create",
        ("notes", "update") => "notes.update",
        ("notes", "delete") => "notes.delete",
        ("snippets", "read") => "snippets.read",
        ("snippets", "create") => "snippets.create",
        ("snippets", "update") => "snippets.update",
        ("snippets", "delete") => "snippets.delete",
        ("promptTemplates", "read") => "promptTemplates.read",
        ("promptTemplates", "create") => "promptTemplates.create",
        ("promptTemplates", "update") => "promptTemplates.update",
        ("promptTemplates", "delete") => "promptTemplates.delete",
        ("apiRequests", "read") => "apiRequests.read",
        ("apiRequests", "create") => "apiRequests.create",
        ("apiRequests", "update") => "apiRequests.update",
        ("apiRequests", "delete") => "apiRequests.delete",
        _ => "none",
    }
}

fn tool_pitfall(name: &str) -> &'static str {
    match name {
        "search" => "Use `types` and `tags` to reduce result volume; `limit` defaults to 50 and is capped at 500.",
        "multi_get" => "Maximum 100 IDs per call; missing IDs are returned per item instead of failing the whole call.",
        "introspect" => "Use this for machine-readable schemas; use `help` for workflow guidance.",
        "counts" => "Counts only returns resources allowed by current read permissions unless a denied type is explicitly requested.",
        "help" => "The API key is never returned; copy it from Settings > MCP.",
        "prompt_templates_delete" => "Built-in templates cannot be deleted. Update a built-in to create a user-owned copy.",
        "trash_list" => "Prompt templates are deleted outright and never appear in Trash.",
        "trash_restore" => "Restoring is charged to the update permission, not to delete.",
        "api_requests_list" | "api_requests_get" => {
            "Auth secrets are redacted unless API request secret exposure is enabled in MCP settings."
        }
        "api_requests_create" | "api_requests_update" => {
            "This saves the request definition only; it does not execute the HTTP request."
        }
        "resource_folders_move" => "The parent must have the same kind and cannot be this folder or a descendant.",
        "resource_folders_update" => "MCP intentionally does not provide resource folder deletion.",
        _ => "Check required permissions and use IDs returned by search or list tools.",
    }
}

fn schema_parameter_summary(schema: &Value) -> String {
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .or_else(|| {
            schema
                .get("$defs")
                .and_then(Value::as_object)
                .and_then(|defs| {
                    defs.values()
                        .find_map(|def| def.get("properties")?.as_object())
                })
        });
    let Some(properties) = properties else {
        return "none".to_string();
    };
    let required = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .unwrap_or_default();

    let mut fields = properties
        .keys()
        .map(|name| {
            if required.iter().any(|required| required == name) {
                format!("{name} (required)")
            } else {
                format!("{name} (optional)")
            }
        })
        .collect::<Vec<_>>();
    fields.sort();
    if fields.is_empty() {
        "none".to_string()
    } else {
        fields.join(", ")
    }
}

fn help_tools_from_router(tool_router: &ToolRouter<DevdrivrMcpService>) -> String {
    let mut content = String::from(
        "# devdrivr MCP Tool Reference\n\nUse `introspect()` for full machine-readable resource schemas. The list below is generated from the active MCP tool router.\n\n",
    );

    for tool in tool_router.list_all() {
        let name = tool.name.as_ref();
        let schema = tool.schema_as_json_value();
        let description = tool.description.as_deref().unwrap_or("No description.");
        content.push_str(&format!(
            "## `{name}`\n- Description: {description}\n- Parameters: {params}\n- Required permission: `{permission}`\n- Common pitfall: {pitfall}\n\n",
            params = schema_parameter_summary(&schema),
            permission = permission_for_tool(name),
            pitfall = tool_pitfall(name)
        ));
    }

    content
}

fn help_workflows() -> String {
    r#"# devdrivr MCP Workflows

## Find React snippets tagged hooks
1. Call `search({"types":["snippets"],"query":"react","tags":["hooks"],"limit":20})`.
2. Use `multi_get` for the IDs that need full content.
3. If no results appear, retry with fewer tags or use `snippets_list({"query":"react"})`.

## Gather context for an agent task
1. Call `counts()` to understand data volume.
2. Call `search({"query":"<topic>","limit":20})`.
3. Call `multi_get` for selected IDs.
4. Quote IDs in any proposed update so the user can review exact targets.

## Create or update resources
1. Confirm the matching create/update permission is enabled.
2. Use `*_create` for new records or `*_update` with an existing ID.
3. For prompt templates, updating a built-in creates a user copy.
4. For API requests, remember MCP saves definitions but does not execute HTTP calls.

## Organize resources with folders
1. Call `resource_folders_list({"kind":"notes"})` (or `snippets` / `apiRequests`) to get typed folder IDs.
2. Create folders with `resource_folders_create`, then pass their ID as `folderId` when creating or updating a resource.
3. Use `resource_folders_move` only with a parent of the same kind; cycles are rejected.
4. `folderPath` is returned as an ordered array of folder names. Snippet `folder` and API request `collectionId` remain compatibility aliases.

## Share prompt templates
1. Call `prompt_templates_list({"query":"<topic>"})`.
2. Call `prompt_templates_get` for selected IDs.
3. On the target machine, recreate user-owned templates with `prompt_templates_create`.

## Debug connection issues
1. Verify devdrivr is open and MCP is enabled in Settings > MCP.
2. Confirm the MCP URL and port shown by `help({"topic":"clients"})`.
3. Export `DEVDRIVR_MCP_KEY` from the key shown in Settings > MCP.
4. Restart the MCP client after changing permissions or the key.
"#
    .to_string()
}

fn help_permissions(settings: &McpSettings) -> String {
    format!(
        r#"# devdrivr MCP Permissions

Default posture is read-only:
- `notes.read`
- `snippets.read`
- `promptTemplates.read`
- `apiRequests.read`

Current permissions:
```json
{permissions}
```

Write access:
1. Open devdrivr > Settings > MCP > Permissions.
2. Enable create, update, or delete for the resource type.
3. Apply settings or restart MCP.
4. Restart the MCP client if it caches tool context.

API request secrets:
- Auth secrets are redacted by default.
- Current `apiRequestsExposeSecrets`: `{expose_secrets}`.
- Redacted values use `{redacted}` and include `__devdrivrRedacted: true`.
- The MCP API key itself is never returned by help or introspection.
"#,
        permissions = serde_json::to_string_pretty(&settings.permissions)
            .unwrap_or_else(|_| "{}".to_string()),
        expose_secrets = settings.api_requests_expose_secrets,
        redacted = REDACTED_AUTH_VALUE
    )
}

fn help_errors() -> String {
    r#"# devdrivr MCP Error Reference

- `UNAUTHORIZED`: API key missing or incorrect. Copy the key from Settings > MCP and send `Authorization: Bearer $DEVDRIVR_MCP_KEY`.
- `PERMISSION_DENIED`: Current MCP permissions do not allow the action. Enable the permission in Settings > MCP > Permissions.
- `RESOURCE_NOT_FOUND`: The ID does not exist for that resource type. Use `search`, `multi_get`, or a list tool to find current IDs.
- `INVALID_ARGUMENT`: A parameter is invalid, such as an empty `types` array or invalid `limit`.
- `RESOURCE_LIMIT`: An argument is too large. Split the content or send fewer items per call.
- `CONFLICT`: The record changed since you read it. Read it again and retry against its `updatedAt`.
- `TIMEOUT`: The tool did not finish in time. Retry with a smaller `limit` or a narrower filter.
- `UNSUPPORTED_RESOURCE_TYPE`: Use one of `notes`, `snippets`, `promptTemplates`, or `apiRequests`.
- `BATCH_TOO_LARGE`: Split `multi_get` into batches of 100 IDs or fewer.
- `DATABASE_ERROR`: devdrivr could not read or write the local SQLite database. Restart devdrivr and check logs.
- `BUILTIN_TEMPLATE_DELETE_DENIED`: Built-in prompt templates cannot be deleted. Update one to create a user-owned copy.

Most MCP errors include structured `data.code` and `data.suggestions` so agents can explain the fix without guessing.
"#
    .to_string()
}

fn help_schema(settings: &McpSettings) -> String {
    format!(
        r#"# devdrivr MCP Schema and Limits

Use `introspect()` for complete resource fields, examples, permissions, and redaction metadata.

Primary resource types:
- `notes`: fields include `id`, `title`, `content`, `color`, `pinned`, `folderId`, `folderPath`, `tags`, optional `taskStatus`, `taskPriority`, `taskDueDate`, `createdAt`, `updatedAt`.
- `snippets`: fields include `id`, `title`, Markdown `description`, ordered `fragments`, legacy primary `content`/`language`, `folderId`, `folderPath`, legacy `folder`, `tags`, `createdAt`, `updatedAt`.
- `promptTemplates`: fields include `id`, `name`, `prompt`, `variables`, `author`, `tags`, `estimatedTokens`, `createdAt`, `updatedAt`.
- `apiRequests`: fields include `id`, `folderId`, `folderPath`, legacy `collectionId`, `name`, `method`, `url`, `headers`, `body`, `bodyMode`, `auth`.

Limits:
- Search and list default to `{default_results}` results and cap at `{max_results}`.
- List responses carry `total`, `limit` and `hasMore`. Raise `limit` when `hasMore` is true.
- `multi_get` accepts at most `{max_multi_get}` IDs.
- A request body is capped at 8 MiB. A single text field is capped at 1 MiB.
- A list field accepts at most `{max_items}` items. A tool call is cancelled after `{tool_timeout}`s.
- Update and delete accept `expectedUpdatedAt`. Send the `updatedAt` you read to be told about a
  concurrent edit instead of overwriting it.
- Supported port range in the UI: 1024-65535.
- Current endpoint: `{url}`.
- API request auth supports `none`, `bearer`, and `basic`.
- Prompt estimated tokens are approximately `ceil(chars / 4)`.
"#,
        default_results = DEFAULT_RESULT_LIMIT,
        max_results = MAX_RESULT_LIMIT,
        max_multi_get = MAX_MULTI_GET,
        max_items = MAX_ARRAY_ITEMS,
        tool_timeout = TOOL_TIMEOUT.as_secs(),
        url = mcp_url(settings)
    )
}

fn help_clients(settings: &McpSettings) -> String {
    format!(
        r#"# devdrivr MCP Client Setup

Set the API key from devdrivr Settings > MCP:
```bash
export DEVDRIVR_MCP_KEY="copy-from-devdrivr-settings"
```

Codex CLI:
```bash
codex mcp add devdrivr --url {url} --bearer-token-env-var DEVDRIVR_MCP_KEY
```

Claude Code:
```bash
claude mcp add --transport http devdrivr {url} --header "Authorization: Bearer $DEVDRIVR_MCP_KEY"
```

Verify connection:
```text
Ask your agent: "Use devdrivr MCP to search for notes about Rust."
```

Disconnect examples:
```bash
codex mcp remove devdrivr
claude mcp remove devdrivr
```

Do not paste the raw API key into prompts. Keep it in `DEVDRIVR_MCP_KEY` or your MCP client's secret storage.
"#,
        url = mcp_url(settings)
    )
}

#[tool_router(router = discovery_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "Get topic-based help for devdrivr MCP. Topics: overview, tools, workflows, permissions, errors, schema, clients."
    )]
    pub(super) async fn help(&self, Parameters(args): Parameters<HelpArgs>) -> McpResult {
        let topic = normalize_help_topic(args.topic.as_deref())?;
        let settings = self.settings.read().await.clone();
        let content = match topic {
            "overview" => help_overview(&settings),
            "tools" => help_tools_from_router(&self.tool_router),
            "workflows" => help_workflows(),
            "permissions" => help_permissions(&settings),
            "errors" => help_errors(),
            "schema" => help_schema(&settings),
            "clients" => help_clients(&settings),
            _ => return Err(unknown_help_topic(topic)),
        };
        help_response(topic, content)
    }

    #[tool(
        description = "Search notes, snippets, prompt templates, and saved API requests with type, tag, date, limit, and sort filters."
    )]
    pub(super) async fn search(&self, Parameters(args): Parameters<SearchArgs>) -> McpResult {
        let limit = normalize_limit(args.limit)?;
        let requested_types = args.types.clone();
        let resource_types = self.readable_resource_types(requested_types).await?;
        let required_tags = normalize_tags(args.tags.clone());
        let sort = args.sort.unwrap_or(SearchSort::Relevance);
        let mut candidates = Vec::new();

        for resource_type in resource_types {
            for value in self
                .fetch_resource_values(resource_type, args.query.as_deref())
                .await?
            {
                if let Some(candidate) = build_search_candidate(
                    resource_type,
                    value,
                    args.query.as_deref(),
                    &required_tags,
                    &args,
                ) {
                    candidates.push(candidate);
                }
            }
        }

        candidates.sort_by(|left, right| compare_search_candidates(left, right, sort));
        let total_matches = candidates.len();
        candidates.truncate(limit);
        let results = candidates
            .iter()
            .map(SearchCandidate::to_result)
            .collect::<Vec<_>>();
        to_json_text(json!({
            "results": results,
            "count": results.len(),
            "totalMatches": total_matches,
            "limit": limit,
        }))
    }

    #[tool(description = "Fetch multiple devdrivr resources by type and ID in one call.")]
    pub(super) async fn multi_get(&self, Parameters(args): Parameters<MultiGetArgs>) -> McpResult {
        if args.ids.is_empty() {
            return Err(invalid_argument(
                "ids",
                "ids must include at least one resource identifier",
                &[
                    "Pass one or more objects with type and id",
                    "Use search to discover resource IDs before calling multi_get",
                ],
            ));
        }
        if args.ids.len() > MAX_MULTI_GET {
            return Err(batch_too_large("ids", args.ids.len(), MAX_MULTI_GET));
        }

        let mut resources = Vec::with_capacity(args.ids.len());
        for resource_id in args.ids {
            let resource_type = ResourceType::from_key(resource_id.resource_type.trim())
                .ok_or_else(|| unsupported_resource_type(&resource_id.resource_type))?;
            if !self
                .resource_permission_allowed(resource_type, "read")
                .await
            {
                return Err(permission_denied(resource_type.key(), "read"));
            }
            match self
                .fetch_resource_value(resource_type, &resource_id.id)
                .await?
            {
                Some(resource) => resources.push(json!({
                    "type": resource_type.key(),
                    "id": resource_id.id,
                    "ok": true,
                    "resource": resource,
                })),
                None => resources.push(json!({
                    "type": resource_type.key(),
                    "id": resource_id.id,
                    "ok": false,
                    "error": error_data(
                        "RESOURCE_NOT_FOUND",
                        Some(resource_type.key()),
                        Some("read"),
                        Some(&resource_id.id),
                        None,
                        &[
                            "Check the resource ID and type",
                            "Use search or the matching list tool to find current resource IDs",
                        ],
                    ),
                })),
            }
        }

        to_json_text(json!({ "resources": resources }))
    }

    #[tool(
        description = "Get complete schema metadata for devdrivr MCP resources, tools, settings, and permissions."
    )]
    pub(super) async fn introspect(&self) -> McpResult {
        let settings = self.settings.read().await.clone();
        to_json_text(json!({
            "resources": {
                "notes": {
                    "description": "User notes with markdown-compatible content.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "color": "yellow|green|blue|pink|purple|orange|red|gray",
                        "pinned": "boolean",
                        "poppedOut": "boolean",
                        "windowBounds": "object|null",
                        "tags": "string[]",
                        "folderId": "string (defaults to notes-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "taskStatus": "todo|in_progress|done|blocked|null",
                        "taskPriority": "low|medium|high|null",
                        "taskDueDate": "string|null (local YYYY-MM-DD date)",
                        "outgoingLinks": "{kind,id}[] (live stable targets)",
                        "backlinks": "{id,title}[] (live source notes)",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["title", "content", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": [],
                    "updateRequired": ["id"],
                    "example": {
                        "title": "Architecture notes",
                        "content": "Decision notes...",
                        "tags": ["architecture"]
                    }
                },
                "snippets": {
                    "description": "Reusable code or text snippets with ordered fragments.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "language": "string",
                        "description": "string (Markdown)",
                        "fragments": "{id,name,content,language,sortOrder,createdAt,updatedAt}[]",
                        "folder": "string",
                        "folderId": "string (defaults to snippets-inbox; legacy folder is accepted)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "tags": "string[]",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["title", "description", "fragments.name", "fragments.content", "fragments.language", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": ["title"],
                    "updateRequired": ["id"],
                    "example": {
                        "title": "Fetch wrapper",
                        "description": "Fetch JSON with consistent error handling.",
                        "fragments": [{ "name": "client.ts", "content": "async function request() {}", "language": "typescript" }],
                        "tags": ["typescript"]
                    }
                },
                "promptTemplates": {
                    "description": "Built-in and user-owned prompt templates.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "description": "string",
                        "category": "code-review|refactoring|testing|docs|debugging|learning|productivity",
                        "tags": "string[]",
                        "prompt": "string",
                        "variables": "{ name, label, type: text|textarea|select, placeholder?, options?: string[], required? }[]",
                        "estimatedTokens": "number",
                        "optimizedFor": "Claude|ChatGPT|Cursor|Generic",
                        "author": "builtin|user",
                        "version": "string",
                        "tips": "string[]",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["name", "description", "category", "prompt", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": ["name", "prompt"],
                    "updateRequired": ["id"],
                    "deleteConstraint": "Only user-owned templates can be deleted.",
                    "example": {
                        "name": "Review PR",
                        "prompt": "Review this diff: {{diff}}",
                        "tags": ["code-review"]
                    }
                },
                "apiRequests": {
                    "description": "Saved API client requests. This MCP does not execute HTTP requests.",
                    "fields": {
                        "id": "string",
                        "collectionId": "string|null",
                        "folderId": "string (compatibility alias for collectionId; defaults to api-requests-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "name": "string",
                        "method": "string",
                        "url": "string",
                        "headers": "{ key, value, enabled }[] (a flat header map is converted on write)",
                        "body": "string",
                        "bodyMode": "string",
                        "auth": "{ type: none } | { type: bearer, token } | { type: basic, username, password }",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["name", "method", "url", "headers", "body"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": false,
                    "createRequired": ["name", "method", "url"],
                    "updateRequired": ["id"],
                    "redaction": {
                        "authSecretsRedactedByDefault": !settings.api_requests_expose_secrets,
                        "redactedValue": REDACTED_AUTH_VALUE,
                        "marker": "__devdrivrRedacted"
                    },
                    "example": {
                        "name": "Get user",
                        "method": "GET",
                        "url": "https://api.example.test/users/123"
                    }
                }
            },
            "supportingResources": {
                "apiCollections": {
                    "description": "API request collection compatibility records for assigning saved requests.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "parentId": "string|null",
                        "sortOrder": "number",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "tools": ["api_collections_list"]
                },
                "resourceFolders": {
                    "description": "Typed hierarchical folders for notes, snippets, and API requests, with durable Trash actions.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "parentId": "string|null",
                        "kind": "notes|snippets|apiRequests",
                        "sortOrder": "number",
                        "defaultLanguage": "string|null",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "tools": ["resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"]
                }
            },
            "tools": {
                "discovery": ["help", "search", "multi_get", "introspect", "counts"],
                "notes": ["notes_list", "notes_get", "notes_create", "notes_update", "notes_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
                "snippets": ["snippets_list", "snippets_get", "snippets_create", "snippets_update", "snippets_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
                "promptTemplates": ["prompt_templates_list", "prompt_templates_get", "prompt_templates_create", "prompt_templates_update", "prompt_templates_delete"],
                "apiRequests": ["api_requests_list", "api_requests_get", "api_requests_create", "api_requests_update", "api_requests_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
            },
            "permissions": {
                "notes": settings.permissions.notes,
                "snippets": settings.permissions.snippets,
                "promptTemplates": settings.permissions.prompt_templates,
                "apiRequests": settings.permissions.api_requests,
            },
            "settings": {
                "host": {
                    "type": "string",
                    "current": settings.host,
                    "constraint": "MVP binds to 127.0.0.1 only"
                },
                "port": {
                    "type": "number",
                    "current": settings.port,
                    "constraint": "1024-65535"
                },
                "apiKey": {
                    "type": "string",
                    "description": "Bearer token required in Authorization header. The key is never returned by introspect."
                },
                "enabled": settings.enabled,
                "apiRequestsExposeSecrets": settings.api_requests_expose_secrets
            }
        }))
    }

    #[tool(
        description = "Get aggregate counts for devdrivr MCP primary resources without fetching records."
    )]
    pub(super) async fn counts(&self, Parameters(args): Parameters<CountsArgs>) -> McpResult {
        let resource_types = self.readable_resource_types(args.types).await?;
        let mut counts = serde_json::Map::new();
        for resource_type in resource_types {
            counts.insert(
                resource_type.key().to_string(),
                Value::Number(self.count_resource(resource_type).await?.into()),
            );
        }
        to_json_text(Value::Object(counts))
    }
}

#[cfg(test)]
mod tests {
    use crate::mcp::types::McpPermissions;

    use super::*;

    fn search_args() -> SearchArgs {
        SearchArgs {
            query: None,
            types: None,
            tags: None,
            created_after: None,
            created_before: None,
            updated_after: None,
            updated_before: None,
            limit: None,
            sort: None,
        }
    }

    #[test]
    fn search_candidate_applies_query_tag_and_date_filters() {
        let mut args = search_args();
        args.query = Some("React".to_string());
        args.tags = Some(vec!["frontend".to_string(), "auth".to_string()]);
        args.updated_after = Some(900);
        let required_tags = normalize_tags(args.tags.clone());
        let value = json!({
            "id": "note-1",
            "title": "React authentication",
            "content": "Token handling notes",
            "tags": ["frontend", "auth", "react"],
            "createdAt": 500,
            "updatedAt": 1000
        });

        let candidate = build_search_candidate(
            ResourceType::Notes,
            value.clone(),
            args.query.as_deref(),
            &required_tags,
            &args,
        )
        .expect("candidate should match");

        assert_eq!(candidate.resource_type, ResourceType::Notes);
        assert!(candidate.score >= 80);

        args.updated_after = Some(1100);
        assert!(build_search_candidate(
            ResourceType::Notes,
            value,
            args.query.as_deref(),
            &required_tags,
            &args,
        )
        .is_none());
    }

    #[test]
    fn search_sort_orders_by_relevance_then_updated_date() {
        let mut lower = SearchCandidate {
            resource_type: ResourceType::Notes,
            value: json!({
                "id": "note-1",
                "title": "React",
                "content": "",
                "tags": [],
                "createdAt": 100,
                "updatedAt": 300
            }),
            score: 20,
            created_at: 100,
            updated_at: 300,
        };
        let higher = SearchCandidate {
            resource_type: ResourceType::Snippets,
            value: json!({
                "id": "snippet-1",
                "title": "React auth helper",
                "content": "",
                "tags": [],
                "createdAt": 50,
                "updatedAt": 200
            }),
            score: 80,
            created_at: 50,
            updated_at: 200,
        };

        assert_eq!(
            compare_search_candidates(&higher, &lower, SearchSort::Relevance),
            Ordering::Less
        );

        lower.score = 80;
        assert_eq!(
            compare_search_candidates(&lower, &higher, SearchSort::Relevance),
            Ordering::Less
        );
    }

    fn permissions(read: bool, create: bool, update: bool, delete: bool) -> ResourcePermissions {
        ResourcePermissions {
            read,
            create,
            update,
            delete,
        }
    }

    fn test_settings() -> McpSettings {
        McpSettings {
            enabled: true,
            host: "127.0.0.1".to_string(),
            port: 17347,
            api_key: "raw-test-api-key".to_string(),
            permissions: McpPermissions {
                notes: permissions(true, false, false, false),
                snippets: permissions(true, false, false, false),
                prompt_templates: permissions(true, false, false, false),
                api_requests: permissions(true, false, false, false),
            },
            api_requests_expose_secrets: false,
        }
    }

    #[test]
    fn help_topic_defaults_to_overview_and_rejects_unknown_topics() {
        assert_eq!(normalize_help_topic(None).unwrap(), "overview");
        assert_eq!(normalize_help_topic(Some(" Tools ")).unwrap(), "tools");

        let err = normalize_help_topic(Some("bookmarks")).expect_err("unknown topic should fail");
        let data = err.data.expect("error data");
        assert_eq!(data["code"], "INVALID_ARGUMENT");
        assert_eq!(data["argument"], "topic");
        assert!(data["suggestions"]
            .as_array()
            .is_some_and(|items| !items.is_empty()));
    }

    #[test]
    fn help_payload_includes_available_topics_and_content() {
        let payload = help_payload("overview", "content".to_string());

        assert_eq!(payload["topic"], "overview");
        assert_eq!(payload["content"], "content");
        assert_eq!(
            payload["availableTopics"].as_array().expect("topics").len(),
            HELP_TOPICS.len()
        );
    }

    #[test]
    fn help_tools_includes_registered_discovery_tools() {
        let content = help_tools_from_router(&DevdrivrMcpService::tool_router());

        assert!(content.contains("`help`"));
        assert!(content.contains("`search`"));
        assert!(content.contains("`multi_get`"));
        assert!(content.contains("`introspect`"));
        assert!(content.contains("`counts`"));
        assert!(content.contains("`resource_folders_list`"));
        assert!(content.contains("`resource_folders_move`"));
        assert!(content.contains("`resource_folders_trash`"));
        assert!(content.contains("`resource_folders_restore`"));
        assert!(content.contains("`resource_folders_permanent_delete`"));
        assert!(content.contains("`resource_folders_empty_trash`"));
    }

    #[test]
    fn help_clients_uses_env_var_without_revealing_api_key() {
        let settings = test_settings();
        let content = help_clients(&settings);

        assert!(content.contains("DEVDRIVR_MCP_KEY"));
        assert!(content.contains("http://127.0.0.1:17347/mcp"));
        assert!(!content.contains(&settings.api_key));
    }

    #[test]
    fn help_errors_lists_current_structured_error_codes() {
        let content = help_errors();

        for code in [
            "UNAUTHORIZED",
            "PERMISSION_DENIED",
            "RESOURCE_NOT_FOUND",
            "INVALID_ARGUMENT",
            "UNSUPPORTED_RESOURCE_TYPE",
            "BATCH_TOO_LARGE",
            "DATABASE_ERROR",
            "BUILTIN_TEMPLATE_DELETE_DENIED",
        ] {
            assert!(content.contains(code), "missing {code}");
        }
    }

    #[test]
    fn help_topics_all_return_non_empty_content() {
        let settings = test_settings();
        let tools = DevdrivrMcpService::tool_router();

        for topic in HELP_TOPICS {
            let content = match topic {
                "overview" => help_overview(&settings),
                "tools" => help_tools_from_router(&tools),
                "workflows" => help_workflows(),
                "permissions" => help_permissions(&settings),
                "errors" => help_errors(),
                "schema" => help_schema(&settings),
                "clients" => help_clients(&settings),
                _ => unreachable!(),
            };
            assert!(!content.trim().is_empty(), "{topic} should not be empty");
        }
    }
}
