use std::{cmp::Ordering, sync::Arc, time::Duration};

use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ServerCapabilities, ServerInfo},
    schemars, tool, tool_router, ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::{McpDataChangedEvent, McpSettings, ResourcePermissions};

mod api_requests;
mod args;
mod discovery;
mod errors;
mod folders;
mod notes;
mod paging;
mod prompt_templates;
mod rows;
mod snippets;
mod trash;
mod validation;

use args::*;
use errors::*;
use paging::*;
use rows::*;
use validation::*;

type SharedSettings = Arc<RwLock<McpSettings>>;
type McpResult = std::result::Result<CallToolResult, McpError>;
const REDACTED_AUTH_VALUE: &str = "***REDACTED***";
const DEFAULT_RESULT_LIMIT: i64 = 50;
const MAX_RESULT_LIMIT: i64 = 500;
const MAX_MULTI_GET: usize = 100;
/// Longest string accepted in any tool argument. A note or a request body fits comfortably.
const MAX_TEXT_FIELD_BYTES: usize = 1024 * 1024;
/// Longest array accepted in any tool argument, such as tags, headers or variables.
const MAX_ARRAY_ITEMS: usize = 1000;
/// Deepest nesting accepted in any tool argument. Guards the recursive walk itself.
const MAX_ARGUMENT_DEPTH: usize = 32;
/// Longest a single tool call may run. Every tool reads a local database, so this only fires
/// when something is stuck.
const TOOL_TIMEOUT: Duration = Duration::from_secs(30);
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

fn resource_display_name(resource: &str) -> &str {
    match resource {
        "notes" => "note",
        "snippets" => "snippet",
        "promptTemplates" => "prompt template",
        "apiRequests" => "API request",
        other => other,
    }
}

/// Reject a tool argument that is too large to process.
///
/// The transport caps a whole request. This caps the parts, so an oversized field is answered
/// with the field that broke the budget instead of a bare transport error.
///
/// Runs before the arguments are deserialised, so it covers every tool at once.
fn check_argument_budget(value: &Value, depth: usize) -> std::result::Result<(), McpError> {
    if depth > MAX_ARGUMENT_DEPTH {
        return Err(resource_limit(
            format!("Arguments nest deeper than {MAX_ARGUMENT_DEPTH} levels"),
            &["Flatten the argument structure"],
        ));
    }
    match value {
        Value::String(text) if text.len() > MAX_TEXT_FIELD_BYTES => Err(resource_limit(
            format!(
                "A text field is {} bytes; maximum is {MAX_TEXT_FIELD_BYTES}",
                text.len()
            ),
            &[
                "Split the content across several records",
                "Store large payloads outside devdrivr and keep a reference",
            ],
        )),
        Value::Array(items) if items.len() > MAX_ARRAY_ITEMS => Err(resource_limit(
            format!(
                "A list field has {} items; maximum is {MAX_ARRAY_ITEMS}",
                items.len()
            ),
            &["Send fewer items per call"],
        )),
        Value::Array(items) => items
            .iter()
            .try_for_each(|item| check_argument_budget(item, depth + 1)),
        Value::Object(entries) if entries.len() > MAX_ARRAY_ITEMS => Err(resource_limit(
            format!(
                "An object field has {} keys; maximum is {MAX_ARRAY_ITEMS}",
                entries.len()
            ),
            &["Send fewer keys per call"],
        )),
        Value::Object(entries) => entries
            .values()
            .try_for_each(|item| check_argument_budget(item, depth + 1)),
        _ => Ok(()),
    }
}

/// Guard a write against a record that changed since the caller read it.
///
/// Two agents editing one note both read, both wrote, and the second silently discarded the
/// first. A caller that passes the `updatedAt` it read is told instead.
///
/// Omitting `expectedUpdatedAt` keeps the previous last-writer-wins behaviour.
fn check_expected_updated_at(
    resource: &str,
    id: &str,
    expected: Option<i64>,
    actual: i64,
) -> std::result::Result<(), McpError> {
    match expected {
        Some(expected) if expected != actual => {
            Err(version_conflict(resource, id, expected, actual))
        }
        _ => Ok(()),
    }
}

/// The table a trashed record of this type lives in.
///
/// WARNING: the returned name is interpolated into SQL. It is a literal from this module.
fn trash_table(resource_type: ResourceType) -> std::result::Result<&'static str, McpError> {
    match resource_type {
        ResourceType::Notes => Ok("notes"),
        ResourceType::Snippets => Ok("snippets"),
        ResourceType::ApiRequests => Ok("api_requests"),
        ResourceType::PromptTemplates => Err(invalid_argument(
            "type",
            "Prompt templates are deleted outright and never enter Trash",
            &["Restore notes, snippets or apiRequests"],
        )),
    }
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

