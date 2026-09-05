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
const FOLDER_SORT_STEP: f64 = 1000.0;
const SYSTEM_INBOX_IDS: [&str; 3] = ["notes-inbox", "snippets-inbox", "api-requests-inbox"];
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
pub struct DevdrivrMcpService {
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
    folder_id: Option<String>,
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
    folder_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SnippetCreateArgs {
    title: String,
    content: String,
    language: Option<String>,
    tags: Option<Vec<String>>,
    folder_id: Option<String>,
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
    folder_id: Option<String>,
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
    folder_id: Option<String>,
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
    folder_id: Option<String>,
    collection_id: Option<String>,
    name: Option<String>,
    method: Option<String>,
    url: Option<String>,
    headers: Option<Value>,
    body: Option<String>,
    body_mode: Option<String>,
    auth: Option<Value>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct FolderListArgs {
    kind: Option<String>,
    query: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct FolderCreateArgs {
    name: String,
    kind: String,
    parent_id: Option<String>,
    default_language: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct FolderUpdateArgs {
    id: String,
    name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    default_language: Option<Option<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct FolderMoveArgs {
    id: String,
    parent_id: Option<String>,
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
    folder_id: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct SnippetRow {
    id: String,
    title: String,
    content: String,
    language: String,
    tags: String,
    folder: String,
    folder_id: Option<String>,
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
    parent_id: Option<String>,
    sort_order: f64,
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

#[derive(Debug, Clone, FromRow)]
struct ResourceFolderRow {
    id: String,
    name: String,
    parent_id: Option<String>,
    kind: String,
    sort_order: f64,
    default_language: Option<String>,
    created_at: i64,
    updated_at: i64,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn deserialize_nullable_string<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Value::deserialize(deserializer)? {
        Value::Null => Ok(Some(None)),
        Value::String(value) => Ok(Some(Some(value))),
        _ => Err(serde::de::Error::custom(
            "defaultLanguage must be a string or null",
        )),
    }
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
                "Verify devdrivr can open its local database",
                "Restart the devdrivr app and retry the MCP request",
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
                "Check that the agent is using the current devdrivr MCP API key",
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

fn parse_folder_kind(kind: &str) -> std::result::Result<&'static str, McpError> {
    match kind.trim() {
        "notes" => Ok("notes"),
        "snippets" => Ok("snippets"),
        "apiRequests" => Ok("apiRequests"),
        _ => Err(invalid_argument(
            "kind",
            format!("Unsupported folder kind: {kind}"),
            &["Use one of: notes, snippets, apiRequests"],
        )),
    }
}

fn invalid_folder_parent(message: impl Into<String>) -> McpError {
    invalid_argument(
        "parentId",
        message,
        &[
            "Choose a folder of the same resource kind",
            "Do not move a folder into itself or one of its descendants",
        ],
    )
}

fn is_system_inbox(id: &str) -> bool {
    SYSTEM_INBOX_IDS.contains(&id)
}

fn system_inbox_update_denied(id: &str) -> McpError {
    invalid_argument(
        "id",
        format!("The system Inbox folder {id} cannot be renamed or moved"),
        &[
            "Create a child folder under Inbox instead",
            "Use a non-system folder ID",
        ],
    )
}

fn validate_default_language(kind: &str, supplied: bool) -> std::result::Result<(), McpError> {
    if kind != "snippets" && supplied {
        return Err(invalid_argument(
            "defaultLanguage",
            "defaultLanguage is supported only for snippet folders",
            &["Omit defaultLanguage for notes and apiRequests folders"],
        ));
    }
    Ok(())
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

fn note_to_json(row: NoteRow, folder_path: Vec<String>) -> Value {
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
        "folderId": row.folder_id,
        "folderPath": folder_path,
    })
}

fn snippet_to_json(row: SnippetRow, folder_path: Vec<String>) -> Value {
    json!({
        "id": row.id,
        "title": row.title,
        "content": row.content,
        "language": row.language,
        "tags": parse_json(&row.tags, json!([])),
        "folder": row.folder,
        "folderId": row.folder_id,
        "folderPath": folder_path,
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
        "parentId": row.parent_id,
        "sortOrder": row.sort_order,
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
                    obj.insert("__devdrivrRedacted".to_string(), Value::Bool(true));
                    obj.insert(
                        "token".to_string(),
                        Value::String(REDACTED_AUTH_VALUE.to_string()),
                    );
                }
                Some("basic") => {
                    obj.insert("__devdrivrRedacted".to_string(), Value::Bool(true));
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
            obj.remove("__devdrivrRedacted");
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
        .remove("__devdrivrRedacted")
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

fn api_request_to_json(row: ApiRequestRow, folder_path: Vec<String>, expose_auth: bool) -> Value {
    json!({
        "id": row.id,
        "collectionId": row.collection_id,
        "folderId": row.collection_id,
        "folderPath": folder_path,
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

fn resource_folder_to_json(row: ResourceFolderRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "parentId": row.parent_id,
        "kind": row.kind,
        "sortOrder": row.sort_order,
        "defaultLanguage": row.default_language,
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
- `notes`: fields include `id`, `title`, `content`, `color`, `pinned`, `folderId`, `folderPath`, `tags`, `createdAt`, `updatedAt`.
- `snippets`: fields include `id`, `title`, `content`, `language`, `folderId`, `folderPath`, legacy `folder`, `tags`, `createdAt`, `updatedAt`.
- `promptTemplates`: fields include `id`, `name`, `prompt`, `variables`, `author`, `tags`, `estimatedTokens`, `createdAt`, `updatedAt`.
- `apiRequests`: fields include `id`, `folderId`, `folderPath`, legacy `collectionId`, `name`, `method`, `url`, `headers`, `body`, `bodyMode`, `auth`.

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
impl DevdrivrMcpService {
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
                let row = sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&self.pool)
                    .await
                    .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.note_value(row).await?)),
                    None => Ok(None),
                }
            }
            ResourceType::Snippets => {
                let row = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = $1")
                    .bind(id)
                    .fetch_optional(&self.pool)
                    .await
                    .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.snippet_value(row).await?)),
                    None => Ok(None),
                }
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
                let row =
                    sqlx::query_as::<_, ApiRequestRow>("SELECT * FROM api_requests WHERE id = $1")
                        .bind(id)
                        .fetch_optional(&self.pool)
                        .await
                        .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.api_request_value(row, expose_auth).await?)),
                    None => Ok(None),
                }
            }
        }
    }

