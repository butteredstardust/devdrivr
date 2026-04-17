use std::sync::Arc;

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

fn db_error(err: sqlx::Error) -> McpError {
    McpError::internal_error(format!("Database error: {err}"), None)
}

fn not_found(resource: &str, id: &str) -> McpError {
    McpError::resource_not_found(
        format!("{resource} not found"),
        Some(json!({ "id": id, "resource": resource })),
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
                    obj.insert("token".to_string(), Value::String("<redacted>".to_string()));
                }
                Some("basic") => {
                    obj.insert(
                        "password".to_string(),
                        Value::String("<redacted>".to_string()),
                    );
                }
                _ => {}
            }
            Value::Object(obj)
        }
        other => other,
    }
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
            Err(McpError::invalid_request(
                format!("MCP permission denied for {resource}.{action}"),
                Some(json!({ "resource": resource, "action": action })),
            ))
        }
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
            .ok_or_else(|| not_found("note", &args.id))?;
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
            .ok_or_else(|| not_found("note", &args.id))?;
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
            return Err(not_found("note", &args.id));
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
            .ok_or_else(|| not_found("snippet", &args.id))?;
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
            .ok_or_else(|| not_found("snippet", &args.id))?;
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
            return Err(not_found("snippet", &args.id));
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
        .ok_or_else(|| not_found("prompt template", &args.id))?;
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
        .ok_or_else(|| not_found("prompt template", &args.id))?;
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
            return Err(McpError::invalid_request(
                "Prompt template was not found or is built-in",
                Some(json!({ "id": args.id })),
            ));
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
            .ok_or_else(|| not_found("API request", &args.id))?;
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
        .bind(value_to_db_json(args.auth, json!({ "type": "none" })))
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
                .ok_or_else(|| not_found("API request", &args.id))?;
        let auth = match args.auth {
            Some(Value::Object(ref obj))
                if obj
                    .values()
                    .any(|value| value.as_str() == Some("<redacted>")) =>
            {
                current.auth
            }
            Some(value) => serde_json::to_string(&value).unwrap_or(current.auth),
            None => current.auth,
        };
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
            return Err(not_found("API request", &args.id));
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
                "Use these tools to read and manage local devdrivr cockpit notes, snippets, prompt templates, and saved API client requests."
                    .to_string(),
            ),
            ..ServerInfo::default()
        }
    }
}
