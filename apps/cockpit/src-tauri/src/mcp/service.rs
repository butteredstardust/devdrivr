use std::{cmp::Ordering, sync::Arc};

use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::{McpDataChangedEvent, McpSettings, ResourcePermissions};

type SharedSettings = Arc<RwLock<McpSettings>>;
type McpResult = std::result::Result<CallToolResult, McpError>;
const REDACTED_AUTH_VALUE: &str = "***REDACTED***";
const DEFAULT_SEARCH_LIMIT: i64 = 50;
const MAX_SEARCH_LIMIT: i64 = 500;
const MAX_MULTI_GET: usize = 100;
const HELP_TOPICS: [&str; 7] = [
    "overview",
    "tools",
    "workflows",
    "permissions",
    "errors",
    "schema",
    "clients",
];

#[derive(Clone)]
pub struct CockpitMcpService {
    pool: SqlitePool,
    settings: SharedSettings,
    app: AppHandle,
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListArgs {
    query: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct IdArgs {
    id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
enum ResourceType {
    Notes,
    Snippets,
    PromptTemplates,
    ApiRequests,
}

impl ResourceType {
    const ALL: [ResourceType; 4] = [
        ResourceType::Notes,
        ResourceType::Snippets,
        ResourceType::PromptTemplates,
        ResourceType::ApiRequests,
    ];

    fn key(self) -> &'static str {
        match self {
            ResourceType::Notes => "notes",
            ResourceType::Snippets => "snippets",
            ResourceType::PromptTemplates => "promptTemplates",
            ResourceType::ApiRequests => "apiRequests",
        }
    }

    fn from_key(key: &str) -> Option<Self> {
        match key {
            "notes" => Some(ResourceType::Notes),
            "snippets" => Some(ResourceType::Snippets),
            "promptTemplates" => Some(ResourceType::PromptTemplates),
            "apiRequests" => Some(ResourceType::ApiRequests),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
enum SearchSort {
    Relevance,
    UpdatedDesc,
    UpdatedAsc,
    CreatedDesc,
    CreatedAsc,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchArgs {
    query: Option<String>,
    types: Option<Vec<String>>,
    tags: Option<Vec<String>>,
    created_after: Option<i64>,
    created_before: Option<i64>,
    updated_after: Option<i64>,
    updated_before: Option<i64>,
    limit: Option<i64>,
    sort: Option<SearchSort>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ResourceId {
    #[serde(rename = "type")]
    resource_type: String,
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct MultiGetArgs {
    ids: Vec<ResourceId>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CountsArgs {
    types: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct HelpArgs {
    topic: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct NoteCreateArgs {
    title: Option<String>,
    content: Option<String>,
    color: Option<String>,
    pinned: Option<bool>,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct NoteUpdateArgs {
    id: String,
    title: Option<String>,
    content: Option<String>,
    color: Option<String>,
    pinned: Option<bool>,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SnippetCreateArgs {
    title: String,
    content: String,
    language: Option<String>,
    tags: Option<Vec<String>>,
    folder: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SnippetUpdateArgs {
    id: String,
    title: Option<String>,
    content: Option<String>,
    language: Option<String>,
    tags: Option<Vec<String>>,
    folder: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct PromptTemplateCreateArgs {
    name: String,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    prompt: String,
    variables: Option<Value>,
    optimized_for: Option<String>,
    version: Option<String>,
    tips: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct PromptTemplateUpdateArgs {
    id: String,
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    prompt: Option<String>,
    variables: Option<Value>,
    optimized_for: Option<String>,
    version: Option<String>,
    tips: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ApiRequestCreateArgs {
    collection_id: Option<String>,
    name: String,
    method: String,
    url: String,
    headers: Option<Value>,
    body: Option<String>,
    body_mode: Option<String>,
    auth: Option<Value>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ApiRequestUpdateArgs {
    id: String,
    collection_id: Option<String>,
    name: Option<String>,
    method: Option<String>,
    url: Option<String>,
    headers: Option<Value>,
    body: Option<String>,
    body_mode: Option<String>,
    auth: Option<Value>,
}

#[derive(Debug, Serialize, FromRow)]
struct NoteRow {
    id: String,
    title: String,
    content: String,
    color: String,
    pinned: i64,
    popped_out: i64,
    window_x: Option<f64>,
    window_y: Option<f64>,
    window_width: Option<f64>,
    window_height: Option<f64>,
    created_at: i64,
    updated_at: i64,
    tags: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct SnippetRow {
    id: String,
    title: String,
    content: String,
    language: String,
    tags: String,
    folder: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct PromptTemplateRow {
    id: String,
    name: String,
    description: String,
    category: String,
    tags: String,
    prompt: String,
    variables_schema: String,
    estimated_tokens: i64,
    optimized_for: String,
    author: String,
    version: String,
    tips: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct ApiCollectionRow {
    id: String,
    name: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct ApiRequestRow {
    id: String,
    collection_id: Option<String>,
    name: String,
    method: String,
    url: String,
    headers: String,
    body: String,
    body_mode: String,
    auth: String,
    created_at: i64,
    updated_at: i64,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_json(value: &str, fallback: Value) -> Value {
    serde_json::from_str(value).unwrap_or(fallback)
}

fn to_json_text(value: Value) -> McpResult {
    serde_json::to_string_pretty(&value)
        .map(|text| CallToolResult::success(vec![Content::text(text)]))
        .map_err(|err| McpError::internal_error(err.to_string(), None))
}

fn error_data(
    code: &str,
    resource: Option<&str>,
    action: Option<&str>,
    id: Option<&str>,
    argument: Option<&str>,
    suggestions: &[&str],
) -> Value {
    let mut data = json!({
        "code": code,
        "suggestions": suggestions,
    });
    if let Value::Object(ref mut obj) = data {
        if let Some(resource) = resource {
            obj.insert("resource".to_string(), Value::String(resource.to_string()));
        }
        if let Some(action) = action {
            obj.insert("action".to_string(), Value::String(action.to_string()));
        }
        if let Some(id) = id {
            obj.insert("id".to_string(), Value::String(id.to_string()));
        }
        if let Some(argument) = argument {
            obj.insert("argument".to_string(), Value::String(argument.to_string()));
        }
    }
    data
}

fn db_error(err: sqlx::Error) -> McpError {
    McpError::internal_error(
        format!("Database error: {err}"),
        Some(error_data(
            "DATABASE_ERROR",
            None,
            None,
            None,
            None,
            &[
                "Verify cockpit can open its local database",
                "Restart the cockpit app and retry the MCP request",
            ],
        )),
    )
}

fn resource_display_name(resource: &str) -> &str {
    match resource {
        "notes" => "note",
        "snippets" => "snippet",
        "promptTemplates" => "prompt template",
        "apiRequests" => "API request",
        other => other,
    }
}

fn not_found(resource: &str, id: &str) -> McpError {
    McpError::resource_not_found(
        format!("{} not found", resource_display_name(resource)),
        Some(error_data(
            "RESOURCE_NOT_FOUND",
            Some(resource),
            Some("read"),
            Some(id),
            None,
            &[
                "Check the resource ID and type",
                "Use search or the matching list tool to find current resource IDs",
            ],
        )),
    )
}

fn permission_denied(resource: &str, action: &str) -> McpError {
    McpError::invalid_request(
        format!("Permission denied: {resource}.{action}"),
        Some(error_data(
            "PERMISSION_DENIED",
            Some(resource),
            Some(action),
            None,
            None,
            &[
                "Enable the matching permission in Settings > MCP > Permissions",
                "Restart or apply MCP settings after changing permissions",
                "Check that the agent is using the current Cockpit MCP API key",
            ],
        )),
    )
}

fn invalid_argument(argument: &str, message: impl Into<String>, suggestions: &[&str]) -> McpError {
    McpError::invalid_request(
        message.into(),
        Some(error_data(
            "INVALID_ARGUMENT",
            None,
            None,
            None,
            Some(argument),
            suggestions,
        )),
    )
}

fn batch_too_large(argument: &str, count: usize, max: usize) -> McpError {
    McpError::invalid_request(
        format!("{argument} contains {count} items; maximum is {max}"),
        Some(error_data(
            "BATCH_TOO_LARGE",
            None,
            None,
            None,
            Some(argument),
            &[
                "Split the request into smaller batches",
                "Use search filters to narrow the resource set before fetching details",
            ],
        )),
    )
}

fn builtin_template_delete_denied(id: &str) -> McpError {
    McpError::invalid_request(
        "Prompt template was not found or is built-in",
        Some(error_data(
            "BUILTIN_TEMPLATE_DELETE_DENIED",
            Some("promptTemplates"),
            Some("delete"),
            Some(id),
            None,
            &[
                "Only user-owned prompt templates can be deleted",
                "Use prompt_templates_update to create a user copy from a built-in template",
            ],
        )),
    )
}

fn unsupported_resource_type(resource_type: &str) -> McpError {
    McpError::invalid_request(
        format!("Unsupported resource type: {resource_type}"),
        Some(error_data(
            "UNSUPPORTED_RESOURCE_TYPE",
            Some(resource_type),
            None,
            None,
            Some("type"),
            &[
                "Use one of: notes, snippets, promptTemplates, apiRequests",
                "Call introspect to discover supported MCP resource types",
            ],
        )),
    )
}

fn unknown_help_topic(topic: &str) -> McpError {
    invalid_argument(
        "topic",
        format!("Unknown help topic: {topic}"),
        &[
            "Use one of: overview, tools, workflows, permissions, errors, schema, clients",
            "Omit topic to get the overview help",
        ],
    )
}

fn estimated_tokens(prompt: &str) -> i64 {
    std::cmp::max(1, (prompt.chars().count() as i64 + 3) / 4)
}

fn value_to_db_json(value: Option<Value>, fallback: Value) -> String {
    serde_json::to_string(&value.unwrap_or(fallback)).unwrap_or_else(|_| "[]".to_string())
}

fn string_vec_to_db_json(value: Option<Vec<String>>) -> String {
    serde_json::to_string(&value.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string())
}

fn note_to_json(row: NoteRow) -> Value {
    json!({
        "id": row.id,
        "title": row.title,
        "content": row.content,
        "color": row.color,
        "pinned": row.pinned == 1,
        "poppedOut": row.popped_out == 1,
        "windowBounds": match (row.window_x, row.window_y, row.window_width, row.window_height) {
            (Some(x), Some(y), Some(width), Some(height)) => json!({ "x": x, "y": y, "width": width, "height": height }),
            _ => Value::Null,
        },
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
        "tags": parse_json(row.tags.as_deref().unwrap_or("[]"), json!([])),
    })
}

fn snippet_to_json(row: SnippetRow) -> Value {
    json!({
        "id": row.id,
        "title": row.title,
        "content": row.content,
        "language": row.language,
        "tags": parse_json(&row.tags, json!([])),
        "folder": row.folder,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn prompt_to_json(row: PromptTemplateRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "category": row.category,
        "tags": parse_json(&row.tags, json!([])),
        "prompt": row.prompt,
        "variables": parse_json(&row.variables_schema, json!([])),
        "estimatedTokens": row.estimated_tokens,
        "optimizedFor": row.optimized_for,
        "author": row.author,
        "version": row.version,
        "tips": parse_json(&row.tips, json!([])),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn api_collection_to_json(row: ApiCollectionRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn redacted_auth(auth: Value, expose: bool) -> Value {
    if expose {
        return auth;
    }
    match auth {
        Value::Object(mut obj) => {
            match obj.get("type").and_then(Value::as_str) {
                Some("bearer") => {
                    obj.insert("__cockpitRedacted".to_string(), Value::Bool(true));
                    obj.insert(
                        "token".to_string(),
                        Value::String(REDACTED_AUTH_VALUE.to_string()),
                    );
                }
                Some("basic") => {
                    obj.insert("__cockpitRedacted".to_string(), Value::Bool(true));
                    obj.insert(
                        "password".to_string(),
                        Value::String(REDACTED_AUTH_VALUE.to_string()),
                    );
                }
                _ => {}
            }
            Value::Object(obj)
        }
        other => other,
    }
}

fn strip_redaction_marker(auth: Value) -> Value {
    match auth {
        Value::Object(mut obj) => {
            obj.remove("__cockpitRedacted");
            Value::Object(obj)
        }
        other => other,
    }
}

fn resolve_auth_update(incoming: Value, current_auth: &str) -> String {
    let mut incoming_obj = match incoming {
        Value::Object(obj) => obj,
        other => return serde_json::to_string(&other).unwrap_or_else(|_| current_auth.to_string()),
    };

    let redacted = incoming_obj
        .remove("__cockpitRedacted")
        .and_then(|value| value.as_bool())
        == Some(true);

    if redacted {
        if let Ok(Value::Object(current_obj)) = serde_json::from_str::<Value>(current_auth) {
            match incoming_obj.get("type").and_then(Value::as_str) {
                Some("bearer")
                    if incoming_obj
                        .get("token")
                        .and_then(Value::as_str)
                        .is_some_and(|value| value == REDACTED_AUTH_VALUE) =>
                {
                    if let Some(token) = current_obj.get("token") {
                        incoming_obj.insert("token".to_string(), token.clone());
                    }
                }
                Some("basic")
                    if incoming_obj
                        .get("password")
                        .and_then(Value::as_str)
                        .is_some_and(|value| value == REDACTED_AUTH_VALUE) =>
                {
                    if let Some(password) = current_obj.get("password") {
                        incoming_obj.insert("password".to_string(), password.clone());
                    }
                }
                _ => {}
            }
        }
    }

    serde_json::to_string(&Value::Object(incoming_obj)).unwrap_or_else(|_| current_auth.to_string())
}

fn api_request_to_json(row: ApiRequestRow, expose_auth: bool) -> Value {
    json!({
        "id": row.id,
        "collectionId": row.collection_id,
        "name": row.name,
        "method": row.method,
        "url": row.url,
        "headers": parse_json(&row.headers, json!([])),
        "body": row.body,
        "bodyMode": row.body_mode,
        "auth": redacted_auth(parse_json(&row.auth, json!({ "type": "none" })), expose_auth),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

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

fn normalize_tags(tags: Option<Vec<String>>) -> Vec<String> {
    tags.unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().to_lowercase())
        .filter(|tag| !tag.is_empty())
        .collect()
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
            "{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("language")
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

fn normalize_search_limit(limit: Option<i64>) -> std::result::Result<usize, McpError> {
    let limit = limit.unwrap_or(DEFAULT_SEARCH_LIMIT);
    if limit <= 0 {
        return Err(invalid_argument(
            "limit",
            "limit must be greater than zero",
            &[
                "Use a positive limit value",
                "Omit limit to use the default of 50 results",
            ],
        ));
    }
    Ok(limit.min(MAX_SEARCH_LIMIT) as usize)
}

fn unique_resource_types(types: Vec<ResourceType>) -> Vec<ResourceType> {
    let mut unique = Vec::new();
    for resource_type in types {
        if !unique.contains(&resource_type) {
            unique.push(resource_type);
        }
    }
    unique
}

fn parse_resource_types(types: Vec<String>) -> std::result::Result<Vec<ResourceType>, McpError> {
    types
        .into_iter()
        .map(|resource_type| {
            ResourceType::from_key(resource_type.trim())
                .ok_or_else(|| unsupported_resource_type(&resource_type))
        })
        .collect::<std::result::Result<Vec<_>, _>>()
        .map(unique_resource_types)
}

fn available_help_topics() -> Vec<&'static str> {
    HELP_TOPICS.to_vec()
}

fn normalize_help_topic(topic: Option<&str>) -> std::result::Result<&'static str, McpError> {
    let topic = topic
        .map(str::trim)
        .filter(|topic| !topic.is_empty())
        .unwrap_or("overview")
        .to_ascii_lowercase();
    HELP_TOPICS
        .iter()
        .copied()
        .find(|known_topic| *known_topic == topic)
        .ok_or_else(|| unknown_help_topic(&topic))
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
        r#"# Cockpit MCP Overview

Cockpit MCP lets CLI agents read and manage local devdrivr cockpit notes, snippets, prompt templates, and saved API client requests.

Server:
- URL: `{url}`
- Enabled in settings: `{enabled}`
- Authentication: `Authorization: Bearer $COCKPIT_MCP_KEY`

Primary resources:
- `notes`: markdown-compatible notes with tags and pinned state.
- `snippets`: reusable code or text snippets with language, folder, and tags.
- `promptTemplates`: built-in and user prompt templates with variables and tips.
- `apiRequests`: saved API client requests. Requests are not executed by MCP.

Quick start:
- Search everything: `search({{"query":"react","limit":10}})`
- Search tagged snippets: `search({{"types":["snippets"],"tags":["react","hooks"]}})`
- Inspect schemas: `introspect()`
- Count resources: `counts()`
- Fetch selected records: `multi_get({{"ids":[{{"type":"notes","id":"..."}}]}})`

Use `help({{"topic":"tools"}})` for the tool reference and `help({{"topic":"clients"}})` for CLI setup examples.
"#,
        url = mcp_url(settings),
        enabled = settings.enabled
    )
}

fn permission_for_tool(name: &str) -> &'static str {
    let resource = if name.starts_with("notes_") {
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
        "search" => "Use `types` and `tags` to reduce result volume; `limit` is capped at 500.",
        "multi_get" => "Maximum 100 IDs per call; missing IDs are returned per item instead of failing the whole call.",
        "introspect" => "Use this for machine-readable schemas; use `help` for workflow guidance.",
        "counts" => "Counts only returns resources allowed by current read permissions unless a denied type is explicitly requested.",
        "help" => "The API key is never returned; copy it from Settings > MCP.",
        "prompt_templates_delete" => "Built-in templates cannot be deleted. Update a built-in to create a user-owned copy.",
        "api_requests_list" | "api_requests_get" => {
            "Auth secrets are redacted unless API request secret exposure is enabled in MCP settings."
        }
        "api_requests_create" | "api_requests_update" => {
            "This saves the request definition only; it does not execute the HTTP request."
        }
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

fn help_tools_from_router(tool_router: &ToolRouter<CockpitMcpService>) -> String {
    let mut content = String::from(
        "# Cockpit MCP Tool Reference\n\nUse `introspect()` for full machine-readable resource schemas. The list below is generated from the active MCP tool router.\n\n",
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
    r#"# Cockpit MCP Workflows

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

## Share prompt templates
1. Call `prompt_templates_list({"query":"<topic>"})`.
2. Call `prompt_templates_get` for selected IDs.
3. On the target machine, recreate user-owned templates with `prompt_templates_create`.

## Debug connection issues
1. Verify Cockpit is open and MCP is enabled in Settings > MCP.
2. Confirm the MCP URL and port shown by `help({"topic":"clients"})`.
3. Export `COCKPIT_MCP_KEY` from the key shown in Settings > MCP.
4. Restart the MCP client after changing permissions or the key.
"#
    .to_string()
}

fn help_permissions(settings: &McpSettings) -> String {
    format!(
        r#"# Cockpit MCP Permissions

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
1. Open Cockpit > Settings > MCP > Permissions.
2. Enable create, update, or delete for the resource type.
3. Apply settings or restart MCP.
4. Restart the MCP client if it caches tool context.

API request secrets:
- Auth secrets are redacted by default.
- Current `apiRequestsExposeSecrets`: `{expose_secrets}`.
- Redacted values use `{redacted}` and include `__cockpitRedacted: true`.
- The MCP API key itself is never returned by help or introspection.
"#,
        permissions = serde_json::to_string_pretty(&settings.permissions)
            .unwrap_or_else(|_| "{}".to_string()),
        expose_secrets = settings.api_requests_expose_secrets,
        redacted = REDACTED_AUTH_VALUE
    )
}

fn help_errors() -> String {
    r#"# Cockpit MCP Error Reference

- `UNAUTHORIZED`: API key missing or incorrect. Copy the key from Settings > MCP and send `Authorization: Bearer $COCKPIT_MCP_KEY`.
- `PERMISSION_DENIED`: Current MCP permissions do not allow the action. Enable the permission in Settings > MCP > Permissions.
- `RESOURCE_NOT_FOUND`: The ID does not exist for that resource type. Use `search`, `multi_get`, or a list tool to find current IDs.
- `INVALID_ARGUMENT`: A parameter is invalid, such as an empty `types` array or invalid `limit`.
- `UNSUPPORTED_RESOURCE_TYPE`: Use one of `notes`, `snippets`, `promptTemplates`, or `apiRequests`.
- `BATCH_TOO_LARGE`: Split `multi_get` into batches of 100 IDs or fewer.
- `DATABASE_ERROR`: Cockpit could not read or write the local SQLite database. Restart Cockpit and check logs.
- `BUILTIN_TEMPLATE_DELETE_DENIED`: Built-in prompt templates cannot be deleted. Update one to create a user-owned copy.

Most MCP errors include structured `data.code` and `data.suggestions` so agents can explain the fix without guessing.
"#
    .to_string()
}

fn help_schema(settings: &McpSettings) -> String {
    format!(
        r#"# Cockpit MCP Schema and Limits

Use `introspect()` for complete resource fields, examples, permissions, and redaction metadata.

Primary resource types:
- `notes`: fields include `id`, `title`, `content`, `color`, `pinned`, `tags`, `createdAt`, `updatedAt`.
- `snippets`: fields include `id`, `title`, `content`, `language`, `folder`, `tags`, `createdAt`, `updatedAt`.
- `promptTemplates`: fields include `id`, `name`, `prompt`, `variables`, `author`, `tags`, `estimatedTokens`, `createdAt`, `updatedAt`.
- `apiRequests`: fields include `id`, `collectionId`, `name`, `method`, `url`, `headers`, `body`, `bodyMode`, `auth`.

Limits:
- Search/list limit is capped at `{max_results}`.
- `multi_get` accepts at most `{max_multi_get}` IDs.
- Supported port range in the UI: 1024-65535.
- Current endpoint: `{url}`.
- API request auth supports `none`, `bearer`, and `basic`.
- Prompt estimated tokens are approximately `ceil(chars / 4)`.
"#,
        max_results = MAX_SEARCH_LIMIT,
        max_multi_get = MAX_MULTI_GET,
        url = mcp_url(settings)
    )
}

fn help_clients(settings: &McpSettings) -> String {
    format!(
        r#"# Cockpit MCP Client Setup

Set the API key from Cockpit Settings > MCP:
```bash
export COCKPIT_MCP_KEY="copy-from-cockpit-settings"
```

Codex CLI:
```bash
codex mcp add cockpit --url {url} --bearer-token-env-var COCKPIT_MCP_KEY
```

Claude Code:
```bash
claude mcp add --transport http cockpit {url} --header "Authorization: Bearer $COCKPIT_MCP_KEY"
```

Verify connection:
```text
Ask your agent: "Use Cockpit MCP to search for notes about Rust."
```

Disconnect examples:
```bash
codex mcp remove cockpit
claude mcp remove cockpit
```

Do not paste the raw API key into prompts. Keep it in `COCKPIT_MCP_KEY` or your MCP client's secret storage.
"#,
        url = mcp_url(settings)
    )
}

fn matches_query(value: &Value, query: &Option<String>) -> bool {
    let Some(query) = query
        .as_ref()
        .map(|q| q.trim().to_lowercase())
        .filter(|q| !q.is_empty())
    else {
        return true;
    };
    value.to_string().to_lowercase().contains(&query)
}

fn apply_limit(mut values: Vec<Value>, limit: Option<i64>) -> Vec<Value> {
    if let Some(limit) = limit {
        values.truncate(limit.clamp(1, 500) as usize);
    }
    values
}

#[tool_router]
impl CockpitMcpService {
    pub fn new(pool: SqlitePool, settings: SharedSettings, app: AppHandle) -> Self {
        Self {
            pool,
            settings,
            app,
            tool_router: Self::tool_router(),
        }
    }

    async fn permissions_for(&self, resource: &str) -> ResourcePermissions {
        let settings = self.settings.read().await;
        match resource {
            "notes" => settings.permissions.notes.clone(),
            "snippets" => settings.permissions.snippets.clone(),
            "promptTemplates" => settings.permissions.prompt_templates.clone(),
            "apiRequests" => settings.permissions.api_requests.clone(),
            _ => ResourcePermissions {
                read: false,
                create: false,
                update: false,
                delete: false,
            },
        }
    }

    async fn resource_permission_allowed(&self, resource_type: ResourceType, action: &str) -> bool {
        let permissions = self.permissions_for(resource_type.key()).await;
        match action {
            "read" => permissions.read,
            "create" => permissions.create,
            "update" => permissions.update,
            "delete" => permissions.delete,
            _ => false,
        }
    }

    async fn readable_resource_types(
        &self,
        requested: Option<Vec<String>>,
    ) -> std::result::Result<Vec<ResourceType>, McpError> {
        let explicit = requested.is_some();
        let resource_types = match requested {
            Some(types) => {
                if types.is_empty() {
                    return Err(invalid_argument(
                        "types",
                        "types must include at least one resource type",
                        &[
                            "Use one or more of: notes, snippets, promptTemplates, apiRequests",
                            "Omit types to include all readable resource types",
                        ],
                    ));
                }
                parse_resource_types(types)?
            }
            None => ResourceType::ALL.to_vec(),
        };

        let mut readable = Vec::new();
        for resource_type in resource_types {
            if self
                .resource_permission_allowed(resource_type, "read")
                .await
            {
                readable.push(resource_type);
            } else if explicit {
                return Err(permission_denied(resource_type.key(), "read"));
            }
        }
        Ok(readable)
    }

    async fn ensure_permission(
        &self,
        resource: &str,
        action: &str,
    ) -> std::result::Result<(), McpError> {
        let permissions = self.permissions_for(resource).await;
        let allowed = match action {
            "read" => permissions.read,
            "create" => permissions.create,
            "update" => permissions.update,
            "delete" => permissions.delete,
            _ => false,
        };
        if allowed {
            Ok(())
        } else {
            Err(permission_denied(resource, action))
        }
    }

    async fn fetch_resource_value(
        &self,
        resource_type: ResourceType,
        id: &str,
    ) -> std::result::Result<Option<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&self.pool)
                    .await
                    .map(|row| row.map(note_to_json))
                    .map_err(db_error)
            }
            ResourceType::Snippets => {
                sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&self.pool)
                    .await
                    .map(|row| row.map(snippet_to_json))
                    .map_err(db_error)
            }
            ResourceType::PromptTemplates => sqlx::query_as::<_, PromptTemplateRow>(
                "SELECT * FROM user_prompt_templates WHERE id = $1",
            )
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(prompt_to_json))
            .map_err(db_error),
            ResourceType::ApiRequests => {
                let expose_auth = self.settings.read().await.api_requests_expose_secrets;
                sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&self.pool)
                    .await
                    .map(|row| row.map(|row| api_request_to_json(row, expose_auth)))
                    .map_err(db_error)
            }
        }
    }

    async fn fetch_resource_values(
        &self,
        resource_type: ResourceType,
    ) -> std::result::Result<Vec<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => sqlx::query_as::<_, NoteRow>(
                "SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC",
            )
            .fetch_all(&self.pool)
            .await
            .map(|rows| rows.into_iter().map(note_to_json).collect())
            .map_err(db_error),
            ResourceType::Snippets => {
                sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets ORDER BY updated_at DESC")
                    .fetch_all(&self.pool)
                    .await
                    .map(|rows| rows.into_iter().map(snippet_to_json).collect())
                    .map_err(db_error)
            }
            ResourceType::PromptTemplates => sqlx::query_as::<_, PromptTemplateRow>(
                "SELECT * FROM user_prompt_templates ORDER BY author ASC, updated_at DESC",
            )
            .fetch_all(&self.pool)
            .await
            .map(|rows| rows.into_iter().map(prompt_to_json).collect())
            .map_err(db_error),
            ResourceType::ApiRequests => {
                let expose_auth = self.settings.read().await.api_requests_expose_secrets;
                sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests ORDER BY name ASC")
                    .fetch_all(&self.pool)
                    .await
                    .map(|rows| {
                        rows.into_iter()
                            .map(|row| api_request_to_json(row, expose_auth))
                            .collect()
                    })
                    .map_err(db_error)
            }
        }
    }

    async fn count_resource(
        &self,
        resource_type: ResourceType,
    ) -> std::result::Result<i64, McpError> {
        let query = match resource_type {
            ResourceType::Notes => "SELECT COUNT(*) FROM notes",
            ResourceType::Snippets => "SELECT COUNT(*) FROM snippets",
            ResourceType::PromptTemplates => "SELECT COUNT(*) FROM user_prompt_templates",
            ResourceType::ApiRequests => "SELECT COUNT(*) FROM api_requests",
        };
        sqlx::query_scalar::<_, i64>(query)
            .fetch_one(&self.pool)
            .await
            .map_err(db_error)
    }

    fn emit_changed(&self, resource: &str, action: &str, id: Option<String>) {
        let _ = self.app.emit(
            "mcp:data-changed",
            McpDataChangedEvent {
                resource: resource.to_string(),
                action: action.to_string(),
                id,
            },
        );
    }

    #[tool(
        description = "Get topic-based help for Cockpit MCP. Topics: overview, tools, workflows, permissions, errors, schema, clients."
    )]
    async fn help(&self, Parameters(args): Parameters<HelpArgs>) -> McpResult {
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
    async fn search(&self, Parameters(args): Parameters<SearchArgs>) -> McpResult {
        let limit = normalize_search_limit(args.limit)?;
        let requested_types = args.types.clone();
        let resource_types = self.readable_resource_types(requested_types).await?;
        let required_tags = normalize_tags(args.tags.clone());
        let sort = args.sort.unwrap_or(SearchSort::Relevance);
        let mut candidates = Vec::new();

        for resource_type in resource_types {
            for value in self.fetch_resource_values(resource_type).await? {
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

    #[tool(description = "Fetch multiple cockpit resources by type and ID in one call.")]
    async fn multi_get(&self, Parameters(args): Parameters<MultiGetArgs>) -> McpResult {
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
        description = "Get complete schema metadata for Cockpit MCP resources, tools, settings, and permissions."
    )]
    async fn introspect(&self) -> McpResult {
        let settings = self.settings.read().await.clone();
        to_json_text(json!({
            "resources": {
                "notes": {
                    "description": "User notes with markdown-compatible content.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "color": "string",
                        "pinned": "boolean",
                        "poppedOut": "boolean",
                        "windowBounds": "object|null",
                        "tags": "string[]",
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
                    "description": "Reusable code or text snippets.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "language": "string",
                        "folder": "string",
                        "tags": "string[]",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["title", "content", "language", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": ["title", "content"],
                    "updateRequired": ["id"],
                    "example": {
                        "title": "Fetch wrapper",
                        "content": "async function request() {}",
                        "language": "typescript",
                        "tags": ["typescript"]
                    }
                },
                "promptTemplates": {
                    "description": "Built-in and user-owned prompt templates.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "description": "string",
                        "category": "string",
                        "tags": "string[]",
                        "prompt": "string",
                        "variables": "array|object",
                        "estimatedTokens": "number",
                        "optimizedFor": "string",
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
                        "name": "string",
                        "method": "string",
                        "url": "string",
                        "headers": "array|object",
                        "body": "string",
                        "bodyMode": "string",
                        "auth": "object",
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
                        "marker": "__cockpitRedacted"
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
                    "description": "Read-only API request collections for assigning saved requests.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "tools": ["api_collections_list"]
                }
            },
            "tools": {
                "discovery": ["help", "search", "multi_get", "introspect", "counts"],
                "notes": ["notes_list", "notes_get", "notes_create", "notes_update", "notes_delete"],
                "snippets": ["snippets_list", "snippets_get", "snippets_create", "snippets_update", "snippets_delete"],
                "promptTemplates": ["prompt_templates_list", "prompt_templates_get", "prompt_templates_create", "prompt_templates_update", "prompt_templates_delete"],
                "apiRequests": ["api_requests_list", "api_requests_get", "api_requests_create", "api_requests_update", "api_requests_delete"],
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
        description = "Get aggregate counts for Cockpit MCP primary resources without fetching records."
    )]
    async fn counts(&self, Parameters(args): Parameters<CountsArgs>) -> McpResult {
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

    #[tool(description = "List cockpit notes. Returns compact JSON note records.")]
    async fn notes_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let rows = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .map(note_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "notes": values }))
    }

    #[tool(description = "Get one cockpit note by ID.")]
    async fn notes_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let row = sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("notes", &args.id))?;
        to_json_text(note_to_json(row))
    }

    #[tool(description = "Create a cockpit note.")]
    async fn notes_create(&self, Parameters(args): Parameters<NoteCreateArgs>) -> McpResult {
        self.ensure_permission("notes", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let title = args.title.unwrap_or_default();
        let content = args.content.unwrap_or_default();
        let color = args.color.unwrap_or_else(|| "yellow".to_string());
        let pinned = args.pinned.unwrap_or(false);
        let tags = string_vec_to_db_json(args.tags);
        sqlx::query(
            "INSERT INTO notes (id, title, content, color, pinned, popped_out, created_at, updated_at, tags) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)",
        )
        .bind(&id)
        .bind(title)
        .bind(content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(now)
        .bind(now)
        .bind(tags)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("notes", "create", Some(id.clone()));
        self.notes_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a cockpit note by ID.")]
    async fn notes_update(&self, Parameters(args): Parameters<NoteUpdateArgs>) -> McpResult {
        self.ensure_permission("notes", "update").await?;
        let current = sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("notes", &args.id))?;
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| current.tags.unwrap_or_else(|| "[]".to_string()));
        sqlx::query(
            "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, updated_at=$7 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.title.unwrap_or(current.title))
        .bind(args.content.unwrap_or(current.content))
        .bind(args.color.unwrap_or(current.color))
        .bind(if args.pinned.unwrap_or(current.pinned == 1) { 1 } else { 0 })
        .bind(tags)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("notes", "update", Some(args.id.clone()));
        self.notes_get(Parameters(IdArgs { id: args.id })).await
    }

    #[tool(description = "Delete a cockpit note by ID.")]
    async fn notes_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "delete").await?;
        let result = sqlx::query("DELETE FROM notes WHERE id = $1")
            .bind(&args.id)
            .execute(&self.pool)
            .await
            .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("notes", &args.id));
        }
        self.emit_changed("notes", "delete", Some(args.id));
        to_json_text(json!({ "deleted": true }))
    }

    #[tool(description = "List cockpit snippets. Returns JSON snippet records.")]
    async fn snippets_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let rows =
            sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets ORDER BY updated_at DESC")
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .map(snippet_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "snippets": values }))
    }

    #[tool(description = "Get one cockpit snippet by ID.")]
    async fn snippets_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let row = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("snippets", &args.id))?;
        to_json_text(snippet_to_json(row))
    }

    #[tool(description = "Create a cockpit snippet.")]
    async fn snippets_create(&self, Parameters(args): Parameters<SnippetCreateArgs>) -> McpResult {
        self.ensure_permission("snippets", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        sqlx::query(
            "INSERT INTO snippets (id, title, content, language, tags, folder, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(&id)
        .bind(args.title)
        .bind(args.content)
        .bind(args.language.unwrap_or_default())
        .bind(string_vec_to_db_json(args.tags))
        .bind(args.folder.unwrap_or_default())
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("snippets", "create", Some(id.clone()));
        self.snippets_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a cockpit snippet by ID.")]
    async fn snippets_update(&self, Parameters(args): Parameters<SnippetUpdateArgs>) -> McpResult {
        self.ensure_permission("snippets", "update").await?;
        let current = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("snippets", &args.id))?;
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.tags);
        sqlx::query(
            "UPDATE snippets SET title=$2, content=$3, language=$4, tags=$5, folder=$6, updated_at=$7 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.title.unwrap_or(current.title))
        .bind(args.content.unwrap_or(current.content))
        .bind(args.language.unwrap_or(current.language))
        .bind(tags)
        .bind(args.folder.unwrap_or(current.folder))
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("snippets", "update", Some(args.id.clone()));
        self.snippets_get(Parameters(IdArgs { id: args.id })).await
    }

    #[tool(description = "Delete a cockpit snippet by ID.")]
    async fn snippets_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "delete").await?;
        let result = sqlx::query("DELETE FROM snippets WHERE id = $1")
            .bind(&args.id)
            .execute(&self.pool)
            .await
            .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("snippets", &args.id));
        }
        self.emit_changed("snippets", "delete", Some(args.id));
        to_json_text(json!({ "deleted": true }))
    }

    #[tool(description = "List cockpit prompt templates, including persisted built-ins.")]
    async fn prompt_templates_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("promptTemplates", "read").await?;
        let rows = sqlx::query_as::<_, PromptTemplateRow>(
            "SELECT * FROM user_prompt_templates ORDER BY author ASC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .map(prompt_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "promptTemplates": values }))
    }

    #[tool(description = "Get one cockpit prompt template by ID.")]
    async fn prompt_templates_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("promptTemplates", "read").await?;
        let row = sqlx::query_as::<_, PromptTemplateRow>(
            "SELECT * FROM user_prompt_templates WHERE id = $1",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("promptTemplates", &args.id))?;
        to_json_text(prompt_to_json(row))
    }

    #[tool(description = "Create a user-owned cockpit prompt template.")]
    async fn prompt_templates_create(
        &self,
        Parameters(args): Parameters<PromptTemplateCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        sqlx::query(
            "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', $10, $11, $12, $13)",
        )
        .bind(&id)
        .bind(args.name)
        .bind(args.description.unwrap_or_default())
        .bind(args.category.unwrap_or_else(|| "productivity".to_string()))
        .bind(string_vec_to_db_json(args.tags))
        .bind(&args.prompt)
        .bind(value_to_db_json(args.variables, json!([])))
        .bind(estimated_tokens(&args.prompt))
        .bind(args.optimized_for.unwrap_or_else(|| "Generic".to_string()))
        .bind(args.version.unwrap_or_else(|| "1.0.0".to_string()))
        .bind(string_vec_to_db_json(args.tips))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("promptTemplates", "create", Some(id.clone()));
        self.prompt_templates_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a user prompt template. Updating a built-in creates a user copy.")]
    async fn prompt_templates_update(
        &self,
        Parameters(args): Parameters<PromptTemplateUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "update").await?;
        let current = sqlx::query_as::<_, PromptTemplateRow>(
            "SELECT * FROM user_prompt_templates WHERE id = $1",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("promptTemplates", &args.id))?;
        let target_id = if current.author == "builtin" {
            Uuid::new_v4().to_string()
        } else {
            current.id.clone()
        };
        let now = now_ms();
        let prompt = args.prompt.unwrap_or(current.prompt);
        let variables = args
            .variables
            .map(|value| serde_json::to_string(&value).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.variables_schema);
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.tags);
        let tips = args
            .tips
            .map(|tips| serde_json::to_string(&tips).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.tips);
        sqlx::query(
            "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', $10, $11, $12, $13) ON CONFLICT(id) DO UPDATE SET name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7, estimated_tokens=$8, optimized_for=$9, author='user', version=$10, tips=$11, updated_at=$13",
        )
        .bind(&target_id)
        .bind(args.name.unwrap_or(current.name))
        .bind(args.description.unwrap_or(current.description))
        .bind(args.category.unwrap_or(current.category))
        .bind(tags)
        .bind(&prompt)
        .bind(variables)
        .bind(estimated_tokens(&prompt))
        .bind(args.optimized_for.unwrap_or(current.optimized_for))
        .bind(args.version.unwrap_or(current.version))
        .bind(tips)
        .bind(if current.author == "builtin" { now } else { current.created_at })
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("promptTemplates", "update", Some(target_id.clone()));
        self.prompt_templates_get(Parameters(IdArgs { id: target_id }))
            .await
    }

    #[tool(description = "Delete a user-owned cockpit prompt template by ID.")]
    async fn prompt_templates_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("promptTemplates", "delete").await?;
        let result =
            sqlx::query("DELETE FROM user_prompt_templates WHERE id = $1 AND author = 'user'")
                .bind(&args.id)
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(builtin_template_delete_denied(&args.id));
        }
        self.emit_changed("promptTemplates", "delete", Some(args.id));
        to_json_text(json!({ "deleted": true }))
    }

    #[tool(description = "List API client collections for assigning saved requests.")]
    async fn api_collections_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let rows = sqlx::query_as::<_, ApiCollectionRow>(
            "SELECT * FROM api_collections ORDER BY name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .map(api_collection_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "apiCollections": values }))
    }

    #[tool(
        description = "List saved API client requests. Auth secrets are redacted unless allowed."
    )]
    async fn api_requests_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let rows =
            sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests ORDER BY name ASC")
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .map(|row| api_request_to_json(row, expose_auth))
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "apiRequests": values }))
    }

    #[tool(description = "Get one saved API client request by ID.")]
    async fn api_requests_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let row = sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("apiRequests", &args.id))?;
        to_json_text(api_request_to_json(row, expose_auth))
    }

    #[tool(description = "Create a saved API client request. This does not execute the request.")]
    async fn api_requests_create(
        &self,
        Parameters(args): Parameters<ApiRequestCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        sqlx::query(
            "INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(&id)
        .bind(args.collection_id)
        .bind(args.name)
        .bind(args.method.to_uppercase())
        .bind(args.url)
        .bind(value_to_db_json(args.headers, json!([])))
        .bind(args.body.unwrap_or_default())
        .bind(args.body_mode.unwrap_or_else(|| "json".to_string()))
        .bind(value_to_db_json(
            args.auth.map(strip_redaction_marker),
            json!({ "type": "none" }),
        ))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("apiRequests", "create", Some(id.clone()));
        self.api_requests_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a saved API client request by ID.")]
    async fn api_requests_update(
        &self,
        Parameters(args): Parameters<ApiRequestUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "update").await?;
        let current =
            sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests WHERE id = $1")
                .bind(&args.id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)?
                .ok_or_else(|| not_found("apiRequests", &args.id))?;
        let auth = args
            .auth
            .map(|value| resolve_auth_update(value, &current.auth))
            .unwrap_or(current.auth);
        let headers = args
            .headers
            .map(|value| serde_json::to_string(&value).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.headers);
        sqlx::query(
            "UPDATE api_requests SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$10 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.collection_id.or(current.collection_id))
        .bind(args.name.unwrap_or(current.name))
        .bind(args.method.unwrap_or(current.method).to_uppercase())
        .bind(args.url.unwrap_or(current.url))
        .bind(headers)
        .bind(args.body.unwrap_or(current.body))
        .bind(args.body_mode.unwrap_or(current.body_mode))
        .bind(auth)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("apiRequests", "update", Some(args.id.clone()));
        self.api_requests_get(Parameters(IdArgs { id: args.id }))
            .await
    }

    #[tool(description = "Delete a saved API client request by ID.")]
    async fn api_requests_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "delete").await?;
        let result = sqlx::query("DELETE FROM api_requests WHERE id = $1")
            .bind(&args.id)
            .execute(&self.pool)
            .await
            .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("apiRequests", &args.id));
        }
        self.emit_changed("apiRequests", "delete", Some(args.id));
        to_json_text(json!({ "deleted": true }))
    }
}

