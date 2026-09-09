use std::{cmp::Ordering, sync::Arc};

use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::{McpDataChangedEvent, McpSettings, ResourcePermissions};

type SharedSettings = Arc<RwLock<McpSettings>>;
type McpResult = std::result::Result<CallToolResult, McpError>;
const REDACTED_AUTH_VALUE: &str = "***REDACTED***";
const DEFAULT_RESULT_LIMIT: i64 = 50;
const MAX_RESULT_LIMIT: i64 = 500;
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
    /// None only under test. `mock_app` builds an `AppHandle<MockRuntime>`, which cannot stand in
    /// for the Wry handle the app runs on, so tests construct the service without one and the
    /// change event is dropped instead of emitted.
    app: Option<AppHandle>,
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
    task_status: Option<String>,
    task_priority: Option<String>,
    task_due_date: Option<String>,
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
    task_status: Option<String>,
    task_priority: Option<String>,
    task_due_date: Option<String>,
    clear_task_metadata: Option<bool>,
    clear_task_priority: Option<bool>,
    clear_task_due_date: Option<bool>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SnippetCreateArgs {
    title: String,
    content: Option<String>,
    language: Option<String>,
    description: Option<String>,
    fragments: Option<Vec<SnippetFragmentInput>>,
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
    description: Option<String>,
    fragments: Option<Vec<SnippetFragmentInput>>,
    tags: Option<Vec<String>>,
    folder_id: Option<String>,
    folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SnippetFragmentInput {
    id: Option<String>,
    name: String,
    content: String,
    language: Option<String>,
}

fn normalize_snippet_fragments(
    fragments: Option<Vec<SnippetFragmentInput>>,
    legacy_content: Option<String>,
    legacy_language: Option<String>,
) -> std::result::Result<Vec<(String, String, String, String)>, McpError> {
    let Some(fragments) = fragments else {
        return Ok(vec![(
            Uuid::new_v4().to_string(),
            "main".to_string(),
            legacy_content.unwrap_or_default(),
            legacy_language.unwrap_or_else(|| "text".to_string()),
        )]);
    };
    if fragments.is_empty() || fragments.len() > 100 {
        return Err(invalid_argument(
            "fragments",
            "A snippet must contain between 1 and 100 fragments",
            &["Supply at least one fragment and no more than 100"],
        ));
    }
    fragments
        .into_iter()
        .enumerate()
        .map(|(index, fragment)| {
            let name = fragment.name.trim().to_string();
            if name.is_empty() {
                return Err(invalid_argument(
                    "fragments",
                    format!("Fragment {} has an empty name", index + 1),
                    &["Give every fragment a readable name"],
                ));
            }
            Ok((
                fragment
                    .id
                    .filter(|id| !id.trim().is_empty())
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                name,
                fragment.content,
                fragment.language.unwrap_or_else(|| "text".to_string()),
            ))
        })
        .collect()
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

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EmptyTrashArgs {
    kind: String,
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
    deleted_at: Option<i64>,
    task_status: Option<String>,
    task_priority: Option<String>,
    task_due_date: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct SnippetRow {
    id: String,
    title: String,
    content: String,
    language: String,
    description: String,
    tags: String,
    folder: String,
    folder_id: Option<String>,
    created_at: i64,
    updated_at: i64,
    deleted_at: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
struct SnippetFragmentRow {
    id: String,
    name: String,
    content: String,
    language: String,
    sort_order: i64,
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
    deleted_at: Option<i64>,
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
    deleted_at: Option<i64>,
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
    deleted_at: Option<i64>,
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

fn validate_task_status(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "todo" | "in_progress" | "done" | "blocked" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "taskStatus",
            format!("Unsupported task status: {value}"),
            &["Use one of: todo, in_progress, done, blocked"],
        )),
    }
}

fn validate_task_priority(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "low" | "medium" | "high" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "taskPriority",
            format!("Unsupported task priority: {value}"),
            &["Use one of: low, medium, high"],
        )),
    }
}

/// WARNING: Notes skips any row whose colour falls outside this set, so an unchecked write makes
/// an import look successful while the note never appears in the tool.
fn validate_note_color(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "yellow" | "green" | "blue" | "pink" | "purple" | "orange" | "red" | "gray" => {
            Ok(value.to_string())
        }
        _ => Err(invalid_argument(
            "color",
            format!("Unsupported note color: {value}"),
            &["Use one of: yellow, green, blue, pink, purple, orange, red, gray"],
        )),
    }
}

/// Repairs a stored value an earlier import left invalid.
///
/// An update that does not touch the field must not write the bad value back, or the row stays
/// invisible in the tool. Reject what a client sends, but heal what the database already holds.
fn heal_stored(
    value: &str,
    default: &str,
    validate: fn(&str) -> std::result::Result<String, McpError>,
) -> String {
    validate(value).unwrap_or_else(|_| default.to_string())
}

fn heal_note_color(value: &str) -> String {
    heal_stored(value, "yellow", validate_note_color)
}

fn heal_template_category(value: &str) -> String {
    heal_stored(value, "productivity", validate_template_category)
}

fn heal_template_optimized_for(value: &str) -> String {
    heal_stored(value, "Generic", validate_template_optimized_for)
}

/// WARNING: Prompt Templates skips any row whose category falls outside this set, so an unchecked
/// write makes an import look successful while the template never appears in the tool.
fn validate_template_category(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "code-review" | "refactoring" | "testing" | "docs" | "debugging" | "learning"
        | "productivity" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "category",
            format!("Unsupported template category: {value}"),
            &[
                "Use one of: code-review, refactoring, testing, docs, debugging, learning, productivity",
            ],
        )),
    }
}

/// WARNING: Prompt Templates skips any row whose target falls outside this set. See
/// [`validate_template_category`].
fn validate_template_optimized_for(value: &str) -> std::result::Result<String, McpError> {
    match value {
        "Claude" | "ChatGPT" | "Cursor" | "Generic" => Ok(value.to_string()),
        _ => Err(invalid_argument(
            "optimizedFor",
            format!("Unsupported template target: {value}"),
            &["Use one of: Claude, ChatGPT, Cursor, Generic"],
        )),
    }
}

fn validate_task_due_date(value: &str) -> std::result::Result<String, McpError> {
    let parts = value
        .split('-')
        .map(str::parse::<u32>)
        .collect::<std::result::Result<Vec<_>, _>>();
    let valid = parts.ok().is_some_and(|parts| {
        if parts.len() != 3 || value.len() != 10 {
            return false;
        }
        let (year, month, day) = (parts[0], parts[1], parts[2]);
        let leap =
            year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
        let days = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if leap => 29,
            2 => 28,
            _ => return false,
        };
        day > 0 && day <= days
    });
    if !valid {
        return Err(invalid_argument(
            "taskDueDate",
            format!("Invalid local calendar date: {value}"),
            &["Use a real date in YYYY-MM-DD form"],
        ));
    }
    Ok(value.to_string())
}

fn stable_note_link_targets(content: &str) -> Vec<(String, String)> {
    let mut targets = Vec::new();
    let mut remaining = content;
    while let Some(open) = remaining.find("[[") {
        let after_open = &remaining[open + 2..];
        let Some(close) = after_open.find("]]") else {
            break;
        };
        let token = &after_open[..close];
        if let Some((target, label)) = token.split_once('|') {
            if let Some((kind, id)) = target.split_once(':') {
                if matches!(kind, "note" | "snippet" | "api-request")
                    && !id.is_empty()
                    && !label.is_empty()
                    && !id
                        .chars()
                        .any(|character| matches!(character, '|' | ']' | '\r' | '\n'))
                    && !label
                        .chars()
                        .any(|character| matches!(character, ']' | '\r' | '\n'))
                {
                    let pair = (kind.to_string(), id.to_string());
                    if !targets.contains(&pair) {
                        targets.push(pair);
                    }
                }
            }
        }
        remaining = &after_open[close + 2..];
    }
    targets
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
        "taskStatus": row.task_status,
        "taskPriority": row.task_priority,
        "taskDueDate": row.task_due_date,
    })
}