fn is_system_inbox(id: &str) -> bool {
    SYSTEM_INBOX_IDS.contains(&id)
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

fn estimated_tokens(prompt: &str) -> i64 {
    std::cmp::max(1, (prompt.chars().count() as i64 + 3) / 4)
}

fn string_vec_to_db_json(value: Option<Vec<String>>) -> String {
    serde_json::to_string(&value.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string())
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

/// WARNING: The API Client calls array methods on `headers` while it renders a saved request. A
/// stored object or string therefore crashes the tool on load, so reject those shapes at the write.
///
/// Accept both shapes an MCP client sends: the stored array, and a flat header map.
/// The methods the API Client offers. Kept in step with `METHODS` in
/// `src/tools/api-client/request-model.ts`.
const HTTP_METHODS: [&str; 7] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
/// The methods that carry a body. Kept in step with `BODY_METHODS` in the same file.
const BODY_METHODS: [&str; 5] = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
/// The body modes the API Client offers. Kept in step with `BODY_MODE_IDS` in
/// `src/lib/api-import.ts`.
const BODY_MODES: [&str; 5] = ["json", "text", "urlencoded", "formdata", "none"];

/// Settle the body mode against the method, the way the API Client does when the method changes.
///
/// A GET with `bodyMode: "json"` shows a body editor for a body that is never sent.
fn body_mode_for_method(method: &str, mode: Option<String>) -> String {
    if !BODY_METHODS.contains(&method) {
        return "none".to_string();
    }
    mode.unwrap_or_else(|| "json".to_string())
}

/// Settle the folder a record belongs to.
///
/// WARNING: `collectionId` is the legacy alias of `folderId`. Two different values meant one of
/// them was silently dropped, and the caller had no way to tell which.
fn resolve_folder_alias(
    folder_id: Option<String>,
    collection_id: Option<String>,
) -> std::result::Result<Option<String>, McpError> {
    match (folder_id, collection_id) {
        (Some(folder), Some(collection)) if folder.trim() != collection.trim() => {
            Err(invalid_argument(
                "folderId",
                "`folderId` and legacy `collectionId` name different folders",
                &["Send only `folderId`", "Send the same value in both fields"],
            ))
        }
        (Some(folder), _) => Ok(Some(folder)),
        (None, collection) => Ok(collection),
    }
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

/// Case-insensitive substring match. The in-memory equal of the database `LIKE` filter.
fn matches_text(text: &str, query: Option<&str>) -> bool {
    let Some(query) = query.map(str::trim).filter(|query| !query.is_empty()) else {
        return true;
    };
    text.to_lowercase().contains(&query.to_lowercase())
}

fn matches_query(value: &Value, query: &Option<String>) -> bool {
    matches_text(&value.to_string(), query.as_deref())
}

impl PageRequest {
    fn parse(limit: Option<i64>, cursor: Option<&str>) -> std::result::Result<Self, McpError> {
        Ok(Self {
            limit: normalize_limit(limit)?,
            offset: cursor.map(decode_cursor).transpose()?.unwrap_or(0),
        })
    }

    /// Read one row past the page. A full page is then told from an exhausted one without a second
    /// query.
    fn probe_limit(self) -> i64 {
        self.limit as i64 + 1
    }

    fn offset(self) -> i64 {
        self.offset as i64
    }
}

impl DevdrivrMcpService {
    /// Compose the routers the resource modules declare.
    ///
    /// WARNING: a resource module that declares a router and is missing here serves no tool.
    fn tool_router() -> ToolRouter<Self> {
        Self::discovery_router()
            + Self::notes_router()
            + Self::snippets_router()
            + Self::prompt_templates_router()
            + Self::folders_router()
            + Self::trash_router()
            + Self::api_requests_router()
    }

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

    /// Read the trashed records of one type, newest first.
    async fn fetch_trashed_values(
        &self,
        resource_type: ResourceType,
        expose_auth: bool,
    ) -> std::result::Result<Vec<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                let rows = sqlx::query_as::<_, NoteRow>(
                    "SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
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
                    "SELECT * FROM snippets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
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
            ResourceType::ApiRequests => {
                let rows = sqlx::query_as::<_, ApiRequestRow>(
                    "SELECT * FROM api_requests WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
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
            // Deleting a prompt template removes the row, so there is nothing to list.
            ResourceType::PromptTemplates => Ok(Vec::new()),
        }
    }

    /// Count the matching rows, then read one page of them.
    ///
    /// WARNING: `filter` and `order` are composed into SQL. Build them from `like_any` and from
    /// literals only. The caller query reaches the database as the single bound `LIKE` pattern.
    ///
    /// Both queries share one filter, so `total` always describes the page's own result set.
    /// `order` must end in a unique column, or offset paging repeats a row across two pages.
    async fn page_rows<Row>(
        &self,
        table: &str,
        filter: &str,
        order: &str,
        query: Option<&str>,
        page: PageRequest,
    ) -> std::result::Result<(i64, Vec<Row>), McpError>
    where
        Row: for<'row> FromRow<'row, sqlx::sqlite::SqliteRow> + Send + Unpin,
    {
        let pattern = like_pattern(query);
        let total =
            sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM {table} WHERE {filter}"))
                .bind(&pattern)
                .fetch_one(&self.pool)
                .await
                .map_err(db_error)?;
        let rows = sqlx::query_as::<_, Row>(&format!(
            "SELECT * FROM {table} WHERE {filter} ORDER BY {order} LIMIT $2 OFFSET $3"
        ))
        .bind(&pattern)
        .bind(page.probe_limit())
        .bind(page.offset())
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        Ok((total, rows))
    }

    /// Read every record of one type that matches `query`, hydrated for scoring.
    ///
    /// The database applies the filter, so a search hydrates the matching records only. Hydrating
    /// a note reads its folder path and its links, which made an unfiltered read cost one query
    /// per record in the table.
    ///
    /// An absent query still reads the whole type. Search ranks across all candidates, so it
    /// cannot stop early.
    async fn fetch_resource_values(
        &self,
        resource_type: ResourceType,
        query: Option<&str>,
    ) -> std::result::Result<Vec<Value>, McpError> {
        let filter = resource_filter(resource_type);
        let order = resource_order(resource_type);
        let pattern = like_pattern(query);
        let sql = format!(
            "SELECT * FROM {table} WHERE {filter} ORDER BY {order}",
            table = resource_table(resource_type)
        );

        match resource_type {
            ResourceType::Notes => {
                let rows = sqlx::query_as::<_, NoteRow>(&sql)
                    .bind(&pattern)
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
                let rows = sqlx::query_as::<_, SnippetRow>(&sql)
                    .bind(&pattern)
                    .fetch_all(&self.pool)
                    .await
                    .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.snippet_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::PromptTemplates => sqlx::query_as::<_, PromptTemplateRow>(&sql)
                .bind(&pattern)
                .fetch_all(&self.pool)
                .await
                .map(|rows| rows.into_iter().map(prompt_to_json).collect())
                .map_err(db_error),
            ResourceType::ApiRequests => {
                let expose_auth = self.settings.read().await.api_requests_expose_secrets;
                let rows = sqlx::query_as::<_, ApiRequestRow>(&sql)
                    .bind(&pattern)
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

    /// Explain why a soft delete matched no row.
    ///
    /// WARNING: `table` is interpolated into SQL. Pass only a literal from this module.
    ///
    /// A delete guarded by `expectedUpdatedAt` fails the same way whether the record is gone or
    /// has moved on. The caller needs to tell those apart to decide whether to retry.
    async fn deletion_failure(
        &self,
        table: &'static str,
        resource: &str,
        id: &str,
        expected: Option<i64>,
    ) -> McpError {
        let Some(expected) = expected else {
            return not_found(resource, id);
        };
        let actual = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT updated_at FROM {table} WHERE id = $1 AND deleted_at IS NULL"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await;
        match actual {
            Ok(Some(actual)) => version_conflict(resource, id, expected, actual),
            Ok(None) => not_found(resource, id),
            Err(err) => db_error(err),
        }
    }

    async fn save_folder(&self, folder: &ResourceFolderRow) -> std::result::Result<(), McpError> {
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        Self::save_folder_in(&mut transaction, folder).await?;
        transaction.commit().await.map_err(db_error)?;
        Ok(())
    }

    /// Write a folder inside a caller-owned transaction.
    ///
    /// Lets a folder created on the caller's behalf commit with the record that needed it. A
    /// folder written on its own connection survived a failed record insert as an empty folder.
    async fn save_folder_in(
        transaction: &mut Transaction<'_, Sqlite>,
        folder: &ResourceFolderRow,
    ) -> std::result::Result<(), McpError> {
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
        .execute(&mut **transaction)
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
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        }
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

    /// Settle which folder a snippet belongs to.
    ///
    /// WARNING: returns a folder to create rather than creating one. The caller must write it
    /// inside the snippet transaction, or a failed snippet insert leaves an empty folder behind.
    async fn resolve_snippet_folder(
        &self,
        folder_id: Option<String>,
        legacy_folder: Option<String>,
        current: Option<&SnippetRow>,
    ) -> std::result::Result<(String, String, Option<ResourceFolderRow>), McpError> {
        if let Some(folder_id) = folder_id {
            let folder = self.require_folder_kind(&folder_id, "snippets").await?;
            return Ok((folder.id, folder.name, None));
        }
        if let Some(folder_name) = legacy_folder {
            if folder_name.is_empty() {
                return Ok(("snippets-inbox".to_string(), String::new(), None));
            }
            if let Some(folder) = sqlx::query_as::<_, ResourceFolderRow>(
                "SELECT * FROM resource_folders WHERE kind = 'snippets' AND name = $1 AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC LIMIT 1",
            )
            .bind(&folder_name)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)? {
                return Ok((folder.id, folder_name, None));
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
            return Ok((folder.id.clone(), folder_name, Some(folder)));
        }
        Ok((
            current
                .and_then(|row| row.folder_id.clone())
                .unwrap_or_else(|| "snippets-inbox".to_string()),
            current.map(|row| row.folder.clone()).unwrap_or_default(),
            None,
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
}

/// WARNING: written out rather than generated by `#[tool_handler]`. The generated `call_tool`
/// dispatches straight to the router, which leaves no place to bound argument size or call
/// duration. `list_tools` and `get_tool` match what the macro generates.
impl ServerHandler for DevdrivrMcpService {
    async fn call_tool(
        &self,
        request: rmcp::model::CallToolRequestParams,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let name = request.name.to_string();
        if let Some(arguments) = &request.arguments {
            for value in arguments.values() {
                check_argument_budget(value, 1)?;
            }
        }
        let call = rmcp::handler::server::tool::ToolCallContext::new(self, request, context);
        match tokio::time::timeout(TOOL_TIMEOUT, self.tool_router.call(call)).await {
            Ok(result) => result,
            Err(_) => Err(tool_timed_out(&name)),
        }
    }

    async fn list_tools(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> std::result::Result<rmcp::model::ListToolsResult, McpError> {
        Ok(rmcp::model::ListToolsResult {
            tools: self.tool_router.list_all(),
            meta: None,
            next_cursor: None,
        })
    }

    fn get_tool(&self, name: &str) -> Option<rmcp::model::Tool> {
        self.tool_router.get(name).cloned()
    }

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
        include_str!("../../../migrations/001_initial.sql"),
        include_str!("../../../migrations/002_api_client.sql"),
        include_str!("../../../migrations/003_notes_tags.sql"),
        include_str!("../../../migrations/004_history_metadata.sql"),
        include_str!("../../../migrations/005_snippets_folder.sql"),
        include_str!("../../../migrations/006_prompt_templates.sql"),
        include_str!("../../../migrations/007_prompt_template_authors.sql"),
        include_str!("../../../migrations/008_notes_sort_order.sql"),
        include_str!("../../../migrations/009_persistence_backfills.sql"),
        include_str!("../../../migrations/011_api_history_response.sql"),
        include_str!("../../../migrations/012_snippets_favorite.sql"),
        include_str!("../../../migrations/013_resource_folders.sql"),
        include_str!("../../../migrations/014_durable_trash.sql"),
        include_str!("../../../migrations/015_note_tasks.sql"),
        include_str!("../../../migrations/016_note_links.sql"),
        include_str!("../../../migrations/017_snippet_fragments.sql"),
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
    /// The transport caps a whole request. These cap the parts, so an oversized field names
    /// itself instead of failing as a bare transport error.
    /// The MCP contract must accept exactly what the API Client accepts. A free-text method or
    /// body mode reached the database and produced a request the tool could not run.
    /// Two agents editing one note both read, both wrote, and the second discarded the first
    /// without a word.
    /// A record deleted through MCP had no way back through MCP.
    /// A client that parses results should not have to parse the text block back into JSON.
    mod structured_results {
        use super::*;

        #[tokio::test]
        async fn a_list_carries_the_same_payload_as_structured_content() {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            service
                .notes_create(Parameters(note_create_args("one")))
                .await
                .expect("create");
            let result = service
                .notes_list(Parameters(
                    serde_json::from_value(json!({})).expect("list args"),
                ))
                .await
                .expect("list");

            let structured = result
                .structured_content
                .as_ref()
                .expect("structured content");
            assert_eq!(structured, &result_json(&result));
            assert_eq!(structured["total"], 1);
        }
    }

    mod trash {
        use super::*;

        async fn service_with_a_trashed_note() -> (DevdrivrMcpService, String) {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            let created = result_json(
                &service
                    .notes_create(Parameters(note_create_args("gone")))
                    .await
                    .expect("create"),
            );
            let id = created["id"].as_str().expect("id").to_string();
            let args: DeleteArgs =
                serde_json::from_value(json!({ "id": &id })).expect("delete args");
            service
                .notes_delete(Parameters(args))
                .await
                .expect("delete");
            (service, id)
        }

        fn trash_list_args() -> TrashListArgs {
            serde_json::from_value(json!({})).expect("trash list args")
        }

        #[tokio::test]
        async fn a_trashed_record_is_listed_with_its_resource_type() {
            let (service, id) = service_with_a_trashed_note().await;
            let json = result_json(
                &service
                    .trash_list(Parameters(trash_list_args()))
                    .await
                    .expect("trash list"),
            );
            let items = json["trashed"].as_array().expect("trashed");
            assert_eq!(items.len(), 1);
            assert_eq!(items[0]["id"], json!(id));
            assert_eq!(items[0]["resource"], "notes");
        }

        #[tokio::test]
        async fn restoring_puts_the_record_back_in_the_list() {
            let (service, id) = service_with_a_trashed_note().await;
            let args: TrashRestoreArgs =
                serde_json::from_value(json!({ "type": "notes", "id": &id }))
                    .expect("restore args");
            service
                .trash_restore(Parameters(args))
                .await
                .expect("restore");

            let listed = result_json(
                &service
                    .notes_list(Parameters(
                        serde_json::from_value(json!({})).expect("list args"),
                    ))
                    .await
                    .expect("list"),
            );
            assert_eq!(listed["total"], 1);
        }

        #[tokio::test]
        async fn restoring_needs_the_update_permission() {
            let service = service_with(all_permissions(resource_permissions(
                true, true, false, true,
            )))
            .await;
            let args: TrashRestoreArgs =
                serde_json::from_value(json!({ "type": "notes", "id": "any" }))
                    .expect("restore args");
            let error = service
                .trash_restore(Parameters(args))
                .await
                .expect_err("restore without update permission");
            assert_eq!(
                error.data.as_ref().expect("data")["code"],
                "PERMISSION_DENIED"
            );
        }

        #[tokio::test]
        async fn prompt_templates_cannot_be_restored() {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            let args: TrashRestoreArgs =
                serde_json::from_value(json!({ "type": "promptTemplates", "id": "any" }))
                    .expect("restore args");
            let error = service
                .trash_restore(Parameters(args))
                .await
                .expect_err("prompt templates never enter trash");
            assert!(error.message.contains("Trash"));
        }
    }

    mod optimistic_concurrency {
        use super::*;

        async fn service_with_a_note() -> (DevdrivrMcpService, String, i64) {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            let created = result_json(
                &service
                    .notes_create(Parameters(note_create_args("first")))
                    .await
                    .expect("create"),
            );
            let id = created["id"].as_str().expect("id").to_string();
            let updated_at = created["record"]["updatedAt"].as_i64().expect("updatedAt");
            (service, id, updated_at)
        }

        fn note_update(id: &str, expected: Option<i64>) -> NoteUpdateArgs {
            let mut value = json!({ "id": id, "title": "second" });
            if let (Value::Object(obj), Some(expected)) = (&mut value, expected) {
                obj.insert("expectedUpdatedAt".to_string(), json!(expected));
            }
            serde_json::from_value(value).expect("update args")
        }

        #[tokio::test]
        async fn an_update_against_the_read_version_succeeds() {
            let (service, id, updated_at) = service_with_a_note().await;
            assert!(service
                .notes_update(Parameters(note_update(&id, Some(updated_at))))
                .await
                .is_ok());
        }

        #[tokio::test]
        async fn an_update_against_a_stale_version_is_refused() {
            let (service, id, updated_at) = service_with_a_note().await;
            let error = service
                .notes_update(Parameters(note_update(&id, Some(updated_at - 1))))
                .await
                .expect_err("stale update");
            assert_eq!(error.data.as_ref().expect("data")["code"], "CONFLICT");

            let title = sqlx::query_scalar::<_, String>("SELECT title FROM notes WHERE id = $1")
                .bind(&id)
                .fetch_one(&service.pool)
                .await
                .expect("title");
            assert_eq!(title, "first", "the refused update must not have written");
        }

        #[tokio::test]
        async fn an_update_without_an_expectation_still_writes() {
            let (service, id, _) = service_with_a_note().await;
            assert!(service
                .notes_update(Parameters(note_update(&id, None)))
                .await
                .is_ok());
        }

        #[tokio::test]
        async fn a_delete_against_a_stale_version_is_refused() {
            let (service, id, updated_at) = service_with_a_note().await;
            let args: DeleteArgs =
                serde_json::from_value(json!({ "id": &id, "expectedUpdatedAt": updated_at - 1 }))
                    .expect("delete args");
            let error = service
                .notes_delete(Parameters(args))
                .await
                .expect_err("stale delete");
            assert_eq!(error.data.as_ref().expect("data")["code"], "CONFLICT");
        }

        #[tokio::test]
        async fn a_delete_of_a_missing_record_still_reports_not_found() {
            let (service, _, updated_at) = service_with_a_note().await;
            let args: DeleteArgs =
                serde_json::from_value(json!({ "id": "missing", "expectedUpdatedAt": updated_at }))
                    .expect("delete args");
            let error = service
                .notes_delete(Parameters(args))
                .await
                .expect_err("missing record");
            assert_eq!(
                error.data.as_ref().expect("data")["code"],
                "RESOURCE_NOT_FOUND"
            );
        }
    }

    mod api_request_contract {
        use super::*;

        /// The contract both sides read. A method added to one side and forgotten on the other
        /// fails here instead of reaching a user.
        #[test]
        fn the_rust_constants_match_the_shared_contract() {
            let contract: Value =
                serde_json::from_str(include_str!("../../../../shared/api-request-contract.json"))
                    .expect("shared contract");
            assert_eq!(contract["methods"], json!(HTTP_METHODS));
            assert_eq!(contract["bodyMethods"], json!(BODY_METHODS));
            assert_eq!(contract["bodyModes"], json!(BODY_MODES));
        }

        #[test]
        fn methods_are_accepted_case_insensitively() {
            assert_eq!(validate_http_method("post").expect("post"), "POST");
            assert_eq!(validate_http_method(" GET ").expect("get"), "GET");
        }

        #[test]
        fn an_unknown_method_is_rejected() {
            let error = validate_http_method("TRACE").expect_err("unknown method");
            assert_eq!(error.data.as_ref().expect("data")["argument"], "method");
        }

        #[test]
        fn an_unknown_body_mode_is_rejected() {
            assert_eq!(validate_body_mode("JSON").expect("json"), "json");
            assert!(validate_body_mode("xml").is_err());
        }

        #[test]
        fn a_method_without_a_body_forces_the_none_mode() {
            assert_eq!(
                body_mode_for_method("GET", Some("json".to_string())),
                "none"
            );
            assert_eq!(body_mode_for_method("HEAD", None), "none");
            assert_eq!(body_mode_for_method("POST", None), "json");
            assert_eq!(
                body_mode_for_method("POST", Some("text".to_string())),
                "text"
            );
        }

        #[test]
        fn conflicting_folder_aliases_are_rejected() {
            assert_eq!(
                resolve_folder_alias(Some("a".to_string()), Some("a".to_string())).expect("same"),
                Some("a".to_string())
            );
            assert_eq!(
                resolve_folder_alias(None, Some("legacy".to_string())).expect("legacy only"),
                Some("legacy".to_string())
            );
            assert!(resolve_folder_alias(Some("a".to_string()), Some("b".to_string())).is_err());
        }

        #[test]
        fn a_blank_required_string_is_rejected() {
            assert_eq!(require_non_blank("name", "  hi  ").expect("trimmed"), "hi");
            assert!(require_non_blank("name", "   ").is_err());
        }

        #[test]
        fn fragments_repeating_an_id_are_rejected() {
            let fragments: Vec<SnippetFragmentInput> = serde_json::from_value(json!([
                { "id": "same", "name": "one", "content": "a" },
                { "id": "same", "name": "two", "content": "b" },
            ]))
            .expect("fragments");
            let error = normalize_snippet_fragments(Some(fragments), None, None)
                .expect_err("duplicate fragment ids");
            assert!(error.message.contains("repeats the id"));
        }

        #[tokio::test]
        async fn a_create_with_an_unknown_method_writes_nothing() {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            let args: ApiRequestCreateArgs = serde_json::from_value(json!({
                "name": "probe",
                "method": "FETCH",
                "url": "https://example.test",
            }))
            .expect("create args");

            assert!(service.api_requests_create(Parameters(args)).await.is_err());
            let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM api_requests")
                .fetch_one(&service.pool)
                .await
                .expect("count");
            assert_eq!(count, 0);
        }
    }

    mod argument_budget {
        use super::*;

        #[test]
        fn ordinary_arguments_pass() {
            let value = json!({ "title": "note", "tags": ["a", "b"], "nested": { "x": [1, 2] } });
            assert!(check_argument_budget(&value, 1).is_ok());
        }

        #[test]
        fn an_oversized_string_is_rejected() {
            let value = json!("x".repeat(MAX_TEXT_FIELD_BYTES + 1));
            let error = check_argument_budget(&value, 1).expect_err("oversized string");
            assert_eq!(error.data.as_ref().expect("data")["code"], "RESOURCE_LIMIT");
        }

        #[test]
        fn an_oversized_string_nested_in_an_array_is_rejected() {
            let value = json!([{ "content": "x".repeat(MAX_TEXT_FIELD_BYTES + 1) }]);
            assert!(check_argument_budget(&value, 1).is_err());
        }

        #[test]
        fn an_oversized_array_is_rejected() {
            let value = Value::Array(vec![json!(1); MAX_ARRAY_ITEMS + 1]);
            let error = check_argument_budget(&value, 1).expect_err("oversized array");
            assert!(error.message.contains("maximum"));
        }

        #[test]
        fn arguments_nested_past_the_depth_cap_are_rejected() {
            let mut value = json!(1);
            for _ in 0..MAX_ARGUMENT_DEPTH + 1 {
                value = json!([value]);
            }
            let error = check_argument_budget(&value, 1).expect_err("over-nested arguments");
            assert!(error.message.contains("nest"));
        }
    }

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

    /// A published output schema must describe what the tool really returns.
    mod output_schemas {
        use super::*;

        fn tool_named(service: &DevdrivrMcpService, name: &str) -> rmcp::model::Tool {
            service
                .tool_router
                .get(name)
                .cloned()
                .unwrap_or_else(|| panic!("{name} must be registered"))
        }

        async fn service() -> DevdrivrMcpService {
            service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await
        }

        /// Every field the schema requires must be present in a real response, or a client that
        /// validates rejects a correct answer.
        #[tokio::test]
        async fn a_list_response_carries_every_field_its_schema_requires() {
            let service = service().await;
            let schema = tool_named(&service, "notes_list")
                .output_schema
                .expect("notes_list must publish an output schema");
            let payload = result_json(
                &service
                    .notes_list(Parameters(
                        serde_json::from_value(json!({})).expect("list args"),
                    ))
                    .await
                    .expect("list"),
            );

            let required = schema["required"].as_array().expect("required");
            assert!(!required.is_empty());
            for field in required {
                let field = field.as_str().expect("field name");
                assert!(
                    payload.get(field).is_some(),
                    "notes_list must return the required field {field}"
                );
            }
            assert!(schema["properties"].get("notes").is_some());
        }

        #[tokio::test]
        async fn a_write_receipt_carries_every_field_its_schema_requires() {
            let service = service().await;
            let schema = tool_named(&service, "notes_create")
                .output_schema
                .expect("notes_create must publish an output schema");
            let payload = result_json(
                &service
                    .notes_create(Parameters(note_create_args("one")))
                    .await
                    .expect("create"),
            );

            for field in schema["required"].as_array().expect("required") {
                let field = field.as_str().expect("field name");
                assert!(
                    payload.get(field).is_some(),
                    "notes_create must return the required field {field}"
                );
            }
            // `record` is optional, because a write-only client is never shown the record.
            assert!(schema["properties"].get("record").is_some());
        }
    }

    /// The database applies the search filter, so it must match every field the score reads.
    mod search_filter {
        use super::*;

        async fn service_with_snippet(value: Value) -> DevdrivrMcpService {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            service
                .snippets_create(Parameters(
                    serde_json::from_value(value).expect("snippet create args"),
                ))
                .await
                .expect("create a snippet");
            service
        }

        async fn search_titles(service: &DevdrivrMcpService, query: &str) -> Vec<String> {
            let payload = result_json(
                &service
                    .search(Parameters(
                        serde_json::from_value(json!({ "query": query, "types": ["snippets"] }))
                            .expect("search args"),
                    ))
                    .await
                    .expect("search"),
            );
            payload["results"]
                .as_array()
                .expect("results")
                .iter()
                .map(|result| result["title"].as_str().unwrap_or_default().to_string())
                .collect()
        }

        /// A fragment holds its own text. Filtering on the snippet columns alone would hide a
        /// snippet whose only match is inside a fragment.
        #[tokio::test]
        async fn a_snippet_matches_through_its_fragment() {
            let service = service_with_snippet(json!({
                "title": "helpers",
                "fragments": [
                    { "name": "setup", "content": "connect to sqlite", "language": "rust" },
                    { "name": "teardown", "content": "close the pool", "language": "rust" }
                ]
            }))
            .await;

            assert_eq!(search_titles(&service, "teardown").await, ["helpers"]);
            assert_eq!(search_titles(&service, "close the pool").await, ["helpers"]);
        }

        #[tokio::test]
        async fn a_snippet_that_matches_nothing_is_not_returned() {
            let service = service_with_snippet(json!({
                "title": "helpers",
                "content": "connect to sqlite",
                "language": "rust"
            }))
            .await;

            assert!(search_titles(&service, "postgres").await.is_empty());
        }
    }

    /// A list must read one page from the database, not the whole table.
    ///
    /// The filter and the page both belong in SQL. Loading every note to hydrate its folder path
    /// and links, only to drop all but fifty, cost the same whether the caller asked for one
    /// record or all of them.
    mod list_paging {
        use super::*;

        fn list_args(value: Value) -> ListArgs {
            serde_json::from_value(value).expect("list args")
        }

        async fn service_with_titles(titles: &[&str]) -> DevdrivrMcpService {
            let service = service_with(all_permissions(resource_permissions(
                true, true, true, true,
            )))
            .await;
            for title in titles {
                service
                    .notes_create(Parameters(note_create_args(title)))
                    .await
                    .expect("create a note");
            }
            service
        }

        fn titles(payload: &Value) -> Vec<String> {
            payload["notes"]
                .as_array()
                .expect("notes")
                .iter()
                .map(|note| note["title"].as_str().expect("title").to_string())
                .collect()
        }

        #[tokio::test]
        async fn a_cursor_walks_every_record_exactly_once() {
            let service = service_with_titles(&["one", "two", "three", "four", "five"]).await;
            let mut seen = Vec::new();
            let mut cursor = Value::Null;

            loop {
                let mut args = json!({ "limit": 2 });
                if let Some(cursor) = cursor.as_str() {
                    args["cursor"] = json!(cursor);
                }
                let payload = result_json(
                    &service
                        .notes_list(Parameters(list_args(args)))
                        .await
                        .expect("list"),
                );
                assert_eq!(payload["total"], 5);
                seen.extend(titles(&payload));
                cursor = payload["nextCursor"].clone();
                if cursor.is_null() {
                    break;
                }
            }

            seen.sort();
            assert_eq!(seen, ["five", "four", "one", "three", "two"]);
        }

        #[tokio::test]
        async fn the_last_page_carries_no_cursor() {
            let service = service_with_titles(&["only"]).await;
            let payload = result_json(
                &service
                    .notes_list(Parameters(list_args(json!({}))))
                    .await
                    .expect("list"),
            );
            assert_eq!(payload["hasMore"], false);
            assert!(payload["nextCursor"].is_null());
        }

        #[tokio::test]
        async fn a_query_counts_and_returns_only_the_matching_records() {
            let service = service_with_titles(&["rust notes", "swift notes", "rust guide"]).await;
            let payload = result_json(
                &service
                    .notes_list(Parameters(list_args(json!({ "query": "RUST" }))))
                    .await
                    .expect("list"),
            );
            // The count comes from the same filter as the page, so it must not report the table.
            assert_eq!(payload["total"], 2);
            let mut found = titles(&payload);
            found.sort();
            assert_eq!(found, ["rust guide", "rust notes"]);
        }

        #[tokio::test]
        async fn a_wildcard_in_the_query_matches_itself() {
            let service = service_with_titles(&["50% off", "50 percent off"]).await;
            let payload = result_json(
                &service
                    .notes_list(Parameters(list_args(json!({ "query": "50%" }))))
                    .await
                    .expect("list"),
            );
            // Unescaped, `%` and `_` are LIKE wildcards, so this query would return both notes.
            assert_eq!(titles(&payload), ["50% off"]);

            let payload = result_json(
                &service
                    .notes_list(Parameters(list_args(json!({ "query": "50_percent" }))))
                    .await
                    .expect("list"),
            );
            assert_eq!(payload["total"], 0);
        }

        #[tokio::test]
        async fn a_cursor_the_server_did_not_issue_is_rejected() {
            let service = service_with_titles(&["one"]).await;
            let error = service
                .notes_list(Parameters(list_args(json!({ "cursor": "not-a-cursor" }))))
                .await
                .expect_err("a forged cursor must fail");
            assert!(error.message.contains("cursor"));
        }

        #[tokio::test]
        async fn every_list_tool_pages_the_same_way() {
            let service = service_with_titles(&["one"]).await;
            for (tool, key) in [
                ("snippets", "snippets"),
                ("promptTemplates", "promptTemplates"),
                ("apiRequests", "apiRequests"),
                ("apiCollections", "apiCollections"),
            ] {
                let payload = match tool {
                    "snippets" => {
                        service
                            .snippets_list(Parameters(list_args(json!({}))))
                            .await
                    }
                    "promptTemplates" => {
                        service
                            .prompt_templates_list(Parameters(list_args(json!({}))))
                            .await
                    }
                    "apiRequests" => {
                        service
                            .api_requests_list(Parameters(list_args(json!({}))))
                            .await
                    }
                    _ => {
                        service
                            .api_collections_list(Parameters(list_args(json!({}))))
                            .await
                    }
                }
                .expect("list");
                let payload = result_json(&payload);
                assert!(payload[key].is_array(), "{tool} must return {key}");
                assert_eq!(payload["limit"], 50, "{tool} must apply the default page");
                assert!(payload["total"].is_i64(), "{tool} must report a total");
                assert_eq!(payload["hasMore"], false, "{tool} must report hasMore");
            }
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
    fn an_update_heals_a_stored_value_an_earlier_import_left_invalid() {
        assert_eq!(heal_note_color("teal"), "yellow");
        assert_eq!(heal_note_color("purple"), "purple");
        assert_eq!(heal_template_category("general"), "productivity");
        assert_eq!(heal_template_category("docs"), "docs");
        assert_eq!(heal_template_optimized_for("GPT-4"), "Generic");
        assert_eq!(heal_template_optimized_for("Cursor"), "Cursor");
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
}