#[tool_handler]
impl ServerHandler for CockpitMcpService {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            instructions: Some(
                "Use `help` for Cockpit MCP guidance and `introspect` for schemas. These tools read and manage local devdrivr cockpit notes, snippets, prompt templates, and saved API client requests."
                    .to_string(),
            ),
            ..ServerInfo::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacted_basic_auth_preserves_only_password() {
        let current = json!({
            "type": "basic",
            "username": "old-user",
            "password": "old-password"
        })
        .to_string();
        let incoming = json!({
            "type": "basic",
            "username": "new-user",
            "password": REDACTED_AUTH_VALUE,
            "__cockpitRedacted": true
        });

        let updated = parse_json(&resolve_auth_update(incoming, &current), json!({}));

        assert_eq!(updated["username"], "new-user");
        assert_eq!(updated["password"], "old-password");
        assert_eq!(updated.get("__cockpitRedacted"), None);
    }

    #[test]
    fn redacted_literal_without_marker_is_saved() {
        let current = json!({
            "type": "bearer",
            "token": "old-token"
        })
        .to_string();
        let incoming = json!({
            "type": "bearer",
            "token": REDACTED_AUTH_VALUE
        });

        let updated = parse_json(&resolve_auth_update(incoming, &current), json!({}));

        assert_eq!(updated["token"], REDACTED_AUTH_VALUE);
        assert_eq!(updated.get("__cockpitRedacted"), None);
    }

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

