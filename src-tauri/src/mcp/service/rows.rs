use serde::Serialize;
use serde_json::{json, Value};
use sqlx::FromRow;

use super::{parse_json, redacted_auth};

#[derive(Debug, Serialize, FromRow)]
pub(super) struct NoteRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) content: String,
    pub(super) color: String,
    pub(super) pinned: i64,
    pub(super) popped_out: i64,
    pub(super) window_x: Option<f64>,
    pub(super) window_y: Option<f64>,
    pub(super) window_width: Option<f64>,
    pub(super) window_height: Option<f64>,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
    pub(super) tags: Option<String>,
    pub(super) folder_id: Option<String>,
    pub(super) deleted_at: Option<i64>,
    pub(super) task_status: Option<String>,
    pub(super) task_priority: Option<String>,
    pub(super) task_due_date: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct SnippetRow {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) content: String,
    pub(super) language: String,
    pub(super) description: String,
    pub(super) tags: String,
    pub(super) folder: String,
    pub(super) folder_id: Option<String>,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct SnippetFragmentRow {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) content: String,
    pub(super) language: String,
    pub(super) sort_order: i64,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct PromptTemplateRow {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) description: String,
    pub(super) category: String,
    pub(super) tags: String,
    pub(super) prompt: String,
    pub(super) variables_schema: String,
    pub(super) estimated_tokens: i64,
    pub(super) optimized_for: String,
    pub(super) author: String,
    pub(super) version: String,
    pub(super) tips: String,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct ApiCollectionRow {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) parent_id: Option<String>,
    pub(super) sort_order: f64,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct ApiRequestRow {
    pub(super) id: String,
    pub(super) collection_id: Option<String>,
    pub(super) name: String,
    pub(super) method: String,
    pub(super) url: String,
    pub(super) headers: String,
    pub(super) body: String,
    pub(super) body_mode: String,
    pub(super) auth: String,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

#[derive(Debug, Clone, FromRow)]
pub(super) struct ResourceFolderRow {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) parent_id: Option<String>,
    pub(super) kind: String,
    pub(super) sort_order: f64,
    pub(super) default_language: Option<String>,
    pub(super) created_at: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

pub(super) fn note_to_json(row: NoteRow, folder_path: Vec<String>) -> Value {
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

pub(super) fn snippet_to_json(row: SnippetRow, folder_path: Vec<String>) -> Value {
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

pub(super) fn prompt_to_json(row: PromptTemplateRow) -> Value {
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

pub(super) fn api_collection_to_json(row: ApiCollectionRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "parentId": row.parent_id,
        "sortOrder": row.sort_order,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

pub(super) fn api_request_to_json(
    row: ApiRequestRow,
    folder_path: Vec<String>,
    expose_auth: bool,
) -> Value {
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

pub(super) fn resource_folder_to_json(row: ResourceFolderRow) -> Value {
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