fn snippet_to_json(row: SnippetRow, folder_path: Vec<String>) -> Value {
    json!({
        "id": row.id,
        "title": row.title,
        "content": row.content,
        "language": row.language,
        "description": row.description,
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

/// Reads a header key or value that an MCP client sent as a JSON scalar.
fn header_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn invalid_api_headers(message: impl Into<String>) -> McpError {
    invalid_argument(
        "headers",
        message,
        &[
            "Send an array of {\"key\": \"Accept\", \"value\": \"application/json\", \"enabled\": true} objects",
            "Or send a flat header map such as {\"Accept\": \"application/json\"}",
        ],
    )
}

fn normalize_api_header_entry(entry: Value) -> std::result::Result<Value, McpError> {
    let Value::Object(obj) = entry else {
        return Err(invalid_api_headers(
            "Every header must be an object with key and value",
        ));
    };
    let key = obj
        .get("key")
        .or_else(|| obj.get("name"))
        .and_then(header_text)
        .ok_or_else(|| invalid_api_headers("Every header needs a key"))?;
    let value = obj
        .get("value")
        .map_or_else(|| Some(String::new()), header_text)
        .ok_or_else(|| invalid_api_headers(format!("Header {key} needs a text value")))?;
    // Reject rather than default. A client sending 0 for a disabled header would otherwise have
    // that header quietly switched on.
    let enabled = match obj.get("enabled") {
        None | Some(Value::Null) => true,
        Some(Value::Bool(flag)) => *flag,
        Some(_) => {
            return Err(invalid_api_headers(format!(
                "Header {key} needs enabled as true or false"
            )))
        }
    };
    Ok(json!({ "key": key, "value": value, "enabled": enabled }))
}

/// WARNING: The API Client calls array methods on `headers` while it renders a saved request. A
/// stored object or string therefore crashes the tool on load, so reject those shapes at the write.
///
/// Accept both shapes an MCP client sends: the stored array, and a flat header map.
fn normalize_api_headers(headers: Option<Value>) -> std::result::Result<String, McpError> {
    let entries = match headers {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .map(normalize_api_header_entry)
            .collect::<std::result::Result<Vec<_>, _>>()?,
        Some(Value::Object(map)) => map
            .into_iter()
            .map(|(key, value)| {
                let value = header_text(&value).ok_or_else(|| {
                    invalid_api_headers(format!("Header {key} needs a text value"))
                })?;
                Ok(json!({ "key": key, "value": value, "enabled": true }))
            })
            .collect::<std::result::Result<Vec<_>, McpError>>()?,
        Some(_) => {
            return Err(invalid_api_headers(
                "Headers must be an array of header objects or a header map",
            ))
        }
    };
    Ok(serde_json::to_string(&Value::Array(entries)).unwrap_or_else(|_| "[]".to_string()))
}

fn invalid_prompt_variables(message: impl Into<String>) -> McpError {
    invalid_argument(
        "variables",
        message,
        &[
            "Send an array of {\"name\": \"code\", \"label\": \"Code\", \"type\": \"text\"} objects",
            "Use type text, textarea or select",
            "Give every select variable a non-empty options array",
        ],
    )
}

fn normalize_prompt_variable(variable: Value) -> std::result::Result<Value, McpError> {
    let Value::Object(obj) = variable else {
        return Err(invalid_prompt_variables(
            "Every variable must be an object with a name",
        ));
    };
    let name = obj
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid_prompt_variables("Every variable needs a non-empty name"))?
        .to_string();
    let label = obj
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map_or_else(|| name.clone(), str::to_string);
    let variable_type = obj.get("type").and_then(Value::as_str).unwrap_or("text");
    if !matches!(variable_type, "text" | "textarea" | "select") {
        return Err(invalid_prompt_variables(format!(
            "Variable {name} has unsupported type {variable_type}"
        )));
    }

    let mut normalized = serde_json::Map::new();
    normalized.insert("name".to_string(), Value::String(name.clone()));
    normalized.insert("label".to_string(), Value::String(label));
    normalized.insert("type".to_string(), Value::String(variable_type.to_string()));

    let options: Vec<Value> = match obj.get("options") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => {
            // Reject before dropping blanks. Filtering a Result stream would swallow the error a
            // non-string option raises and store the rest as if the import had been clean.
            let mut options = Vec::new();
            for item in items {
                let option = item.as_str().map(str::trim).ok_or_else(|| {
                    invalid_prompt_variables(format!("Variable {name} needs text options"))
                })?;
                if !option.is_empty() {
                    options.push(Value::String(option.to_string()));
                }
            }
            options
        }
        Some(_) => {
            return Err(invalid_prompt_variables(format!(
                "Variable {name} needs options as an array of strings"
            )))
        }
    };
    if variable_type == "select" && options.is_empty() {
        return Err(invalid_prompt_variables(format!(
            "Select variable {name} needs at least one option"
        )));
    }
    if !options.is_empty() {
        normalized.insert("options".to_string(), Value::Array(options));
    }

    if let Some(placeholder) = obj.get("placeholder").and_then(Value::as_str) {
        if !placeholder.is_empty() {
            normalized.insert(
                "placeholder".to_string(),
                Value::String(placeholder.to_string()),
            );
        }
    }
    if let Some(required) = obj.get("required").and_then(Value::as_bool) {
        normalized.insert("required".to_string(), Value::Bool(required));
    }
    Ok(Value::Object(normalized))
}

/// WARNING: Prompt Templates drops any stored variable it cannot recognise, so an unchecked write
/// makes an import look successful while the template loses every field the user must fill.
///
/// Apply the rules the tool's own import applies, and reject what it would reject.
fn normalize_prompt_variables(variables: Option<Value>) -> std::result::Result<String, McpError> {
    let normalized = match variables {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items
            .into_iter()
            .map(normalize_prompt_variable)
            .collect::<std::result::Result<Vec<_>, _>>()?,
        Some(_) => return Err(invalid_prompt_variables("Variables must be an array")),
    };
    Ok(serde_json::to_string(&Value::Array(normalized)).unwrap_or_else(|_| "[]".to_string()))
}

fn invalid_api_auth(message: impl Into<String>) -> McpError {
    invalid_argument(
        "auth",
        message,
        &[
            "Send {\"type\": \"none\"}",
            "Send {\"type\": \"bearer\", \"token\": \"...\"}",
            "Send {\"type\": \"basic\", \"username\": \"...\", \"password\": \"...\"}",
        ],
    )
}

/// Reject rather than default. Erasing a credential the client did send would report a successful
/// write for a request that can no longer authenticate.
fn auth_field(
    obj: &serde_json::Map<String, Value>,
    field: &str,
) -> std::result::Result<String, McpError> {
    match obj.get(field) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(text)) => Ok(text.clone()),
        Some(_) => Err(invalid_api_auth(format!("Auth field {field} must be text"))),
    }
}

