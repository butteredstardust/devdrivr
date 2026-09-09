use rmcp::schemars;
use serde::Deserialize;
use serde_json::Value;

use super::{deserialize_nullable_string, SearchSort};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct ListArgs {
    /// Case-insensitive substring, matched by the database against the named fields of the record.
    pub(super) query: Option<String>,
    pub(super) limit: Option<i64>,
    /// The `nextCursor` of the previous page. Omit for the first page.
    pub(super) cursor: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct IdArgs {
    pub(super) id: String,
}

/// WARNING: `expected_updated_at` is optional. Omitting it deletes whatever the record now holds.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeleteArgs {
    pub(super) id: String,
    /// The `updatedAt` the caller last read. A different value fails with `CONFLICT`.
    pub(super) expected_updated_at: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchArgs {
    pub(super) query: Option<String>,
    pub(super) types: Option<Vec<String>>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) created_after: Option<i64>,
    pub(super) created_before: Option<i64>,
    pub(super) updated_after: Option<i64>,
    pub(super) updated_before: Option<i64>,
    pub(super) limit: Option<i64>,
    pub(super) sort: Option<SearchSort>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct ResourceId {
    #[serde(rename = "type")]
    pub(super) resource_type: String,
    pub(super) id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct MultiGetArgs {
    pub(super) ids: Vec<ResourceId>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct CountsArgs {
    pub(super) types: Option<Vec<String>>,
}

/// WARNING: prompt templates are deleted outright and never appear in trash.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct TrashListArgs {
    /// Resource types to include. Omit for every readable type that supports trash.
    pub(super) types: Option<Vec<String>>,
    pub(super) query: Option<String>,
    pub(super) limit: Option<i64>,
    /// The `nextCursor` of the previous page. Omit for the first page.
    pub(super) cursor: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct TrashRestoreArgs {
    /// One of `notes`, `snippets`, `apiRequests`.
    #[serde(rename = "type")]
    pub(super) resource_type: String,
    pub(super) id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub(super) struct HelpArgs {
    pub(super) topic: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct NoteCreateArgs {
    pub(super) title: Option<String>,
    pub(super) content: Option<String>,
    pub(super) color: Option<String>,
    pub(super) pinned: Option<bool>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) folder_id: Option<String>,
    pub(super) task_status: Option<String>,
    pub(super) task_priority: Option<String>,
    pub(super) task_due_date: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct NoteUpdateArgs {
    pub(super) id: String,
    pub(super) title: Option<String>,
    pub(super) content: Option<String>,
    pub(super) color: Option<String>,
    pub(super) pinned: Option<bool>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) folder_id: Option<String>,
    pub(super) task_status: Option<String>,
    pub(super) task_priority: Option<String>,
    pub(super) task_due_date: Option<String>,
    pub(super) clear_task_metadata: Option<bool>,
    pub(super) clear_task_priority: Option<bool>,
    pub(super) clear_task_due_date: Option<bool>,
    /// The `updatedAt` the caller last read. A different value fails with `CONFLICT`.
    pub(super) expected_updated_at: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct SnippetCreateArgs {
    pub(super) title: String,
    pub(super) content: Option<String>,
    pub(super) language: Option<String>,
    pub(super) description: Option<String>,
    pub(super) fragments: Option<Vec<SnippetFragmentInput>>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) folder_id: Option<String>,
    pub(super) folder: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct SnippetUpdateArgs {
    pub(super) id: String,
    pub(super) title: Option<String>,
    pub(super) content: Option<String>,
    pub(super) language: Option<String>,
    pub(super) description: Option<String>,
    pub(super) fragments: Option<Vec<SnippetFragmentInput>>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) folder_id: Option<String>,
    pub(super) folder: Option<String>,
    /// The `updatedAt` the caller last read. A different value fails with `CONFLICT`.
    pub(super) expected_updated_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct SnippetFragmentInput {
    pub(super) id: Option<String>,
    pub(super) name: String,
    pub(super) content: String,
    pub(super) language: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct PromptTemplateCreateArgs {
    pub(super) name: String,
    pub(super) description: Option<String>,
    pub(super) category: Option<String>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) prompt: String,
    pub(super) variables: Option<Value>,
    pub(super) optimized_for: Option<String>,
    pub(super) version: Option<String>,
    pub(super) tips: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct PromptTemplateUpdateArgs {
    pub(super) id: String,
    pub(super) name: Option<String>,
    pub(super) description: Option<String>,
    pub(super) category: Option<String>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) prompt: Option<String>,
    pub(super) variables: Option<Value>,
    pub(super) optimized_for: Option<String>,
    pub(super) version: Option<String>,
    pub(super) tips: Option<Vec<String>>,
    /// The `updatedAt` the caller last read. A different value fails with `CONFLICT`.
    pub(super) expected_updated_at: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApiRequestCreateArgs {
    pub(super) folder_id: Option<String>,
    pub(super) collection_id: Option<String>,
    pub(super) name: String,
    pub(super) method: String,
    pub(super) url: String,
    pub(super) headers: Option<Value>,
    pub(super) body: Option<String>,
    pub(super) body_mode: Option<String>,
    pub(super) auth: Option<Value>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApiRequestUpdateArgs {
    pub(super) id: String,
    pub(super) folder_id: Option<String>,
    pub(super) collection_id: Option<String>,
    pub(super) name: Option<String>,
    pub(super) method: Option<String>,
    pub(super) url: Option<String>,
    pub(super) headers: Option<Value>,
    pub(super) body: Option<String>,
    pub(super) body_mode: Option<String>,
    pub(super) auth: Option<Value>,
    /// The `updatedAt` the caller last read. A different value fails with `CONFLICT`.
    pub(super) expected_updated_at: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct FolderListArgs {
    pub(super) kind: Option<String>,
    /// Case-insensitive substring, matched against the folder name.
    pub(super) query: Option<String>,
    pub(super) limit: Option<i64>,
    /// The `nextCursor` of the previous page. Omit for the first page.
    pub(super) cursor: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct FolderCreateArgs {
    pub(super) name: String,
    pub(super) kind: String,
    pub(super) parent_id: Option<String>,
    pub(super) default_language: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct FolderUpdateArgs {
    pub(super) id: String,
    pub(super) name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub(super) default_language: Option<Option<String>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct FolderMoveArgs {
    pub(super) id: String,
    pub(super) parent_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmptyTrashArgs {
    pub(super) kind: String,
}
