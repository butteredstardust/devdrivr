//! Permission checks that gate every MCP tool call.

use super::*;

impl DevdrivrMcpService {
    pub(super) async fn permissions_for(&self, resource: &str) -> ResourcePermissions {
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

    pub(super) async fn resource_permission_allowed(
        &self,
        resource_type: ResourceType,
        action: &str,
    ) -> bool {
        let permissions = self.permissions_for(resource_type.key()).await;
        match action {
            "read" => permissions.read,
            "create" => permissions.create,
            "update" => permissions.update,
            "delete" => permissions.delete,
            _ => false,
        }
    }

    pub(super) async fn readable_resource_types(
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

    pub(super) async fn ensure_permission(
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
}