/// WARNING: The API Client reads `auth` as a tagged union and sends the named credential on every
/// request. An unknown shape would silently drop the credential, so reject it at the write.
fn normalize_api_auth(auth: Value) -> std::result::Result<String, McpError> {
    let Value::Object(obj) = auth else {
        return Err(invalid_api_auth("Auth must be an object with a type field"));
    };
    let normalized = match obj.get("type").and_then(Value::as_str) {
        None => return Err(invalid_api_auth("Auth needs a type field")),
        Some("none") => json!({ "type": "none" }),
        Some("bearer") => json!({ "type": "bearer", "token": auth_field(&obj, "token")? }),
        Some("basic") => json!({
            "type": "basic",
            "username": auth_field(&obj, "username")?,
            "password": auth_field(&obj, "password")?,
        }),
        Some(other) => {
            return Err(invalid_api_auth(format!("Unsupported auth type {other}")));
        }
    };
    Ok(serde_json::to_string(&normalized).unwrap_or_else(|_| r#"{"type":"none"}"#.to_string()))
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

/// Resolve the result limit for a search or a list.
///
/// WARNING: rejects a non-positive limit instead of clamping it. Answering `limit: 0` with one
/// record reads as data loss rather than as a bad argument.
fn normalize_limit(limit: Option<i64>) -> std::result::Result<usize, McpError> {
    let limit = limit.unwrap_or(DEFAULT_RESULT_LIMIT);
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
    Ok(limit.min(MAX_RESULT_LIMIT) as usize)
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
        "search" => "Use `types` and `tags` to reduce result volume; `limit` defaults to 50 and is capped at 500.",
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
- `notes`: fields include `id`, `title`, `content`, `color`, `pinned`, `folderId`, `folderPath`, `tags`, optional `taskStatus`, `taskPriority`, `taskDueDate`, `createdAt`, `updatedAt`.
- `snippets`: fields include `id`, `title`, Markdown `description`, ordered `fragments`, legacy primary `content`/`language`, `folderId`, `folderPath`, legacy `folder`, `tags`, `createdAt`, `updatedAt`.
- `promptTemplates`: fields include `id`, `name`, `prompt`, `variables`, `author`, `tags`, `estimatedTokens`, `createdAt`, `updatedAt`.
- `apiRequests`: fields include `id`, `folderId`, `folderPath`, legacy `collectionId`, `name`, `method`, `url`, `headers`, `body`, `bodyMode`, `auth`.

Limits:
- Search and list default to `{default_results}` results and cap at `{max_results}`.
- List responses carry `total`, `limit` and `hasMore`. Raise `limit` when `hasMore` is true.
- `multi_get` accepts at most `{max_multi_get}` IDs.
- Supported port range in the UI: 1024-65535.
- Current endpoint: `{url}`.
- API request auth supports `none`, `bearer`, and `basic`.
- Prompt estimated tokens are approximately `ceil(chars / 4)`.
"#,
        default_results = DEFAULT_RESULT_LIMIT,
        max_results = MAX_RESULT_LIMIT,
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

/// Bound a list response and say what was cut.
///
/// An absent limit means the default page, not the whole table. Without a default, listing ten
/// thousand notes serialised every one of them into a single tool response.
///
/// `total` and `hasMore` let a client tell a short page from an exhausted one.
fn list_payload(key: &str, mut values: Vec<Value>, limit: Option<i64>) -> McpResult {
    let total = values.len();
    let limit = normalize_limit(limit)?;
    values.truncate(limit);
    to_json_text(json!({
        key: values,
        "total": total,
        "limit": limit,
        "hasMore": total > limit,
    }))
}

#[tool_router]
impl DevdrivrMcpService {
    pub fn new(pool: SqlitePool, settings: SharedSettings, app: AppHandle) -> Self {
        Self {
            pool,
            settings,
            app: Some(app),
            tool_router: Self::tool_router(),
        }
    }

    /// WARNING: emits no change events. Use only where no Tauri runtime exists.
    #[cfg(test)]
    fn new_detached(pool: SqlitePool, settings: SharedSettings) -> Self {
        Self {
            pool,
            settings,
            app: None,
            tool_router: Self::tool_router(),
        }
    }

    async fn replace_note_links(
        transaction: &mut Transaction<'_, Sqlite>,
        source_note_id: &str,
        content: &str,
    ) -> std::result::Result<(), McpError> {
        sqlx::query("DELETE FROM note_links WHERE source_note_id = $1")
            .bind(source_note_id)
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        for (kind, id) in stable_note_link_targets(content) {
            sqlx::query(
                "INSERT INTO note_links (source_note_id, target_kind, target_id, created_at) VALUES ($1, $2, $3, $4)",
            )
            .bind(source_note_id)
            .bind(kind)
            .bind(id)
            .bind(now_ms())
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        }
        Ok(())
    }

    async fn replace_snippet_fragments(
        transaction: &mut Transaction<'_, Sqlite>,
        snippet_id: &str,
        fragments: &[(String, String, String, String)],
        now: i64,
    ) -> std::result::Result<(), McpError> {
        sqlx::query("DELETE FROM snippet_fragments WHERE snippet_id = $1")
            .bind(snippet_id)
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        for (sort_order, (id, name, content, language)) in fragments.iter().enumerate() {
            sqlx::query(
                "INSERT INTO snippet_fragments (id, snippet_id, name, content, language, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(id)
            .bind(snippet_id)
            .bind(name)
            .bind(content)
            .bind(language)
            .bind(sort_order as i64)
            .bind(now)
            .bind(now)
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        }
        Ok(())
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

    /// Report a committed write.
    ///
    /// WARNING: call only after the transaction has committed. The write has already happened
    /// when this runs, so this must never return a permission error.
    ///
    /// Settings grants create, update, delete and read independently. Returning the record
    /// through the read-gated getter therefore answered a successful write with
    /// PERMISSION_DENIED for a write-only client, and an agent that retried wrote the row twice.
    ///
    /// The receipt always lands. The record rides along only when `read` is granted.
    async fn mutation_result(
        &self,
        resource_type: ResourceType,
        action: &str,
        id: &str,
    ) -> McpResult {
        let mut payload = json!({
            "id": id,
            "resource": resource_type.key(),
            "action": action,
        });
        if self.permissions_for(resource_type.key()).await.read {
            let record = self.fetch_resource_value(resource_type, id).await?;
            if let (Value::Object(obj), Some(record)) = (&mut payload, record) {
                obj.insert("record".to_string(), record);
            }
        }
        to_json_text(payload)
    }

    async fn fetch_resource_value(
        &self,
        resource_type: ResourceType,
        id: &str,
    ) -> std::result::Result<Option<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                let row = sqlx::query_as::<_, NoteRow>(
                    "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
                )
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
                let row = sqlx::query_as::<_, SnippetRow>(
                    "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
                )
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
                let row = sqlx::query_as::<_, ApiRequestRow>(
                    "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
                )
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
                    "SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC",
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
                    "SELECT * FROM snippets WHERE deleted_at IS NULL ORDER BY updated_at DESC",
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
                    "SELECT * FROM api_requests WHERE deleted_at IS NULL ORDER BY name ASC",
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
             SELECT id, name, parent_id, 0 FROM resource_folders WHERE id = $1 AND deleted_at IS NULL \
             UNION ALL \
             SELECT folder.id, folder.name, folder.parent_id, path.depth + 1 \
             FROM resource_folders folder JOIN path ON path.parent_id = folder.id \
             WHERE path.depth < 100 AND folder.deleted_at IS NULL\
             ) SELECT name FROM path ORDER BY depth DESC",
        )
        .bind(folder_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)
    }

    async fn note_value(&self, row: NoteRow) -> std::result::Result<Value, McpError> {
        let note_id = row.id.clone();
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        let outgoing = sqlx::query_as::<_, (String, String)>(
            r#"SELECT target_kind, target_id FROM note_links link
               WHERE source_note_id = $1 AND (
                 (target_kind = 'note' AND EXISTS (SELECT 1 FROM notes target WHERE target.id = link.target_id AND target.deleted_at IS NULL)) OR
                 (target_kind = 'snippet' AND EXISTS (SELECT 1 FROM snippets target WHERE target.id = link.target_id AND target.deleted_at IS NULL)) OR
                 (target_kind = 'api-request' AND EXISTS (SELECT 1 FROM api_requests target WHERE target.id = link.target_id AND target.deleted_at IS NULL))
               ) ORDER BY target_kind, target_id"#,
        )
        .bind(&note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let backlinks = sqlx::query_as::<_, (String, String)>(
            r#"SELECT source.id, source.title FROM note_links link
               JOIN notes source ON source.id = link.source_note_id
               WHERE link.target_kind = 'note' AND link.target_id = $1
                 AND source.deleted_at IS NULL
               ORDER BY source.updated_at DESC"#,
        )
        .bind(&note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut value = note_to_json(row, folder_path);
        if let Value::Object(fields) = &mut value {
            fields.insert(
                "outgoingLinks".to_string(),
                json!(outgoing
                    .into_iter()
                    .map(|(kind, id)| json!({ "kind": kind, "id": id }))
                    .collect::<Vec<_>>()),
            );
            fields.insert(
                "backlinks".to_string(),
                json!(backlinks
                    .into_iter()
                    .map(|(id, title)| json!({ "id": id, "title": title }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(value)
    }

    async fn snippet_value(&self, row: SnippetRow) -> std::result::Result<Value, McpError> {
        let snippet_id = row.id.clone();
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        let fragments = sqlx::query_as::<_, SnippetFragmentRow>(
            "SELECT id, name, content, language, sort_order, created_at, updated_at FROM snippet_fragments WHERE snippet_id = $1 ORDER BY sort_order, created_at",
        )
        .bind(snippet_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut value = snippet_to_json(row, folder_path);
        if let Value::Object(fields) = &mut value {
            fields.insert(
                "fragments".to_string(),
                json!(fragments
                    .into_iter()
                    .map(|fragment| json!({
                        "id": fragment.id,
                        "name": fragment.name,
                        "content": fragment.content,
                        "language": fragment.language,
                        "sortOrder": fragment.sort_order,
                        "createdAt": fragment.created_at,
                        "updatedAt": fragment.updated_at,
                    }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(value)
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
        sqlx::query_as::<_, ResourceFolderRow>(
            "SELECT * FROM resource_folders WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)
    }

    async fn folder_by_id_including_trashed(
        &self,
        id: &str,
    ) -> std::result::Result<Option<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>("SELECT * FROM resource_folders WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)
    }

    async fn folder_subtree(
        &self,
        id: &str,
    ) -> std::result::Result<Vec<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>(
            "WITH RECURSIVE subtree(id, depth) AS (\
             SELECT id, 0 FROM resource_folders WHERE id = $1 \
             UNION ALL \
             SELECT folder.id, subtree.depth + 1 FROM resource_folders folder \
             JOIN subtree ON folder.parent_id = subtree.id WHERE subtree.depth < 100\
             ) SELECT folder.* FROM resource_folders folder JOIN subtree ON folder.id = subtree.id \
             ORDER BY subtree.depth DESC",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)
    }

    async fn set_folder_subtree_trashed(
        &self,
        id: &str,
        deleted_at: Option<i64>,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let root = self
            .folder_by_id_including_trashed(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        let action = if deleted_at.is_some() {
            "delete"
        } else {
            "update"
        };
        self.ensure_permission(&root.kind, action).await?;
        if is_system_inbox(&root.id) {
            return Err(system_inbox_update_denied(&root.id));
        }
        if deleted_at.is_some() && root.deleted_at.is_some() {
            return Err(not_found("folders", id));
        }
        if deleted_at.is_none() && root.deleted_at.is_none() {
            return Err(invalid_argument(
                "id",
                "Folder is not in trash",
                &["Use resource_folders_trash first"],
            ));
        }
        let folders = self.folder_subtree(id).await?;
        let operation_timestamp = deleted_at.or(root.deleted_at);
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        for folder in &folders {
            let notes_query = if deleted_at.is_some() {
                "UPDATE notes SET deleted_at = $2 WHERE folder_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE notes SET deleted_at = NULL WHERE folder_id = $1 AND deleted_at = $2"
            };
            sqlx::query(notes_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let snippets_query = if deleted_at.is_some() {
                "UPDATE snippets SET deleted_at = $2 WHERE folder_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE snippets SET deleted_at = NULL WHERE folder_id = $1 AND deleted_at = $2"
            };
            sqlx::query(snippets_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let requests_query = if deleted_at.is_some() {
                "UPDATE api_requests SET deleted_at = $2 WHERE collection_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE api_requests SET deleted_at = NULL WHERE collection_id = $1 AND deleted_at = $2"
            };
            sqlx::query(requests_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let collections_query = if deleted_at.is_some() {
                "UPDATE api_collections SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE api_collections SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2"
            };
            sqlx::query(collections_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let folders_query = if deleted_at.is_some() {
                "UPDATE resource_folders SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE resource_folders SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2"
            };
            sqlx::query(folders_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        Ok(root)
    }

    fn emit_folder_subtree_changed(&self, folder: &ResourceFolderRow, action: &str) {
        self.emit_changed("folders", action, Some(folder.id.clone()));
        self.emit_changed(&folder.kind, action, Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", action, Some(folder.id.clone()));
        }
    }

    async fn permanently_delete_folder_subtree(
        &self,
        id: &str,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let root = self
            .folder_by_id_including_trashed(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        self.ensure_permission(&root.kind, "delete").await?;
        if is_system_inbox(&root.id) {
            return Err(system_inbox_update_denied(&root.id));
        }
        if root.deleted_at.is_none() {
            return Err(invalid_argument(
                "id",
                "Only trashed folders can be permanently deleted",
                &["Use resource_folders_trash before permanent deletion"],
            ));
        }
        let folders = self.folder_subtree(id).await?;
        if folders.iter().any(|folder| folder.deleted_at.is_none()) {
            return Err(invalid_argument(
                "id",
                "The folder subtree contains restored folders",
                &["Trash the entire subtree before permanent deletion"],
            ));
        }
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        for folder in &folders {
            for query in [
                "SELECT COUNT(*) FROM notes WHERE folder_id = $1 AND deleted_at IS NULL",
                "SELECT COUNT(*) FROM snippets WHERE folder_id = $1 AND deleted_at IS NULL",
                "SELECT COUNT(*) FROM api_requests WHERE collection_id = $1 AND deleted_at IS NULL",
            ] {
                let active = sqlx::query_scalar::<_, i64>(query)
                    .bind(&folder.id)
                    .fetch_one(&mut *transaction)
                    .await
                    .map_err(db_error)?;
                if active > 0 {
                    return Err(invalid_argument(
                        "id",
                        "The folder subtree contains active resources",
                        &["Trash the entire subtree before permanent deletion"],
                    ));
                }
            }
        }
        for folder in &folders {
            sqlx::query("DELETE FROM notes WHERE folder_id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM snippets WHERE folder_id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query(
                "DELETE FROM api_requests WHERE collection_id = $1 AND deleted_at IS NOT NULL",
            )
            .bind(&folder.id)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
            sqlx::query("DELETE FROM api_collections WHERE id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM resource_folders WHERE id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        Ok(root)
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
            let ancestor = self.folder_by_id(&current_id).await?.ok_or_else(|| {
                invalid_folder_parent("A folder cannot be nested under a trashed ancestor")
            })?;
            cursor = ancestor.parent_id;
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
                "SELECT * FROM resource_folders WHERE kind = 'snippets' AND name = $1 AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC LIMIT 1",
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
                deleted_at: None,
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
            ResourceType::Notes => "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
            ResourceType::Snippets => "SELECT COUNT(*) FROM snippets WHERE deleted_at IS NULL",
            ResourceType::PromptTemplates => "SELECT COUNT(*) FROM user_prompt_templates",
            ResourceType::ApiRequests => {
                "SELECT COUNT(*) FROM api_requests WHERE deleted_at IS NULL"
            }
        };
        sqlx::query_scalar::<_, i64>(query)
            .fetch_one(&self.pool)
            .await
            .map_err(db_error)
    }

    fn emit_changed(&self, resource: &str, action: &str, id: Option<String>) {
        let Some(app) = &self.app else { return };
        let _ = app.emit(
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
        let limit = normalize_limit(args.limit)?;
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
        list_payload(
            "notes",
            self.fetch_resource_values(ResourceType::Notes)
                .await?
                .into_iter()
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
    }

    #[tool(description = "Get one devdrivr note by ID.")]
    async fn notes_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let row = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
        )
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
        let color = args
            .color
            .as_deref()
            .map_or_else(|| Ok("yellow".to_string()), validate_note_color)?;
        let pinned = args.pinned.unwrap_or(false);
        let tags = string_vec_to_db_json(args.tags);
        let folder_id = args.folder_id.unwrap_or_else(|| "notes-inbox".to_string());
        let task_priority = args
            .task_priority
            .as_deref()
            .map(validate_task_priority)
            .transpose()?;
        let task_due_date = args
            .task_due_date
            .as_deref()
            .map(validate_task_due_date)
            .transpose()?;
        let task_status = args
            .task_status
            .as_deref()
            .map(validate_task_status)
            .transpose()?
            .or_else(|| {
                (task_priority.is_some() || task_due_date.is_some()).then(|| "todo".to_string())
            });
        self.require_folder_kind(&folder_id, "notes").await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "INSERT INTO notes (id, title, content, color, pinned, popped_out, created_at, updated_at, tags, folder_id, task_status, task_priority, task_due_date) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(&id)
        .bind(title)
        .bind(&content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(now)
        .bind(now)
        .bind(tags)
        .bind(folder_id)
        .bind(task_status)
        .bind(task_priority)
        .bind(task_due_date)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        Self::replace_note_links(&mut transaction, &id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("notes", "create", Some(id.clone()));
        self.mutation_result(ResourceType::Notes, "create", &id)
            .await
    }

    #[tool(description = "Update a devdrivr note by ID.")]
    async fn notes_update(&self, Parameters(args): Parameters<NoteUpdateArgs>) -> McpResult {
        self.ensure_permission("notes", "update").await?;
        let current = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("notes", &args.id))?;
        let title = args.title.unwrap_or_else(|| current.title.clone());
        let content = args.content.unwrap_or_else(|| current.content.clone());
        let color = args
            .color
            .as_deref()
            .map_or_else(|| Ok(heal_note_color(&current.color)), validate_note_color)?;
        let pinned = args.pinned.unwrap_or(current.pinned == 1);
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| current.tags.unwrap_or_else(|| "[]".to_string()));
        let folder_id = args.folder_id.unwrap_or_else(|| {
            current
                .folder_id
                .unwrap_or_else(|| "notes-inbox".to_string())
        });
        let supplied_task_status = args
            .task_status
            .as_deref()
            .map(validate_task_status)
            .transpose()?;
        let supplied_task_priority = args
            .task_priority
            .as_deref()
            .map(validate_task_priority)
            .transpose()?;
        let supplied_task_due_date = args
            .task_due_date
            .as_deref()
            .map(validate_task_due_date)
            .transpose()?;
        let clear_task_metadata = args.clear_task_metadata.unwrap_or(false);
        if clear_task_metadata
            && (supplied_task_status.is_some()
                || supplied_task_priority.is_some()
                || supplied_task_due_date.is_some())
        {
            return Err(invalid_argument(
                "clearTaskMetadata",
                "Task metadata cannot be supplied while clearing it",
                &["Remove taskStatus, taskPriority, and taskDueDate from this request"],
            ));
        }
        let task_priority = if clear_task_metadata || args.clear_task_priority.unwrap_or(false) {
            None
        } else {
            supplied_task_priority.or(current.task_priority)
        };
        let task_due_date = if clear_task_metadata || args.clear_task_due_date.unwrap_or(false) {
            None
        } else {
            supplied_task_due_date.or(current.task_due_date)
        };
        let task_status = if clear_task_metadata {
            None
        } else {
            supplied_task_status.or(current.task_status).or_else(|| {
                (task_priority.is_some() || task_due_date.is_some()).then(|| "todo".to_string())
            })
        };
        self.require_folder_kind(&folder_id, "notes").await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, folder_id=$7, updated_at=$8, task_status=$9, task_priority=$10, task_due_date=$11 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(title)
        .bind(&content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(tags)
        .bind(folder_id)
        .bind(now_ms())
        .bind(task_status)
        .bind(task_priority)
        .bind(task_due_date)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        Self::replace_note_links(&mut transaction, &args.id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("notes", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::Notes, "update", &args.id)
            .await
    }

    #[tool(description = "Move a devdrivr note to durable Trash by ID.")]
    async fn notes_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "delete").await?;
        let result =
            sqlx::query("UPDATE notes SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL")
                .bind(&args.id)
                .bind(now_ms())
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("notes", &args.id));
        }
        self.emit_changed("notes", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
    }

    #[tool(description = "List devdrivr snippets. Returns JSON snippet records.")]
    async fn snippets_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        list_payload(
            "snippets",
            self.fetch_resource_values(ResourceType::Snippets)
                .await?
                .into_iter()
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
    }

    #[tool(description = "Get one devdrivr snippet by ID.")]
    async fn snippets_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let row = sqlx::query_as::<_, SnippetRow>(
            "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
        )
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
        let fragments = normalize_snippet_fragments(args.fragments, args.content, args.language)?;
        let primary = &fragments[0];
        let (folder_id, folder, created_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, None)
            .await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "INSERT INTO snippets (id, title, content, language, description, tags, folder, folder_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(&id)
        .bind(args.title)
        .bind(&primary.2)
        .bind(&primary.3)
        .bind(args.description.unwrap_or_default())
        .bind(string_vec_to_db_json(args.tags))
        .bind(folder)
        .bind(folder_id)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        Self::replace_snippet_fragments(&mut transaction, &id, &fragments, now).await?;
        transaction.commit().await.map_err(db_error)?;
        if created_folder {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "create", Some(id.clone()));
        self.mutation_result(ResourceType::Snippets, "create", &id)
            .await
    }

    #[tool(description = "Update a devdrivr snippet by ID.")]
    async fn snippets_update(&self, Parameters(args): Parameters<SnippetUpdateArgs>) -> McpResult {
        self.ensure_permission("snippets", "update").await?;
        let current = sqlx::query_as::<_, SnippetRow>(
            "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("snippets", &args.id))?;
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| current.tags.clone());
        let replacement_fragments = args
            .fragments
            .map(|fragments| normalize_snippet_fragments(Some(fragments), None, None))
            .transpose()?;
        let content = replacement_fragments
            .as_ref()
            .map(|fragments| fragments[0].2.clone())
            .or(args.content)
            .unwrap_or_else(|| current.content.clone());
        let language = replacement_fragments
            .as_ref()
            .map(|fragments| fragments[0].3.clone())
            .or(args.language)
            .unwrap_or_else(|| current.language.clone());
        let (folder_id, folder, created_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, Some(&current))
            .await?;
        let now = now_ms();
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "UPDATE snippets SET title=$2, content=$3, language=$4, description=$5, tags=$6, folder=$7, folder_id=$8, updated_at=$9 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(args.title.unwrap_or(current.title))
        .bind(&content)
        .bind(&language)
        .bind(args.description.unwrap_or(current.description))
        .bind(tags)
        .bind(folder)
        .bind(folder_id)
        .bind(now)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        if let Some(fragments) = replacement_fragments {
            Self::replace_snippet_fragments(&mut transaction, &args.id, &fragments, now).await?;
        } else {
            sqlx::query(
                "UPDATE snippet_fragments SET content=$2, language=$3, updated_at=$4 WHERE id = (SELECT id FROM snippet_fragments WHERE snippet_id=$1 ORDER BY sort_order LIMIT 1)",
            )
            .bind(&args.id)
            .bind(content)
            .bind(language)
            .bind(now)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        if created_folder {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::Snippets, "update", &args.id)
            .await
    }

    #[tool(description = "Move a devdrivr snippet to durable Trash by ID.")]
    async fn snippets_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "delete").await?;
        let result =
            sqlx::query("UPDATE snippets SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL")
                .bind(&args.id)
                .bind(now_ms())
                .execute(&self.pool)
                .await
                .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("snippets", &args.id));
        }
        self.emit_changed("snippets", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
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
        list_payload(
            "promptTemplates",
            rows.into_iter()
                .map(prompt_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
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
        .bind(
            args.category
                .as_deref()
                .map_or_else(|| Ok("productivity".to_string()), validate_template_category)?,
        )
        .bind(string_vec_to_db_json(args.tags))
        .bind(&args.prompt)
        .bind(normalize_prompt_variables(args.variables)?)
        .bind(estimated_tokens(&args.prompt))
        .bind(
            args.optimized_for
                .as_deref()
                .map_or_else(|| Ok("Generic".to_string()), validate_template_optimized_for)?,
        )
        .bind(args.version.unwrap_or_else(|| "1.0.0".to_string()))
        .bind(string_vec_to_db_json(args.tips))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("promptTemplates", "create", Some(id.clone()));
        self.mutation_result(ResourceType::PromptTemplates, "create", &id)
            .await
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
        // A built-in is never edited in place: the update becomes a new user-owned record. That
        // is a create, so it needs the create permission as well. Charging it to `update` alone
        // let an update-only grant add rows.
        let target_id = if current.author == "builtin" {
            self.ensure_permission("promptTemplates", "create").await?;
            Uuid::new_v4().to_string()
        } else {
            current.id.clone()
        };
        let now = now_ms();
        let prompt = args.prompt.unwrap_or(current.prompt);
        let variables = match args.variables {
            Some(value) => normalize_prompt_variables(Some(value))?,
            None => current.variables_schema,
        };
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
        .bind(
            args.category
                .as_deref()
                .map_or_else(|| Ok(heal_template_category(&current.category)), validate_template_category)?,
        )
        .bind(tags)
        .bind(&prompt)
        .bind(variables)
        .bind(estimated_tokens(&prompt))
        .bind(
            args.optimized_for
                .as_deref()
                .map_or_else(
                    || Ok(heal_template_optimized_for(&current.optimized_for)),
                    validate_template_optimized_for,
                )?,
        )
        .bind(args.version.unwrap_or(current.version))
        .bind(tips)
        .bind(if current.author == "builtin" { now } else { current.created_at })
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("promptTemplates", "update", Some(target_id.clone()));
        self.mutation_result(ResourceType::PromptTemplates, "update", &target_id)
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
            "WITH RECURSIVE active_folders(id) AS (\
             SELECT id FROM resource_folders WHERE parent_id IS NULL AND deleted_at IS NULL \
             UNION ALL \
             SELECT child.id FROM resource_folders child JOIN active_folders parent ON child.parent_id = parent.id WHERE child.deleted_at IS NULL\
             ) SELECT folder.* FROM resource_folders folder JOIN active_folders ON folder.id = active_folders.id \
             ORDER BY folder.kind ASC, folder.parent_id ASC, folder.sort_order ASC, folder.name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        list_payload(
            "folders",
            rows.into_iter()
                .filter(|folder| kinds.contains(&folder.kind.as_str()))
                .map(resource_folder_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
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
        // CAST keeps the result SQLITE_FLOAT. SQLite gives an expression no column affinity, so
        // the literal 0 that COALESCE returns for an empty parent stays an INTEGER and sqlx
        // refuses to decode it as f64. That is what blocks the first folder under a new parent.
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE kind = $1 AND deleted_at IS NULL AND ((parent_id IS NULL AND $2 IS NULL) OR parent_id = $2)",
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
            deleted_at: None,
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
        description = "Rename or update an active shared resource folder. Use the dedicated Trash tools for deletion and recovery."
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
        // CAST keeps the result SQLITE_FLOAT. See the note in resource_folders_create.
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE kind = $1 AND id <> $2 AND deleted_at IS NULL AND ((parent_id IS NULL AND $3 IS NULL) OR parent_id = $3)",
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

    #[tool(
        description = "Move a folder subtree and its contained resources to trash. This never executes or exports saved API requests."
    )]
    async fn resource_folders_trash(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        let folder = self
            .set_folder_subtree_trashed(&args.id, Some(now_ms()))
            .await?;
        self.emit_folder_subtree_changed(&folder, "delete");
        to_json_text(json!({ "trashed": true, "id": folder.id }))
    }

    #[tool(
        description = "Restore a trashed folder subtree and its contained resources. This never executes or exports saved API requests."
    )]
    async fn resource_folders_restore(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        let folder = self.set_folder_subtree_trashed(&args.id, None).await?;
        self.emit_folder_subtree_changed(&folder, "update");
        to_json_text(json!({ "restored": true, "id": folder.id }))
    }

    #[tool(
        description = "Permanently delete a trashed folder subtree and trashed contained resources. This operation cannot be undone and never executes or exports API requests."
    )]
    async fn resource_folders_permanent_delete(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        let folder = self.permanently_delete_folder_subtree(&args.id).await?;
        self.emit_folder_subtree_changed(&folder, "delete");
        to_json_text(json!({ "permanentlyDeleted": true, "id": folder.id }))
    }

    #[tool(
        description = "Permanently delete all trashed resources and folder subtrees for one kind. This cannot be undone and never executes or exports API requests."
    )]
    async fn resource_folders_empty_trash(
        &self,
        Parameters(args): Parameters<EmptyTrashArgs>,
    ) -> McpResult {
        let kind = parse_folder_kind(&args.kind)?;
        self.ensure_permission(kind, "delete").await?;
        let roots = sqlx::query_scalar::<_, String>(
            "SELECT folder.id FROM resource_folders folder WHERE folder.kind = $1 AND folder.deleted_at IS NOT NULL \
             AND (folder.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM resource_folders parent WHERE parent.id = folder.parent_id AND parent.deleted_at IS NOT NULL))",
        )
        .bind(kind)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut deleted_folders = 0usize;
        for id in roots {
            self.permanently_delete_folder_subtree(&id).await?;
            deleted_folders += 1;
        }
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        let deleted_resources = match kind {
            "notes" => sqlx::query("DELETE FROM notes WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            "snippets" => sqlx::query("DELETE FROM snippets WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            "apiRequests" => sqlx::query("DELETE FROM api_requests WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            _ => unreachable!(),
        };
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("folders", "delete", None);
        self.emit_changed(kind, "delete", None);
        if kind == "apiRequests" {
            self.emit_changed("apiCollections", "delete", None);
        }
        to_json_text(json!({
            "permanentlyDeleted": true,
            "folderSubtrees": deleted_folders,
            "resources": deleted_resources,
        }))
    }

    #[tool(description = "List API client collections for assigning saved requests.")]
    async fn api_collections_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let rows = sqlx::query_as::<_, ApiCollectionRow>(
            "SELECT collection.* FROM api_collections collection WHERE collection.deleted_at IS NULL AND (collection.parent_id IS NULL OR EXISTS (SELECT 1 FROM resource_folders parent WHERE parent.id = collection.parent_id AND parent.deleted_at IS NULL)) ORDER BY collection.name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        list_payload(
            "apiCollections",
            rows.into_iter()
                .map(api_collection_to_json)
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
    }

    #[tool(
        description = "List saved API client requests. Auth secrets are redacted unless allowed."
    )]
    async fn api_requests_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        list_payload(
            "apiRequests",
            self.fetch_resource_values(ResourceType::ApiRequests)
                .await?
                .into_iter()
                .filter(|value| matches_query(value, &args.query))
                .collect(),
            args.limit,
        )
    }

    #[tool(description = "Get one saved API client request by ID.")]
    async fn api_requests_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let row = sqlx::query_as::<_, ApiRequestRow>(
            "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
        )
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
        .bind(normalize_api_headers(args.headers)?)
        .bind(args.body.unwrap_or_default())
        .bind(args.body_mode.unwrap_or_else(|| "json".to_string()))
        .bind(match args.auth {
            Some(auth) => normalize_api_auth(strip_redaction_marker(auth))?,
            None => r#"{"type":"none"}"#.to_string(),
        })
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("apiRequests", "create", Some(id.clone()));
        self.mutation_result(ResourceType::ApiRequests, "create", &id)
            .await
    }

    #[tool(description = "Update a saved API client request by ID.")]
    async fn api_requests_update(
        &self,
        Parameters(args): Parameters<ApiRequestUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "update").await?;
        let current = sqlx::query_as::<_, ApiRequestRow>(
            "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("apiRequests", &args.id))?;
        let auth = match args.auth {
            Some(value) => {
                // Resolve first: the redaction marker restores the secret the client never saw.
                let resolved = resolve_auth_update(value, &current.auth);
                normalize_api_auth(parse_json(&resolved, json!({ "type": "none" })))?
            }
            None => current.auth,
        };
        let headers = match args.headers {
            Some(value) => normalize_api_headers(Some(value))?,
            None => current.headers,
        };
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
        self.mutation_result(ResourceType::ApiRequests, "update", &args.id)
            .await
    }

    #[tool(description = "Move a saved API client request to durable Trash by ID.")]
    async fn api_requests_delete(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "delete").await?;
        let result = sqlx::query(
            "UPDATE api_requests SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found("apiRequests", &args.id));
        }
        self.emit_changed("apiRequests", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
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
    use crate::mcp::types::McpPermissions;

    /// The production migrations, in the order `lib.rs` applies them.
    ///
    /// Included from the same files the app ships, so a schema change reaches the tests instead
    /// of leaving them passing against a hand-written schema that no longer exists.
    const MIGRATIONS: [&str; 16] = [
        include_str!("../../migrations/001_initial.sql"),
        include_str!("../../migrations/002_api_client.sql"),
        include_str!("../../migrations/003_notes_tags.sql"),
        include_str!("../../migrations/004_history_metadata.sql"),
        include_str!("../../migrations/005_snippets_folder.sql"),
        include_str!("../../migrations/006_prompt_templates.sql"),
        include_str!("../../migrations/007_prompt_template_authors.sql"),
        include_str!("../../migrations/008_notes_sort_order.sql"),
        include_str!("../../migrations/009_persistence_backfills.sql"),
        include_str!("../../migrations/011_api_history_response.sql"),
        include_str!("../../migrations/012_snippets_favorite.sql"),
        include_str!("../../migrations/013_resource_folders.sql"),
        include_str!("../../migrations/014_durable_trash.sql"),
        include_str!("../../migrations/015_note_tasks.sql"),
        include_str!("../../migrations/016_note_links.sql"),
        include_str!("../../migrations/017_snippet_fragments.sql"),
    ];

    fn resource_permissions(
        read: bool,
        create: bool,
        update: bool,
        delete: bool,
    ) -> ResourcePermissions {
        ResourcePermissions {
            read,
            create,
            update,
            delete,
        }
    }

    fn all_permissions(value: ResourcePermissions) -> McpPermissions {
        McpPermissions {
            notes: value.clone(),
            snippets: value.clone(),
            prompt_templates: value.clone(),
            api_requests: value,
        }
    }

    fn settings_with(permissions: McpPermissions) -> McpSettings {
        McpSettings {
            enabled: true,
            host: "127.0.0.1".to_string(),
            port: 17347,
            api_key: "test-key".to_string(),
            permissions,
            api_requests_expose_secrets: false,
        }
    }

    /// Build a service against an in-memory database carrying the real schema.
    ///
    /// WARNING: `sqlite::memory:` gives each connection its own database, so the pool is capped
    /// at one connection. A larger pool would run the migrations on one connection and the
    /// queries on an empty one.
    async fn service_with(permissions: McpPermissions) -> DevdrivrMcpService {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("pool");
        for migration in MIGRATIONS {
            // `raw_sql` runs a multi-statement script. Splitting on `;` would cut trigger bodies
            // in half, because a BEGIN ... END block contains its own statement terminators.
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .unwrap_or_else(|err| panic!("migration failed: {err}"));
        }
        DevdrivrMcpService::new_detached(pool, Arc::new(RwLock::new(settings_with(permissions))))
    }

    /// The tool handlers return JSON inside a text content block. Parse it back out.
    fn result_json(result: &CallToolResult) -> Value {
        let text = result
            .content
            .first()
            .and_then(|content| content.as_text())
            .map(|text| text.text.clone())
            .expect("a text content block");
        serde_json::from_str(&text).expect("valid JSON in the content block")
    }

    fn note_create_args(title: &str) -> NoteCreateArgs {
        serde_json::from_value(json!({ "title": title, "content": "body" }))
            .expect("note create args")
    }

    /// A committed write must never be reported as a failure.
    ///
    /// Settings grants create, update, delete and read independently, so returning the record
    /// through the read-gated getter answered a successful write with PERMISSION_DENIED, and an
    /// agent that retried wrote the row twice.
    /// A list without a limit returned every row. `limit: 0` returned one row instead of an error.
    mod list_bounds {
        use super::*;

        async fn service_with_notes(count: usize) -> DevdrivrMcpService {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            for index in 0..count {
                service
                    .notes_create(Parameters(note_create_args(&format!("note {index}"))))
                    .await
                    .expect("create a note");
            }
            service
        }

        fn list_args(limit: Option<i64>) -> ListArgs {
            let mut value = json!({});
            if let (Value::Object(obj), Some(limit)) = (&mut value, limit) {
                obj.insert("limit".to_string(), json!(limit));
            }
            serde_json::from_value(value).expect("list args")
        }

        #[tokio::test]
        async fn an_absent_limit_returns_the_default_page() {
            let service = service_with_notes(52).await;
            let result = service
                .notes_list(Parameters(list_args(None)))
                .await
                .expect("list");
            let json = result_json(&result);
            assert_eq!(json["notes"].as_array().expect("notes").len(), 50);
            assert_eq!(json["total"], 52);
            assert_eq!(json["limit"], 50);
            assert_eq!(json["hasMore"], true);
        }

        #[tokio::test]
        async fn a_full_page_reports_no_more() {
            let service = service_with_notes(3).await;
            let json = result_json(
                &service
                    .notes_list(Parameters(list_args(Some(3))))
                    .await
                    .expect("list"),
            );
            assert_eq!(json["notes"].as_array().expect("notes").len(), 3);
            assert_eq!(json["hasMore"], false);
        }

        #[tokio::test]
        async fn a_limit_above_the_cap_is_clamped() {
            let service = service_with_notes(1).await;
            let json = result_json(
                &service
                    .notes_list(Parameters(list_args(Some(9_000))))
                    .await
                    .expect("list"),
            );
            assert_eq!(json["limit"], 500);
        }

        #[tokio::test]
        async fn a_non_positive_limit_is_rejected() {
            let service = service_with_notes(1).await;
            let error = service
                .notes_list(Parameters(list_args(Some(0))))
                .await
                .expect_err("zero limit must fail");
            assert!(error.message.contains("greater than zero"));
        }
    }

    mod committed_writes_always_report_success {
        use super::*;

        async fn write_only_service() -> DevdrivrMcpService {
            service_with(all_permissions(resource_permissions(
                false, true, true, true,
            )))
            .await
        }

        #[tokio::test]
        async fn create_succeeds_without_read_permission() {
            let service = write_only_service().await;

            let result = service
                .notes_create(Parameters(note_create_args("Written blind")))
                .await
                .expect("a create granted create must not fail on read");

            let payload = result_json(&result);
            assert_eq!(payload["action"], "create");
            assert_eq!(payload["resource"], "notes");
            assert!(payload["id"].is_string());
            // Withholding read must withhold the record, not the receipt.
            assert!(payload.get("record").is_none());
        }

        #[tokio::test]
        async fn create_writes_exactly_one_row_without_read_permission() {
            let service = write_only_service().await;

            service
                .notes_create(Parameters(note_create_args("Written once")))
                .await
                .expect("create");

            let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM notes")
                .fetch_one(&service.pool)
                .await
                .expect("count");
            assert_eq!(count, 1);
        }

        #[tokio::test]
        async fn update_succeeds_without_read_permission() {
            let service = write_only_service().await;
            let created = result_json(
                &service
                    .notes_create(Parameters(note_create_args("Before")))
                    .await
                    .expect("create"),
            );
            let id = created["id"].as_str().expect("id").to_string();

            let result = service
                .notes_update(Parameters(
                    serde_json::from_value(json!({ "id": id, "title": "After" }))
                        .expect("update args"),
                ))
                .await
                .expect("an update granted update must not fail on read");

            assert_eq!(result_json(&result)["action"], "update");
            let title = sqlx::query_scalar::<_, String>("SELECT title FROM notes WHERE id = $1")
                .bind(&id)
                .fetch_one(&service.pool)
                .await
                .expect("title");
            assert_eq!(title, "After");
        }

        #[tokio::test]
        async fn the_record_rides_along_when_read_is_granted() {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;

            let payload = result_json(
                &service
                    .notes_create(Parameters(note_create_args("Readable")))
                    .await
                    .expect("create"),
            );

            assert_eq!(payload["record"]["title"], "Readable");
            assert_eq!(payload["record"]["content"], "body");
        }

        /// Updating a built-in template inserts a new user-owned row. That is a create, so an
        /// update-only grant must not be able to do it.
        #[tokio::test]
        async fn cloning_a_builtin_template_needs_create_permission() {
            let service = service_with(all_permissions(resource_permissions(
                true, false, true, false,
            )))
            .await;
            sqlx::query(
                "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ('builtin-1', 'Built in', 'desc', 'general', '[]', 'text', '[]', 1, 'claude', 'builtin', '1', '[]', 1, 1)",
            )
            .execute(&service.pool)
            .await
            .expect("seed a built-in template");

            let error = service
                .prompt_templates_update(Parameters(
                    serde_json::from_value(json!({ "id": "builtin-1", "prompt": "changed" }))
                        .expect("update args"),
                ))
                .await
                .expect_err("cloning a built-in without create permission must fail");

            assert!(error.message.contains("promptTemplates.create"));
            let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_prompt_templates")
                .fetch_one(&service.pool)
                .await
                .expect("count");
            assert_eq!(count, 1, "the clone must not have been written");
        }

        #[tokio::test]
        async fn create_is_still_refused_without_create_permission() {
            let service = service_with(all_permissions(resource_permissions(
                true, false, true, true,
            )))
            .await;

            let error = service
                .notes_create(Parameters(note_create_args("Refused")))
                .await
                .expect_err("create without the create permission must fail");

            assert!(error.message.contains("notes.create"));
            let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM notes")
                .fetch_one(&service.pool)
                .await
                .expect("count");
            assert_eq!(count, 0, "a refused create must not reach the database");
        }
    }

    /// The two folder tools read `MAX(sort_order)` through this expression. Creating the first
    /// child of a parent leaves no rows to aggregate, so the expression must still decode as f64.
    const MAX_SORT_ORDER_EXPRESSION: &str = "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE parent_id = $1";

    async fn folder_sort_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.expect("pool");
        sqlx::query("CREATE TABLE resource_folders (id TEXT PRIMARY KEY, parent_id TEXT, sort_order REAL NOT NULL DEFAULT 0)")
            .execute(&pool)
            .await
            .expect("schema");
        pool
    }

    #[tokio::test]
    async fn folder_sort_order_decodes_when_the_parent_has_no_children_yet() {
        let pool = folder_sort_pool().await;
        let max_sort = sqlx::query_scalar::<_, f64>(MAX_SORT_ORDER_EXPRESSION)
            .bind("empty-parent")
            .fetch_one(&pool)
            .await
            .expect("an empty parent must not fail to decode");
        assert_eq!(max_sort, 0.0);
    }

    #[tokio::test]
    async fn folder_sort_order_reads_the_highest_existing_sibling() {
        let pool = folder_sort_pool().await;
        sqlx::query("INSERT INTO resource_folders (id, parent_id, sort_order) VALUES ('a', 'parent', 1000.0), ('b', 'parent', 2000.0)")
            .execute(&pool)
            .await
            .expect("seed");
        let max_sort = sqlx::query_scalar::<_, f64>(MAX_SORT_ORDER_EXPRESSION)
            .bind("parent")
            .fetch_one(&pool)
            .await
            .expect("decode");
        assert_eq!(max_sort + FOLDER_SORT_STEP, 3000.0);
    }

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
            deleted_at: None,
        }
    }

    fn task_note_row() -> NoteRow {
        NoteRow {
            id: "note-task-1".to_string(),
            title: "Ship release".to_string(),
            content: "Keep the full note body".to_string(),
            color: "yellow".to_string(),
            pinned: 0,
            popped_out: 0,
            window_x: None,
            window_y: None,
            window_width: None,
            window_height: None,
            created_at: 1,
            updated_at: 2,
            tags: Some(r#"["release"]"#.to_string()),
            folder_id: Some("notes-inbox".to_string()),
            deleted_at: None,
            task_status: Some("in_progress".to_string()),
            task_priority: Some("high".to_string()),
            task_due_date: Some("2026-09-08".to_string()),
        }
    }

    #[test]
    fn note_json_serializes_structured_task_metadata() {
        let value = note_to_json(task_note_row(), vec!["Inbox".to_string()]);

        assert_eq!(value["taskStatus"], "in_progress");
        assert_eq!(value["taskPriority"], "high");
        assert_eq!(value["taskDueDate"], "2026-09-08");
        assert_eq!(value["content"], "Keep the full note body");
        assert_eq!(value["folderPath"], json!(["Inbox"]));
    }

    #[test]
    fn task_metadata_validation_rejects_invalid_values_and_dates() {
        assert!(validate_task_status("blocked").is_ok());
        assert!(validate_task_priority("high").is_ok());
        assert!(validate_task_due_date("2024-02-29").is_ok());
        assert!(validate_task_status("waiting").is_err());
        assert!(validate_task_priority("urgent").is_err());
        assert!(validate_task_due_date("2026-02-29").is_err());
        assert!(validate_task_due_date("2026-9-8").is_err());
    }

    #[test]
    fn stable_note_links_are_deduplicated_without_guessing_legacy_titles() {
        let targets = stable_note_link_targets(
            "[[note:note-1|Plan]] [[snippet:snippet-1|Helper]] [[note:note-1|Renamed]] [[Legacy]]",
        );

        assert_eq!(
            targets,
            vec![
                ("note".to_string(), "note-1".to_string()),
                ("snippet".to_string(), "snippet-1".to_string()),
            ]
        );
    }

    #[test]
    fn snippet_fragments_preserve_order_and_require_readable_names() {
        let fragments = normalize_snippet_fragments(
            Some(vec![
                SnippetFragmentInput {
                    id: Some("client".to_string()),
                    name: "client.ts".to_string(),
                    content: "fetch(url)".to_string(),
                    language: Some("typescript".to_string()),
                },
                SnippetFragmentInput {
                    id: Some("styles".to_string()),
                    name: "styles.css".to_string(),
                    content: ".root {}".to_string(),
                    language: Some("css".to_string()),
                },
            ]),
            None,
            None,
        )
        .expect("valid fragments");

        assert_eq!(fragments[0].0, "client");
        assert_eq!(fragments[1].1, "styles.css");
        assert!(normalize_snippet_fragments(Some(Vec::new()), None, None).is_err());
        assert!(normalize_snippet_fragments(
            Some(vec![SnippetFragmentInput {
                id: None,
                name: "  ".to_string(),
                content: String::new(),
                language: None,
            }]),
            None,
            None,
        )
        .is_err());
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
    fn resource_json_does_not_expose_internal_tombstone_metadata() {
        let mut row = api_request_with_auth(json!({ "type": "none" }));
        row.deleted_at = Some(123);

        let value = api_request_to_json(row, vec!["Inbox".to_string()], false);

        assert!(value.get("deletedAt").is_none());
        assert_eq!(value["folderPath"], json!(["Inbox"]));
    }

    #[test]
    fn an_update_heals_a_stored_value_an_earlier_import_left_invalid() {
        assert_eq!(heal_note_color("teal"), "yellow");
        assert_eq!(heal_note_color("purple"), "purple");
        assert_eq!(heal_template_category("general"), "productivity");
        assert_eq!(heal_template_category("docs"), "docs");
        assert_eq!(heal_template_optimized_for("GPT-4"), "Generic");
        assert_eq!(heal_template_optimized_for("Cursor"), "Cursor");
    }

    #[test]
    fn note_color_accepts_only_values_the_tool_can_load() {
        assert_eq!(validate_note_color("purple").expect("purple"), "purple");
        assert!(validate_note_color("teal").is_err());
        assert!(validate_note_color("Yellow").is_err());
        assert!(validate_note_color("#ffcc00").is_err());
    }

    #[test]
    fn template_enums_accept_only_values_the_tool_can_load() {
        assert_eq!(validate_template_category("docs").expect("docs"), "docs");
        assert_eq!(
            validate_template_optimized_for("Claude").expect("Claude"),
            "Claude"
        );
        assert!(validate_template_category("general").is_err());
        assert!(validate_template_category("Docs").is_err());
        assert!(validate_template_optimized_for("GPT-4").is_err());
        assert!(validate_template_optimized_for("claude").is_err());
    }

    #[test]
    fn prompt_variables_normalize_to_the_shape_the_tool_renders() {
        let normalized = normalize_prompt_variables(Some(json!([
            { "name": " code ", "type": "textarea", "required": true },
            { "name": "lang", "label": "Language", "type": "select", "options": ["ts", " ", "rs"] },
        ])))
        .expect("normalize");

        assert_eq!(
            parse_json(&normalized, json!([])),
            json!([
                { "name": "code", "label": "code", "type": "textarea", "required": true },
                { "name": "lang", "label": "Language", "type": "select", "options": ["ts", "rs"] },
            ])
        );
        assert_eq!(normalize_prompt_variables(None).expect("absent"), "[]");
    }

    #[test]
    fn prompt_variables_reject_what_the_tool_would_discard() {
        assert!(normalize_prompt_variables(Some(json!({ "code": "text" }))).is_err());
        assert!(normalize_prompt_variables(Some(json!([{ "label": "No name" }]))).is_err());
        assert!(
            normalize_prompt_variables(Some(json!([{ "name": "x", "type": "date" }]))).is_err()
        );
        assert!(
            normalize_prompt_variables(Some(json!([{ "name": "x", "type": "select" }]))).is_err()
        );
        assert!(normalize_prompt_variables(Some(
            json!([{ "name": "x", "type": "select", "options": [" "] }])
        ))
        .is_err());
    }

    #[test]
    fn api_headers_normalize_arrays_maps_and_missing_values() {
        let from_array = normalize_api_headers(Some(json!([
            { "key": "Accept", "value": "application/json" },
            { "key": "X-Trace", "value": "abc", "enabled": false },
        ])))
        .expect("array");
        assert_eq!(
            parse_json(&from_array, json!([])),
            json!([
                { "key": "Accept", "value": "application/json", "enabled": true },
                { "key": "X-Trace", "value": "abc", "enabled": false },
            ])
        );

        let from_map =
            normalize_api_headers(Some(json!({ "Accept": "application/json" }))).expect("map");
        assert_eq!(
            parse_json(&from_map, json!([])),
            json!([{ "key": "Accept", "value": "application/json", "enabled": true }])
        );

        assert_eq!(normalize_api_headers(None).expect("absent"), "[]");
        assert_eq!(
            normalize_api_headers(Some(json!(null))).expect("null"),
            "[]"
        );
    }

    #[test]
    fn api_headers_reject_shapes_the_api_client_cannot_render() {
        assert!(normalize_api_headers(Some(json!("Accept: application/json"))).is_err());
        assert!(normalize_api_headers(Some(json!([{ "value": "no-key" }]))).is_err());
        assert!(normalize_api_headers(Some(json!([{ "key": "Accept", "value": ["a"] }]))).is_err());
        assert!(normalize_api_headers(Some(json!({ "Accept": { "nested": true } }))).is_err());
    }

    #[test]
    fn api_auth_normalizes_each_supported_type_and_rejects_the_rest() {
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "none" })).expect("none"),
                json!({})
            ),
            json!({ "type": "none" })
        );
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "bearer", "token": "t" })).expect("bearer"),
                json!({})
            ),
            json!({ "type": "bearer", "token": "t" })
        );
        // Unknown keys are dropped so the stored row matches the ApiRequestAuth union exactly.
        assert_eq!(
            parse_json(
                &normalize_api_auth(
                    json!({ "type": "basic", "username": "u", "password": "p", "realm": "x" })
                )
                .expect("basic"),
                json!({})
            ),
            json!({ "type": "basic", "username": "u", "password": "p" })
        );

        assert!(normalize_api_auth(json!("bearer")).is_err());
        assert!(normalize_api_auth(json!({ "token": "t" })).is_err());
        assert!(normalize_api_auth(json!({ "type": "oauth2" })).is_err());
    }

    #[test]
    fn api_auth_rejects_a_credential_it_would_otherwise_erase() {
        assert!(normalize_api_auth(json!({ "type": "bearer", "token": 12345 })).is_err());
        assert!(
            normalize_api_auth(json!({ "type": "basic", "username": "u", "password": 1 })).is_err()
        );
        // An absent credential is still allowed, and reads as empty.
        assert_eq!(
            parse_json(
                &normalize_api_auth(json!({ "type": "bearer" })).expect("absent token"),
                json!({})
            ),
            json!({ "type": "bearer", "token": "" })
        );
    }

    #[test]
    fn api_headers_reject_a_non_boolean_enabled_rather_than_switching_it_on() {
        assert!(
            normalize_api_headers(Some(json!([{ "key": "A", "value": "b", "enabled": 0 }])))
                .is_err()
        );
        assert!(normalize_api_headers(Some(
            json!([{ "key": "A", "value": "b", "enabled": "false" }])
        ))
        .is_err());
    }

    #[test]
    fn prompt_variables_reject_a_non_text_option_instead_of_dropping_it() {
        assert!(normalize_prompt_variables(Some(
            json!([{ "name": "lang", "type": "select", "options": ["ts", 42] }])
        ))
        .is_err());
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
    fn limit_defaults_clamps_and_rejects_invalid_values() {
        assert_eq!(normalize_limit(None).unwrap(), 50);
        assert_eq!(normalize_limit(Some(999)).unwrap(), 500);

        let err = normalize_limit(Some(0)).expect_err("zero limit should fail");
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
            deleted_at: None,
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
