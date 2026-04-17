use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePermissions {
    pub read: bool,
    pub create: bool,
    pub update: bool,
    pub delete: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPermissions {
    pub notes: ResourcePermissions,
    pub snippets: ResourcePermissions,
    pub prompt_templates: ResourcePermissions,
    pub api_requests: ResourcePermissions,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub api_key: String,
    pub permissions: McpPermissions,
    pub api_requests_expose_secrets: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub url: String,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDataChangedEvent {
    pub resource: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}
