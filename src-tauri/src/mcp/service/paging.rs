use std::sync::Arc;

use rmcp::{
    model::{CallToolResult, Content},
    ErrorData as McpError,
};
use serde_json::{json, Value};

use super::{invalid_argument, McpResult, ResourceType, DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT};

/// Return one payload twice: as the text block every client can read, and as
/// `structuredContent` for a client that would otherwise parse the text back into JSON.
///
/// Only an object becomes structured content. The protocol allows nothing else there.
pub(super) fn to_json_text(value: Value) -> McpResult {
    let structured_content = value.is_object().then(|| value.clone());
    serde_json::to_string_pretty(&value)
        .map(|text| CallToolResult {
            content: vec![Content::text(text)],
            structured_content,
            is_error: Some(false),
            meta: None,
        })
        .map_err(|err| McpError::internal_error(err.to_string(), None))
}

/// Resolve the result limit for a search or a list.
///
/// WARNING: rejects a non-positive limit instead of clamping it. Answering `limit: 0` with one
/// record reads as data loss rather than as a bad argument.
pub(super) fn normalize_limit(limit: Option<i64>) -> std::result::Result<usize, McpError> {
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

/// Turn a caller query into a `LIKE` pattern that matches a substring.
///
/// An absent or blank query becomes `%`, which matches every row. The three `LIKE` metacharacters
/// are escaped, so a query containing `%` looks for a literal percent sign.
pub(super) fn like_pattern(query: Option<&str>) -> String {
    let Some(query) = query.map(str::trim).filter(|query| !query.is_empty()) else {
        return "%".to_string();
    };
    let mut pattern = String::with_capacity(query.len() + 2);
    pattern.push('%');
    for character in query.chars() {
        if matches!(character, '\\' | '%' | '_') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    pattern.push('%');
    pattern
}

/// Match any of the named columns against the bound `LIKE` pattern.
///
/// WARNING: the column names are composed into SQL. Pass literals only.
///
/// `COALESCE` keeps a NULL column matchable. `NULL LIKE '%'` is NULL, not true, so a filter over
/// one nullable column would hide every row that leaves it empty.
pub(super) fn like_any(columns: &[&str]) -> String {
    columns
        .iter()
        .map(|column| format!(r"COALESCE({column}, '') LIKE $1 ESCAPE '\'"))
        .collect::<Vec<_>>()
        .join(" OR ")
}

pub(super) fn json_schema(value: Value) -> Arc<rmcp::model::JsonObject> {
    Arc::new(
        value
            .as_object()
            .cloned()
            .expect("a schema is a JSON object"),
    )
}

/// The schema of one page of a list, published so a client validates `structuredContent` instead
/// of inferring the shape from a sample.
///
/// `key` names the array of records, which differs per tool.
pub(super) fn list_page_schema(key: &str) -> Arc<rmcp::model::JsonObject> {
    json_schema(json!({
        "type": "object",
        "properties": {
            key: {
                "type": "array",
                "items": { "type": "object" },
                "description": "The records on this page.",
            },
            "total": {
                "type": "integer",
                "description": "Records the filter matches, across every page.",
            },
            "limit": { "type": "integer", "description": "Records this page can hold." },
            "hasMore": { "type": "boolean", "description": "True when a page follows." },
            "nextCursor": {
                "type": ["string", "null"],
                "description": "Pass back as `cursor` to read the next page. Null on the last page.",
            },
        },
        "required": [key, "total", "limit", "hasMore"],
    }))
}

/// The schema of a write receipt.
///
/// `record` rides along only when the read permission is granted, so it is not required.
pub(super) fn mutation_schema() -> Arc<rmcp::model::JsonObject> {
    json_schema(json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "The record written." },
            "resource": { "type": "string", "description": "The resource type written." },
            "action": {
                "type": "string",
                "enum": ["create", "update"],
                "description": "The write that was committed.",
            },
            "record": {
                "type": "object",
                "description": "The record as stored. Absent without the read permission.",
            },
        },
        "required": ["id", "resource", "action"],
    }))
}

pub(super) fn resource_table(resource_type: ResourceType) -> &'static str {
    match resource_type {
        ResourceType::Notes => "notes",
        ResourceType::Snippets => "snippets",
        ResourceType::PromptTemplates => "user_prompt_templates",
        ResourceType::ApiRequests => "api_requests",
    }
}

