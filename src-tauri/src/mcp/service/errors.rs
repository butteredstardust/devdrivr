use super::{error_data, resource_display_name, TOOL_TIMEOUT};
use rmcp::ErrorData as McpError;

pub(super) fn db_error(err: sqlx::Error) -> McpError {
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

pub(super) fn not_found(resource: &str, id: &str) -> McpError {
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

pub(super) fn permission_denied(resource: &str, action: &str) -> McpError {
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

pub(super) fn invalid_argument(
    argument: &str,
    message: impl Into<String>,
    suggestions: &[&str],
) -> McpError {
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

pub(super) fn batch_too_large(argument: &str, count: usize, max: usize) -> McpError {
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

pub(super) fn resource_limit(message: impl Into<String>, suggestions: &[&str]) -> McpError {
    McpError::invalid_request(
        message.into(),
        Some(error_data(
            "RESOURCE_LIMIT",
            None,
            None,
            None,
            None,
            suggestions,
        )),
    )
}

pub(super) fn tool_timed_out(name: &str) -> McpError {
    McpError::internal_error(
        format!(
            "Tool `{name}` did not finish within {}s",
            TOOL_TIMEOUT.as_secs()
        ),
        Some(error_data(
            "TIMEOUT",
            None,
            None,
            None,
            None,
            &[
                "Retry with a smaller limit or a narrower filter",
                "Check that no other process is holding the devdrivr database open",
            ],
        )),
    )
}

/// Report that a record moved under the caller.
pub(super) fn version_conflict(resource: &str, id: &str, expected: i64, actual: i64) -> McpError {
    McpError::invalid_request(
        format!("{resource} `{id}` was updated at {actual}, not at the expected {expected}"),
        Some(error_data(
            "CONFLICT",
            Some(resource),
            None,
            Some(id),
            Some("expectedUpdatedAt"),
            &[
                "Read the record again and retry against its current `updatedAt`",
                "Omit `expectedUpdatedAt` to write regardless of concurrent edits",
            ],
        )),
    )
}

pub(super) fn builtin_template_delete_denied(id: &str) -> McpError {
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

pub(super) fn unsupported_resource_type(resource_type: &str) -> McpError {
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

pub(super) fn invalid_folder_parent(message: impl Into<String>) -> McpError {
    invalid_argument(
        "parentId",
        message,
        &[
            "Choose a folder of the same resource kind",
            "Do not move a folder into itself or one of its descendants",
        ],
    )
}

pub(super) fn system_inbox_update_denied(id: &str) -> McpError {
    invalid_argument(
        "id",
        format!("The system Inbox folder {id} cannot be renamed or moved"),
        &[
            "Create a child folder under Inbox instead",
            "Use a non-system folder ID",
        ],
    )
}

pub(super) fn unknown_help_topic(topic: &str) -> McpError {
    invalid_argument(
        "topic",
        format!("Unknown help topic: {topic}"),
        &[
            "Use one of: overview, tools, workflows, permissions, errors, schema, clients",
            "Omit topic to get the overview help",
        ],
    )
}

pub(super) fn invalid_api_headers(message: impl Into<String>) -> McpError {
    invalid_argument(
        "headers",
        message,
        &[
            "Send an array of {\"key\": \"Accept\", \"value\": \"application/json\", \"enabled\": true} objects",
            "Or send a flat header map such as {\"Accept\": \"application/json\"}",
        ],
    )
}

pub(super) fn invalid_prompt_variables(message: impl Into<String>) -> McpError {
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

pub(super) fn invalid_api_auth(message: impl Into<String>) -> McpError {
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

#[cfg(test)]
mod tests {
    use super::super::MAX_MULTI_GET;

    use super::*;

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
}