    async fn fetch_resource_values(
        &self,
        resource_type: ResourceType,
    ) -> std::result::Result<Vec<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                let rows = sqlx::query_as::<_, NoteRow>(
                    "SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.note_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::Snippets => {
                let rows = sqlx::query_as::<_, SnippetRow>(
                    "SELECT * FROM snippets ORDER BY updated_at DESC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.snippet_value(row).await?);
                }
                Ok(values)
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
                let rows = sqlx::query_as::<_, ApiRequestRow>(
                    "SELECT * FROM api_requests ORDER BY name ASC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.api_request_value(row, expose_auth).await?);
                }
                Ok(values)
            }
        }
    }

    async fn folder_path(
        &self,
        folder_id: Option<&str>,
    ) -> std::result::Result<Vec<String>, McpError> {
        let Some(folder_id) = folder_id else {
            return Ok(Vec::new());
        };
        sqlx::query_scalar::<_, String>(
            "WITH RECURSIVE path(id, name, parent_id, depth) AS (\
             SELECT id, name, parent_id, 0 FROM resource_folders WHERE id = $1 \
             UNION ALL \
             SELECT folder.id, folder.name, folder.parent_id, path.depth + 1 \
             FROM resource_folders folder JOIN path ON path.parent_id = folder.id \
             WHERE path.depth < 100\
             ) SELECT name FROM path ORDER BY depth DESC",
        )
        .bind(folder_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)
    }

    async fn note_value(&self, row: NoteRow) -> std::result::Result<Value, McpError> {
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        Ok(note_to_json(row, folder_path))
    }

    async fn snippet_value(&self, row: SnippetRow) -> std::result::Result<Value, McpError> {
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        Ok(snippet_to_json(row, folder_path))
    }

    async fn api_request_value(
        &self,
        row: ApiRequestRow,
        expose_auth: bool,
    ) -> std::result::Result<Value, McpError> {
        let folder_path = self.folder_path(row.collection_id.as_deref()).await?;
        Ok(api_request_to_json(row, folder_path, expose_auth))
    }

    async fn folder_by_id(
        &self,
        id: &str,
    ) -> std::result::Result<Option<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>("SELECT * FROM resource_folders WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)
    }

    async fn require_folder_kind(
        &self,
        id: &str,
        kind: &str,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let folder = self
            .folder_by_id(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        if folder.kind != kind {
            return Err(invalid_argument(
                "folderId",
                format!("Folder {id} does not belong to {kind}"),
                &["Use a folder ID returned by resource_folders_list for this resource kind"],
            ));
        }
        Ok(folder)
    }

    async fn save_folder(&self, folder: &ResourceFolderRow) -> std::result::Result<(), McpError> {
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "INSERT INTO resource_folders (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, kind=$4, sort_order=$5, default_language=$6, updated_at=$8",
        )
        .bind(&folder.id)
        .bind(&folder.name)
        .bind(&folder.parent_id)
        .bind(&folder.kind)
        .bind(folder.sort_order)
        .bind(&folder.default_language)
        .bind(folder.created_at)
        .bind(folder.updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;

        if folder.kind == "apiRequests" {
            sqlx::query(
                "INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7) \
                 ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, default_language=$5, updated_at=$7",
            )
            .bind(&folder.id)
            .bind(&folder.name)
            .bind(&folder.parent_id)
            .bind(folder.sort_order)
            .bind(&folder.default_language)
            .bind(folder.created_at)
            .bind(folder.updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        Ok(())
    }

    async fn validate_folder_parent(
        &self,
        kind: &str,
        id: Option<&str>,
        parent_id: Option<&str>,
    ) -> std::result::Result<(), McpError> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };
        if id == Some(parent_id) {
            return Err(invalid_folder_parent("A folder cannot be its own parent"));
        }
        let parent = self.require_folder_kind(parent_id, kind).await?;
        let mut cursor = parent.parent_id;
        let mut visited = std::collections::HashSet::from([parent_id.to_string()]);
        while let Some(current_id) = cursor {
            if id == Some(current_id.as_str()) {
                return Err(invalid_folder_parent(
                    "A folder cannot be moved into its own subtree",
                ));
            }
            if !visited.insert(current_id.clone()) {
                return Err(invalid_folder_parent(
                    "The requested folder tree contains a cycle",
                ));
            }
            cursor = self
                .folder_by_id(&current_id)
                .await?
                .and_then(|folder| folder.parent_id);
        }
        Ok(())
    }

    async fn resolve_snippet_folder(
        &self,
        folder_id: Option<String>,
        legacy_folder: Option<String>,
        current: Option<&SnippetRow>,
    ) -> std::result::Result<(String, String, bool), McpError> {
        if let Some(folder_id) = folder_id {
            let folder = self.require_folder_kind(&folder_id, "snippets").await?;
            return Ok((folder.id, folder.name, false));
        }
        if let Some(folder_name) = legacy_folder {
            if folder_name.is_empty() {
                return Ok(("snippets-inbox".to_string(), String::new(), false));
            }
            if let Some(folder) = sqlx::query_as::<_, ResourceFolderRow>(
                "SELECT * FROM resource_folders WHERE kind = 'snippets' AND name = $1 AND parent_id IS NULL ORDER BY sort_order ASC LIMIT 1",
            )
            .bind(&folder_name)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)? {
                return Ok((folder.id, folder_name, false));
            }
            let now = now_ms();
            let folder = ResourceFolderRow {
                id: Uuid::new_v4().to_string(),
                name: folder_name.clone(),
                parent_id: None,
                kind: "snippets".to_string(),
                sort_order: FOLDER_SORT_STEP,
                default_language: None,
                created_at: now,
                updated_at: now,
            };
            self.save_folder(&folder).await?;
            return Ok((folder.id, folder_name, true));
        }
        Ok((
            current
                .and_then(|row| row.folder_id.clone())
                .unwrap_or_else(|| "snippets-inbox".to_string()),
            current.map(|row| row.folder.clone()).unwrap_or_default(),
            false,
        ))
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
        description = "Get topic-based help for devdrivr MCP. Topics: overview, tools, workflows, permissions, errors, schema, clients."
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

    #[tool(description = "Fetch multiple devdrivr resources by type and ID in one call.")]
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
        description = "Get complete schema metadata for devdrivr MCP resources, tools, settings, and permissions."
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
                        "folderId": "string (defaults to notes-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
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
                        "folderId": "string (defaults to snippets-inbox; legacy folder is accepted)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
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
                        "folderId": "string (compatibility alias for collectionId; defaults to api-requests-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
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
                    "description": "Typed hierarchical folders for notes, snippets, and API requests. MCP does not expose folder deletion.",
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
                    "tools": ["resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move"]
                }
            },
            "tools": {
                "discovery": ["help", "search", "multi_get", "introspect", "counts"],
                "notes": ["notes_list", "notes_get", "notes_create", "notes_update", "notes_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move"],
                "snippets": ["snippets_list", "snippets_get", "snippets_create", "snippets_update", "snippets_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move"],
                "promptTemplates": ["prompt_templates_list", "prompt_templates_get", "prompt_templates_create", "prompt_templates_update", "prompt_templates_delete"],
                "apiRequests": ["api_requests_list", "api_requests_get", "api_requests_create", "api_requests_update", "api_requests_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move"],
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

    #[tool(description = "List devdrivr notes. Returns compact JSON note records.")]
    async fn notes_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let values = apply_limit(
            self.fetch_resource_values(ResourceType::Notes)
                .await?
                .into_iter()
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "notes": values }))
    }

    #[tool(description = "Get one devdrivr note by ID.")]
    async fn notes_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let row = sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("notes", &args.id))?;
        to_json_text(self.note_value(row).await?)
    }

    #[tool(description = "Create a devdrivr note.")]
    async fn notes_create(&self, Parameters(args): Parameters<NoteCreateArgs>) -> McpResult {
        self.ensure_permission("notes", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let title = args.title.unwrap_or_default();
        let content = args.content.unwrap_or_default();
        let color = args.color.unwrap_or_else(|| "yellow".to_string());
        let pinned = args.pinned.unwrap_or(false);
        let tags = string_vec_to_db_json(args.tags);
        let folder_id = args.folder_id.unwrap_or_else(|| "notes-inbox".to_string());
        self.require_folder_kind(&folder_id, "notes").await?;
        sqlx::query(
            "INSERT INTO notes (id, title, content, color, pinned, popped_out, created_at, updated_at, tags, folder_id) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9)",
        )
        .bind(&id)
        .bind(title)
        .bind(content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(now)
        .bind(now)
        .bind(tags)
        .bind(folder_id)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("notes", "create", Some(id.clone()));
        self.notes_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a devdrivr note by ID.")]
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
        let folder_id = args.folder_id.unwrap_or_else(|| {
            current
                .folder_id
                .unwrap_or_else(|| "notes-inbox".to_string())
        });
        self.require_folder_kind(&folder_id, "notes").await?;
        sqlx::query(
            "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, folder_id=$7, updated_at=$8 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.title.unwrap_or(current.title))
        .bind(args.content.unwrap_or(current.content))
        .bind(args.color.unwrap_or(current.color))
        .bind(if args.pinned.unwrap_or(current.pinned == 1) { 1 } else { 0 })
        .bind(tags)
        .bind(folder_id)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("notes", "update", Some(args.id.clone()));
        self.notes_get(Parameters(IdArgs { id: args.id })).await
    }

    #[tool(description = "Delete a devdrivr note by ID.")]
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

    #[tool(description = "List devdrivr snippets. Returns JSON snippet records.")]
    async fn snippets_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let values = apply_limit(
            self.fetch_resource_values(ResourceType::Snippets)
                .await?
                .into_iter()
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "snippets": values }))
    }

    #[tool(description = "Get one devdrivr snippet by ID.")]
    async fn snippets_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let row = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = $1")
            .bind(&args.id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)?
            .ok_or_else(|| not_found("snippets", &args.id))?;
        to_json_text(self.snippet_value(row).await?)
    }

    #[tool(description = "Create a devdrivr snippet.")]
    async fn snippets_create(&self, Parameters(args): Parameters<SnippetCreateArgs>) -> McpResult {
        self.ensure_permission("snippets", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let (folder_id, folder, created_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, None)
            .await?;
        sqlx::query(
            "INSERT INTO snippets (id, title, content, language, tags, folder, folder_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(&id)
        .bind(args.title)
        .bind(args.content)
        .bind(args.language.unwrap_or_default())
        .bind(string_vec_to_db_json(args.tags))
        .bind(folder)
        .bind(folder_id)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if created_folder {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "create", Some(id.clone()));
        self.snippets_get(Parameters(IdArgs { id })).await
    }

    #[tool(description = "Update a devdrivr snippet by ID.")]
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
            .unwrap_or_else(|| current.tags.clone());
        let (folder_id, folder, created_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, Some(&current))
            .await?;
        sqlx::query(
            "UPDATE snippets SET title=$2, content=$3, language=$4, tags=$5, folder=$6, folder_id=$7, updated_at=$8 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.title.unwrap_or(current.title))
        .bind(args.content.unwrap_or(current.content))
        .bind(args.language.unwrap_or(current.language))
        .bind(tags)
        .bind(folder)
        .bind(folder_id)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if created_folder {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "update", Some(args.id.clone()));
        self.snippets_get(Parameters(IdArgs { id: args.id })).await
    }

    #[tool(description = "Delete a devdrivr snippet by ID.")]
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

    #[tool(description = "List devdrivr prompt templates, including persisted built-ins.")]
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

    #[tool(description = "Get one devdrivr prompt template by ID.")]
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

    #[tool(description = "Create a user-owned devdrivr prompt template.")]
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

    #[tool(description = "Delete a user-owned devdrivr prompt template by ID.")]
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

    #[tool(
        description = "List shared resource folders. Filter by notes, snippets, or apiRequests; only folders allowed by the matching read permission are returned."
    )]
    async fn resource_folders_list(
        &self,
        Parameters(args): Parameters<FolderListArgs>,
    ) -> McpResult {
        let requested_kind = args.kind.as_deref().map(parse_folder_kind).transpose()?;
        let kinds = match requested_kind {
            Some(kind) => {
                self.ensure_permission(kind, "read").await?;
                vec![kind]
            }
            None => {
                let mut kinds = Vec::new();
                for kind in ["notes", "snippets", "apiRequests"] {
                    if self.ensure_permission(kind, "read").await.is_ok() {
                        kinds.push(kind);
                    }
                }
                kinds
            }
        };
        let rows = sqlx::query_as::<_, ResourceFolderRow>(
            "SELECT * FROM resource_folders ORDER BY kind ASC, parent_id ASC, sort_order ASC, name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let values = apply_limit(
            rows.into_iter()
                .filter(|folder| kinds.contains(&folder.kind.as_str()))
                .map(resource_folder_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        );
        to_json_text(json!({ "folders": values }))
    }

    #[tool(
        description = "Create a shared resource folder for notes, snippets, or saved API requests. API request folders remain compatible with API collections."
    )]
    async fn resource_folders_create(
        &self,
        Parameters(args): Parameters<FolderCreateArgs>,
    ) -> McpResult {
        let kind = parse_folder_kind(&args.kind)?;
        self.ensure_permission(kind, "create").await?;
        let name = args.name.trim();
        if name.is_empty() {
            return Err(invalid_argument(
                "name",
                "Folder name cannot be empty",
                &["Provide a non-empty folder name"],
            ));
        }
        validate_default_language(kind, args.default_language.is_some())?;
        self.validate_folder_parent(kind, None, args.parent_id.as_deref())
            .await?;
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT COALESCE(MAX(sort_order), 0) FROM resource_folders WHERE kind = $1 AND ((parent_id IS NULL AND $2 IS NULL) OR parent_id = $2)",
        )
        .bind(kind)
        .bind(&args.parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(db_error)?;
        let now = now_ms();
        let folder = ResourceFolderRow {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            parent_id: args.parent_id,
            kind: kind.to_string(),
            sort_order: max_sort + FOLDER_SORT_STEP,
            default_language: args.default_language,
            created_at: now,
            updated_at: now,
        };
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "create", Some(folder.id.clone()));
        self.emit_changed(kind, "create", Some(folder.id.clone()));
        if kind == "apiRequests" {
            self.emit_changed("apiCollections", "create", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
    }

    #[tool(
        description = "Rename or update a shared resource folder. Folder deletion is intentionally not exposed through MCP."
    )]
    async fn resource_folders_update(
        &self,
        Parameters(args): Parameters<FolderUpdateArgs>,
    ) -> McpResult {
        let mut folder = self
            .folder_by_id(&args.id)
            .await?
            .ok_or_else(|| not_found("folders", &args.id))?;
        self.ensure_permission(&folder.kind, "update").await?;
        if is_system_inbox(&folder.id) {
            return Err(system_inbox_update_denied(&folder.id));
        }
        validate_default_language(&folder.kind, args.default_language.is_some())?;
        if let Some(name) = args.name {
            let name = name.trim();
            if name.is_empty() {
                return Err(invalid_argument(
                    "name",
                    "Folder name cannot be empty",
                    &["Provide a non-empty folder name"],
                ));
            }
            folder.name = name.to_string();
        }
        if let Some(default_language) = args.default_language {
            folder.default_language = default_language;
        }
        folder.updated_at = now_ms();
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "update", Some(folder.id.clone()));
        self.emit_changed(&folder.kind, "update", Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", "update", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
    }

    #[tool(
        description = "Move a shared resource folder under another folder of the same kind. Moves that would create a cycle are rejected."
    )]
    async fn resource_folders_move(
        &self,
        Parameters(args): Parameters<FolderMoveArgs>,
    ) -> McpResult {
        let mut folder = self
            .folder_by_id(&args.id)
            .await?
            .ok_or_else(|| not_found("folders", &args.id))?;
        self.ensure_permission(&folder.kind, "update").await?;
        if is_system_inbox(&folder.id) {
            return Err(system_inbox_update_denied(&folder.id));
        }
        self.validate_folder_parent(&folder.kind, Some(&folder.id), args.parent_id.as_deref())
            .await?;
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT COALESCE(MAX(sort_order), 0) FROM resource_folders WHERE kind = $1 AND id <> $2 AND ((parent_id IS NULL AND $3 IS NULL) OR parent_id = $3)",
        )
        .bind(&folder.kind)
        .bind(&folder.id)
        .bind(&args.parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(db_error)?;
        folder.parent_id = args.parent_id;
        folder.sort_order = max_sort + FOLDER_SORT_STEP;
        folder.updated_at = now_ms();
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "update", Some(folder.id.clone()));
        self.emit_changed(&folder.kind, "update", Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", "update", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
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
        let values = apply_limit(
            self.fetch_resource_values(ResourceType::ApiRequests)
                .await?
                .into_iter()
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
        to_json_text(self.api_request_value(row, expose_auth).await?)
    }

    #[tool(description = "Create a saved API client request. This does not execute the request.")]
    async fn api_requests_create(
        &self,
        Parameters(args): Parameters<ApiRequestCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let folder_id = args
            .folder_id
            .or(args.collection_id)
            .unwrap_or_else(|| "api-requests-inbox".to_string());
        self.require_folder_kind(&folder_id, "apiRequests").await?;
        sqlx::query(
            "INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(&id)
        .bind(folder_id)
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
        let folder_id = args
            .folder_id
            .or(args.collection_id)
            .or(current.collection_id)
            .unwrap_or_else(|| "api-requests-inbox".to_string());
        self.require_folder_kind(&folder_id, "apiRequests").await?;
        sqlx::query(
            "UPDATE api_requests SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$10 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(folder_id)
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
impl ServerHandler for DevdrivrMcpService {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            instructions: Some(
                "Use `help` for devdrivr MCP guidance and `introspect` for schemas. These tools read and manage local devdrivr notes, snippets, prompt templates, and saved API client requests."
                    .to_string(),
            ),
            ..ServerInfo::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_request_with_auth(auth: Value) -> ApiRequestRow {
        ApiRequestRow {
            id: "request-1".to_string(),
            collection_id: Some("collection-1".to_string()),
            name: "Create user".to_string(),
            method: "POST".to_string(),
            url: "{{baseUrl}}/users".to_string(),
            headers: json!([{ "key": "X-Trace", "value": "{{traceId}}", "enabled": true }])
                .to_string(),
            body: r#"{"name":"Ada"}"#.to_string(),
            body_mode: "json".to_string(),
            auth: auth.to_string(),
            created_at: 1,
            updated_at: 2,
        }
    }

    #[test]
    fn api_request_json_redacts_auth_secrets_unless_explicitly_exposed() {
        let auth = json!({
            "type": "basic",
            "username": "ada",
            "password": "super-secret"
        });

        let redacted = api_request_to_json(
            api_request_with_auth(auth.clone()),
            vec!["Inbox".to_string(), "Users".to_string()],
            false,
        );
        assert_eq!(redacted["collectionId"], "collection-1");
        assert_eq!(redacted["folderId"], "collection-1");
        assert_eq!(redacted["folderPath"], json!(["Inbox", "Users"]));
        assert_eq!(redacted["headers"][0]["key"], "X-Trace");
        assert_eq!(redacted["bodyMode"], "json");
        assert_eq!(redacted["auth"]["username"], "ada");
        assert_eq!(redacted["auth"]["password"], REDACTED_AUTH_VALUE);
        assert_eq!(redacted["auth"]["__devdrivrRedacted"], true);

        let exposed = api_request_to_json(api_request_with_auth(auth), Vec::new(), true);
        assert_eq!(exposed["auth"]["password"], "super-secret");
        assert_eq!(exposed["auth"].get("__devdrivrRedacted"), None);
    }

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
            "__devdrivrRedacted": true
        });

        let updated = parse_json(&resolve_auth_update(incoming, &current), json!({}));

        assert_eq!(updated["username"], "new-user");
        assert_eq!(updated["password"], "old-password");
        assert_eq!(updated.get("__devdrivrRedacted"), None);
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
        assert_eq!(updated.get("__devdrivrRedacted"), None);
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
    fn folder_kind_parser_accepts_only_resource_kinds_with_folders() {
        assert_eq!(parse_folder_kind("notes").unwrap(), "notes");
        assert_eq!(parse_folder_kind(" apiRequests ").unwrap(), "apiRequests");

        let err = parse_folder_kind("promptTemplates").expect_err("templates have no folders");
        let data = err.data.expect("error data");
        assert_eq!(data["code"], "INVALID_ARGUMENT");
        assert_eq!(data["argument"], "kind");
    }

    #[test]
    fn resource_folder_json_exposes_typed_tree_fields() {
        let value = resource_folder_to_json(ResourceFolderRow {
            id: "notes-project".to_string(),
            name: "Project".to_string(),
            parent_id: Some("notes-inbox".to_string()),
            kind: "notes".to_string(),
            sort_order: 1000.0,
            default_language: None,
            created_at: 1,
            updated_at: 2,
        });

        assert_eq!(value["parentId"], "notes-inbox");
        assert_eq!(value["kind"], "notes");
        assert_eq!(value["sortOrder"], 1000.0);
        assert!(value["defaultLanguage"].is_null());
    }

    #[test]
    fn system_inboxes_are_immutable_and_default_language_is_snippets_only() {
        assert!(is_system_inbox("notes-inbox"));
        assert!(is_system_inbox("snippets-inbox"));
        assert!(is_system_inbox("api-requests-inbox"));
        assert!(!is_system_inbox("notes-project"));

        assert!(validate_default_language("snippets", true).is_ok());
        assert!(validate_default_language("notes", false).is_ok());
        let err = validate_default_language("apiRequests", true)
            .expect_err("API request folders cannot have a snippet language default");
        let data = err.data.expect("error data");
        assert_eq!(data["argument"], "defaultLanguage");
    }

    #[test]
    fn folder_update_accepts_an_explicit_null_default_language_to_clear_it() {
        let args = serde_json::from_value::<FolderUpdateArgs>(json!({
            "id": "snippets-project",
            "defaultLanguage": null,
        }))
        .expect("valid update arguments");

        assert_eq!(args.default_language, Some(None));
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
        let content = help_tools_from_router(&DevdrivrMcpService::tool_router());

        assert!(content.contains("`help`"));
        assert!(content.contains("`search`"));
        assert!(content.contains("`multi_get`"));
        assert!(content.contains("`introspect`"));
        assert!(content.contains("`counts`"));
        assert!(content.contains("`resource_folders_list`"));
        assert!(content.contains("`resource_folders_move`"));
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
