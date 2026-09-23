//! Resource kinds the MCP tools address, and parsers for their names.

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum ResourceType {
    Notes,
    Snippets,
    PromptTemplates,
    ApiRequests,
}

impl ResourceType {
    pub(super) const ALL: [ResourceType; 4] = [
        ResourceType::Notes,
        ResourceType::Snippets,
        ResourceType::PromptTemplates,
        ResourceType::ApiRequests,
    ];

    pub(super) fn key(self) -> &'static str {
        match self {
            ResourceType::Notes => "notes",
            ResourceType::Snippets => "snippets",
            ResourceType::PromptTemplates => "promptTemplates",
            ResourceType::ApiRequests => "apiRequests",
        }
    }

    pub(super) fn from_key(key: &str) -> Option<Self> {
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
pub(super) enum SearchSort {
    Relevance,
    UpdatedDesc,
    UpdatedAsc,
    CreatedDesc,
    CreatedAsc,
}

pub(super) fn unique_resource_types(types: Vec<ResourceType>) -> Vec<ResourceType> {
    let mut unique = Vec::new();
    for resource_type in types {
        if !unique.contains(&resource_type) {
            unique.push(resource_type);
        }
    }
    unique
}

pub(super) fn parse_resource_types(
    types: Vec<String>,
) -> std::result::Result<Vec<ResourceType>, McpError> {
    types
        .into_iter()
        .map(|resource_type| {
            ResourceType::from_key(resource_type.trim())
                .ok_or_else(|| unsupported_resource_type(&resource_type))
        })
        .collect::<std::result::Result<Vec<_>, _>>()
        .map(unique_resource_types)
}

/// The table a trashed record of this type lives in.
///
/// WARNING: the returned name is interpolated into SQL. It is a literal from this module.
pub(super) fn trash_table(
    resource_type: ResourceType,
) -> std::result::Result<&'static str, McpError> {
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

pub(super) fn parse_folder_kind(kind: &str) -> std::result::Result<&'static str, McpError> {
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

pub(super) fn is_system_inbox(id: &str) -> bool {
    SYSTEM_INBOX_IDS.contains(&id)
}
