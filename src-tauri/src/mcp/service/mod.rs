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

mod access;
mod api_requests;
mod args;
mod discovery;
mod errors;
mod fetch;
mod folder_store;
mod folders;
mod notes;
mod paging;
mod prompt_templates;
mod request_fields;
mod resource_type;
mod rows;
mod snippets;
mod trash;
mod validation;

use args::*;
use errors::*;
use paging::*;
use request_fields::*;
use resource_type::*;
use rows::*;
use validation::*;

type SharedSettings = Arc<RwLock<McpSettings>>;
type McpResult = std::result::Result<CallToolResult, McpError>;
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
    let mut search_from = 0;
    while let Some(relative_open) = content[search_from..].find("[[") {
        let after_open = search_from + relative_open + 2;
        let candidate = &content[after_open..];
        let parsed = ["note", "snippet", "api-request"]
            .into_iter()
            .find_map(|kind| {
                let prefix = format!("{kind}:");
                let value = candidate.strip_prefix(&prefix)?;
                let separator = value.find('|')?;
                let id = &value[..separator];
                if id.is_empty()
                    || id
                        .chars()
                        .any(|character| matches!(character, ']' | '\r' | '\n'))
                {
                    return None;
                }
                let label_and_close = &value[separator + 1..];
                let close = label_and_close.find("]]")?;
                let label = &label_and_close[..close];
                if label.is_empty()
                    || label
                        .chars()
                        .any(|character| matches!(character, ']' | '\r' | '\n'))
                {
                    return None;
                }
                Some((
                    (kind.to_string(), id.to_string()),
                    after_open + prefix.len() + separator + 1 + close + 2,
                ))
            });
        if let Some((pair, end)) = parsed {
            if !targets.contains(&pair) {
                targets.push(pair);
            }
            search_from = end;
        } else {
            search_from = after_open;
        }
    }
    targets
}

fn estimated_tokens(prompt: &str) -> i64 {
    std::cmp::max(1, (prompt.chars().count() as i64 + 3) / 4)
}

fn string_vec_to_db_json(value: Option<Vec<String>>) -> String {
    serde_json::to_string(&value.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string())
}

/// Settle the folder a record belongs to.
///
/// WARNING: `collectionId` is the legacy alias of `folderId`. Reject different values because
/// accepting both would silently discard one value.
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

    /// Report a committed write.
    ///
    /// WARNING: call only after the transaction has committed. The write has already happened
    /// when this runs, so this must never return an error of any kind.
    ///
    /// Settings grants create, update, delete and read independently. Returning the record
    /// through the read-gated getter therefore answered a successful write with
    /// PERMISSION_DENIED for a write-only client, and an agent that retried wrote the row twice.
    /// A failed read of the record does the same damage, so it is dropped rather than reported.
    ///
    /// The receipt always lands. The record rides along only when `read` is granted and the
    /// read succeeds.
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
            // WARNING: the write has already committed. A failed read must not turn it into an
            // error, or the client retries and writes a second time.
            if let Ok(Some(record)) = self.fetch_resource_value(resource_type, id).await {
                if let Value::Object(obj) = &mut payload {
                    obj.insert("record".to_string(), record);
                }
            }
        }
        to_json_text(payload)
    }

    /// Explain why a guarded write matched no row.
    ///
    /// WARNING: the table name is interpolated into SQL. It comes from `resource_table`, which
    /// returns a literal.
    ///
    /// A write guarded by `expectedUpdatedAt` fails the same way whether the record is gone or
    /// has moved on. The caller needs to tell those apart to decide whether to retry.
    async fn stale_write_failure(
        &self,
        resource_type: ResourceType,
        id: &str,
        expected: Option<i64>,
    ) -> McpError {
        let resource = resource_type.key();
        let Some(expected) = expected else {
            return not_found(resource, id);
        };
        let table = resource_table(resource_type);
        // A prompt template is deleted outright, so its table carries no tombstone column.
        let alive = if trash_table(resource_type).is_ok() {
            " AND deleted_at IS NULL"
        } else {
            ""
        };
        let actual = sqlx::query_scalar::<_, i64>(&format!(
            "SELECT updated_at FROM {table} WHERE id = $1{alive}"
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
mod tests;