    #[test]
    fn search_limit_defaults_clamps_and_rejects_invalid_values() {
        assert_eq!(normalize_search_limit(None).unwrap(), 50);
        assert_eq!(normalize_search_limit(Some(999)).unwrap(), 500);

        let err = normalize_search_limit(Some(0)).expect_err("zero limit should fail");
        let data = err.data.expect("error data");
        assert_eq!(data["code"], "INVALID_ARGUMENT");
        assert_eq!(data["argument"], "limit");
    }

    #[test]
    fn resource_type_parser_deduplicates_and_reports_unsupported_types() {
        let parsed = parse_resource_types(vec![
            "notes".to_string(),
            "snippets".to_string(),
            "notes".to_string(),
        ])
        .expect("valid types");

        assert_eq!(parsed, vec![ResourceType::Notes, ResourceType::Snippets]);

        let err = parse_resource_types(vec!["bookmarks".to_string()])
            .expect_err("unsupported type should fail");
        let data = err.data.expect("error data");
        assert_eq!(data["code"], "UNSUPPORTED_RESOURCE_TYPE");
        assert_eq!(data["argument"], "type");
    }

    #[test]
    fn structured_permission_error_has_actionable_metadata() {
        let err = permission_denied("notes", "read");
        let data = err.data.expect("error data");

        assert_eq!(data["code"], "PERMISSION_DENIED");
        assert_eq!(data["resource"], "notes");
        assert_eq!(data["action"], "read");
        assert!(data["suggestions"]
            .as_array()
            .is_some_and(|items| !items.is_empty()));
    }

    #[test]
    fn batch_too_large_error_has_stable_code() {
        let err = batch_too_large("ids", 101, MAX_MULTI_GET);
        let data = err.data.expect("error data");

        assert_eq!(data["code"], "BATCH_TOO_LARGE");
        assert_eq!(data["argument"], "ids");
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
            permissions: super::super::types::McpPermissions {
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
        let content = help_tools_from_router(&CockpitMcpService::tool_router());

        assert!(content.contains("`help`"));
        assert!(content.contains("`search`"));
        assert!(content.contains("`multi_get`"));
        assert!(content.contains("`introspect`"));
        assert!(content.contains("`counts`"));
    }

    #[test]
    fn help_clients_uses_env_var_without_revealing_api_key() {
        let settings = test_settings();
        let content = help_clients(&settings);

        assert!(content.contains("COCKPIT_MCP_KEY"));
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
        let tools = CockpitMcpService::tool_router();

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