/// The SQL filter for one resource type, applied to both a list and a search.
///
/// WARNING: names every field `searchable_text` reads. A field added to the score and not here is
/// a record the score would have matched that the database never returns.
pub(super) fn resource_filter(resource_type: ResourceType) -> String {
    match resource_type {
        ResourceType::Notes => format!(
            "deleted_at IS NULL AND ({})",
            like_any(&["title", "content", "tags"])
        ),
        // A fragment holds its own name, content and language, so a snippet matches through one.
        ResourceType::Snippets => format!(
            "deleted_at IS NULL AND ({own} OR EXISTS (SELECT 1 FROM snippet_fragments fragment WHERE fragment.snippet_id = snippets.id AND ({fragment})))",
            own = like_any(&["title", "description", "content", "language", "tags"]),
            fragment = like_any(&["fragment.name", "fragment.content", "fragment.language"]),
        ),
        ResourceType::PromptTemplates => {
            like_any(&["name", "description", "category", "prompt", "tags"])
        }
        ResourceType::ApiRequests => format!(
            "deleted_at IS NULL AND ({})",
            like_any(&["name", "method", "url", "body", "headers"])
        ),
    }
}

/// The order of one resource type. Ends in a unique column, so offset paging never repeats a row.
pub(super) fn resource_order(resource_type: ResourceType) -> &'static str {
    match resource_type {
        ResourceType::Notes => "pinned DESC, updated_at DESC, id ASC",
        ResourceType::Snippets => "updated_at DESC, id ASC",
        ResourceType::PromptTemplates => "author ASC, updated_at DESC, id ASC",
        ResourceType::ApiRequests => "name ASC, id ASC",
    }
}

/// One page of a list response.
///
/// WARNING: offset paging, not keyset paging. A write that lands between two page reads can repeat
/// or skip one record. The database serves one desktop user, so pages are read faster than they
/// are invalidated.
#[derive(Debug, Clone, Copy)]
pub(super) struct PageRequest {
    pub(super) limit: usize,
    pub(super) offset: usize,
}

/// Encode the offset of the next page.
///
/// The encoding is hex so that a caller treats the value as opaque and passes it back unchanged
/// instead of doing arithmetic on it.
pub(super) fn encode_cursor(offset: usize) -> String {
    format!("offset:{offset}")
        .bytes()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(super) fn decode_cursor(cursor: &str) -> std::result::Result<usize, McpError> {
    let bad_cursor = || {
        invalid_argument(
            "cursor",
            "cursor is not a cursor returned by this server",
            &[
                "Pass back the nextCursor value from the previous page",
                "Omit cursor to read the first page",
            ],
        )
    };
    if !cursor.len().is_multiple_of(2) {
        return Err(bad_cursor());
    }
    let bytes = (0..cursor.len())
        .step_by(2)
        .map(|start| u8::from_str_radix(&cursor[start..start + 2], 16))
        .collect::<std::result::Result<Vec<u8>, _>>()
        .map_err(|_| bad_cursor())?;
    String::from_utf8(bytes)
        .ok()
        .and_then(|decoded| decoded.strip_prefix("offset:")?.parse::<usize>().ok())
        .ok_or_else(bad_cursor)
}

/// Bound a list response and say what was cut.
///
/// `values` holds up to one row more than the page, the probe row that proves more rows exist.
///
/// An absent limit means the default page, not the whole table. Without a default, listing ten
/// thousand notes serialised every one of them into a single tool response.
pub(super) fn page_payload(
    key: &str,
    mut values: Vec<Value>,
    page: PageRequest,
    total: i64,
) -> McpResult {
    let has_more = values.len() > page.limit;
    values.truncate(page.limit);
    to_json_text(json!({
        key: values,
        "total": total,
        "limit": page.limit,
        "hasMore": has_more,
        "nextCursor": has_more.then(|| encode_cursor(page.offset + page.limit)),
    }))
}

/// Page a list the database cannot bound, such as one that merges several tables.
///
/// The whole list is already in memory here, so this only cuts the response. Prefer the paged SQL
/// helpers for anything that grows with user data.
pub(super) fn page_in_memory(key: &str, values: Vec<Value>, page: PageRequest) -> McpResult {
    let total = values.len() as i64;
    let page_values = values
        .into_iter()
        .skip(page.offset)
        .take(page.limit + 1)
        .collect();
    page_payload(key, page_values, page, total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_defaults_clamps_and_rejects_invalid_values() {
        assert_eq!(normalize_limit(None).unwrap(), 50);
        assert_eq!(normalize_limit(Some(999)).unwrap(), 500);

        let err = normalize_limit(Some(0)).expect_err("zero limit should fail");
        let data = err.data.expect("error data");
        assert_eq!(data["code"], "INVALID_ARGUMENT");
        assert_eq!(data["argument"], "limit");
    }
}
