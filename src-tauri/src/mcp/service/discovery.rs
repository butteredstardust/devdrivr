use super::*;

#[tool_router(router = discovery_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "Get topic-based help for devdrivr MCP. Topics: overview, tools, workflows, permissions, errors, schema, clients."
    )]
    pub(super) async fn help(&self, Parameters(args): Parameters<HelpArgs>) -> McpResult {
        let topic = normalize_help_topic(args.topic.as_deref())?;
        let settings = self.settings.read().await.clone();
        let content = match topic {
            "overview" => help_overview(&settings),
            "tools" => help_tools_from_router(&self.tool_router),
            "workflows" => help_workflows(),
            "permissions" => help_permissions(&settings),
            "errors" => help_errors(),
            "schema" => help_schema(&settings),
            "clients" => help_clients(&settings),
            _ => return Err(unknown_help_topic(topic)),
        };
        help_response(topic, content)
    }

    #[tool(
        description = "Search notes, snippets, prompt templates, and saved API requests with type, tag, date, limit, and sort filters."
    )]
    pub(super) async fn search(&self, Parameters(args): Parameters<SearchArgs>) -> McpResult {
        let limit = normalize_limit(args.limit)?;
        let requested_types = args.types.clone();
        let resource_types = self.readable_resource_types(requested_types).await?;
        let required_tags = normalize_tags(args.tags.clone());
        let sort = args.sort.unwrap_or(SearchSort::Relevance);
        let mut candidates = Vec::new();

        for resource_type in resource_types {
            for value in self
                .fetch_resource_values(resource_type, args.query.as_deref())
                .await?
            {
                if let Some(candidate) = build_search_candidate(
                    resource_type,
                    value,
                    args.query.as_deref(),
                    &required_tags,
                    &args,
                ) {
                    candidates.push(candidate);
                }
            }
        }

        candidates.sort_by(|left, right| compare_search_candidates(left, right, sort));
        let total_matches = candidates.len();
        candidates.truncate(limit);
        let results = candidates
            .iter()
            .map(SearchCandidate::to_result)
            .collect::<Vec<_>>();
        to_json_text(json!({
            "results": results,
            "count": results.len(),
            "totalMatches": total_matches,
            "limit": limit,
        }))
    }

    #[tool(description = "Fetch multiple devdrivr resources by type and ID in one call.")]
    pub(super) async fn multi_get(&self, Parameters(args): Parameters<MultiGetArgs>) -> McpResult {
        if args.ids.is_empty() {
            return Err(invalid_argument(
                "ids",
                "ids must include at least one resource identifier",
                &[
                    "Pass one or more objects with type and id",
                    "Use search to discover resource IDs before calling multi_get",
                ],
            ));
        }
        if args.ids.len() > MAX_MULTI_GET {
            return Err(batch_too_large("ids", args.ids.len(), MAX_MULTI_GET));
        }

        let mut resources = Vec::with_capacity(args.ids.len());
        for resource_id in args.ids {
            let resource_type = ResourceType::from_key(resource_id.resource_type.trim())
                .ok_or_else(|| unsupported_resource_type(&resource_id.resource_type))?;
            if !self
                .resource_permission_allowed(resource_type, "read")
                .await
            {
                return Err(permission_denied(resource_type.key(), "read"));
            }
            match self
                .fetch_resource_value(resource_type, &resource_id.id)
                .await?
            {
                Some(resource) => resources.push(json!({
                    "type": resource_type.key(),
                    "id": resource_id.id,
                    "ok": true,
                    "resource": resource,
                })),
                None => resources.push(json!({
                    "type": resource_type.key(),
                    "id": resource_id.id,
                    "ok": false,
                    "error": error_data(
                        "RESOURCE_NOT_FOUND",
                        Some(resource_type.key()),
                        Some("read"),
                        Some(&resource_id.id),
                        None,
                        &[
                            "Check the resource ID and type",
                            "Use search or the matching list tool to find current resource IDs",
                        ],
                    ),
                })),
            }
        }

        to_json_text(json!({ "resources": resources }))
    }

    #[tool(
        description = "Get complete schema metadata for devdrivr MCP resources, tools, settings, and permissions."
    )]
    pub(super) async fn introspect(&self) -> McpResult {
        let settings = self.settings.read().await.clone();
        to_json_text(json!({
            "resources": {
                "notes": {
                    "description": "User notes with markdown-compatible content.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "color": "yellow|green|blue|pink|purple|orange|red|gray",
                        "pinned": "boolean",
                        "poppedOut": "boolean",
                        "windowBounds": "object|null",
                        "tags": "string[]",
                        "folderId": "string (defaults to notes-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "taskStatus": "todo|in_progress|done|blocked|null",
                        "taskPriority": "low|medium|high|null",
                        "taskDueDate": "string|null (local YYYY-MM-DD date)",
                        "outgoingLinks": "{kind,id}[] (live stable targets)",
                        "backlinks": "{id,title}[] (live source notes)",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["title", "content", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": [],
                    "updateRequired": ["id"],
                    "example": {
                        "title": "Architecture notes",
                        "content": "Decision notes...",
                        "tags": ["architecture"]
                    }
                },
                "snippets": {
                    "description": "Reusable code or text snippets with ordered fragments.",
                    "fields": {
                        "id": "string",
                        "title": "string",
                        "content": "string",
                        "language": "string",
                        "description": "string (Markdown)",
                        "fragments": "{id,name,content,language,sortOrder,createdAt,updatedAt}[]",
                        "folder": "string",
                        "folderId": "string (defaults to snippets-inbox; legacy folder is accepted)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "tags": "string[]",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["title", "description", "fragments.name", "fragments.content", "fragments.language", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": ["title"],
                    "updateRequired": ["id"],
                    "example": {
                        "title": "Fetch wrapper",
                        "description": "Fetch JSON with consistent error handling.",
                        "fragments": [{ "name": "client.ts", "content": "async function request() {}", "language": "typescript" }],
                        "tags": ["typescript"]
                    }
                },
                "promptTemplates": {
                    "description": "Built-in and user-owned prompt templates.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "description": "string",
                        "category": "code-review|refactoring|testing|docs|debugging|learning|productivity",
                        "tags": "string[]",
                        "prompt": "string",
                        "variables": "{ name, label, type: text|textarea|select, placeholder?, options?: string[], required? }[]",
                        "estimatedTokens": "number",
                        "optimizedFor": "Claude|ChatGPT|Cursor|Generic",
                        "author": "builtin|user",
                        "version": "string",
                        "tips": "string[]",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["name", "description", "category", "prompt", "tags"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": true,
                    "createRequired": ["name", "prompt"],
                    "updateRequired": ["id"],
                    "deleteConstraint": "Only user-owned templates can be deleted.",
                    "example": {
                        "name": "Review PR",
                        "prompt": "Review this diff: {{diff}}",
                        "tags": ["code-review"]
                    }
                },
                "apiRequests": {
                    "description": "Saved API client requests. This MCP does not execute HTTP requests.",
                    "fields": {
                        "id": "string",
                        "collectionId": "string|null",
                        "folderId": "string (compatibility alias for collectionId; defaults to api-requests-inbox)",
                        "folderPath": "string[] (computed from resource folder ancestry)",
                        "name": "string",
                        "method": "string",
                        "url": "string",
                        "headers": "{ key, value, enabled }[] (a flat header map is converted on write)",
                        "body": "string",
                        "bodyMode": "string",
                        "auth": "{ type: none } | { type: bearer, token } | { type: basic, username, password }",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "searchableFields": ["name", "method", "url", "headers", "body"],
                    "dateFields": ["createdAt", "updatedAt"],
                    "tags": false,
                    "createRequired": ["name", "method", "url"],
                    "updateRequired": ["id"],
                    "redaction": {
                        "authSecretsRedactedByDefault": !settings.api_requests_expose_secrets,
                        "redactedValue": REDACTED_AUTH_VALUE,
                        "marker": "__devdrivrRedacted"
                    },
                    "example": {
                        "name": "Get user",
                        "method": "GET",
                        "url": "https://api.example.test/users/123"
                    }
                }
            },
            "supportingResources": {
                "apiCollections": {
                    "description": "API request collection compatibility records for assigning saved requests.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "parentId": "string|null",
                        "sortOrder": "number",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "tools": ["api_collections_list"]
                },
                "resourceFolders": {
                    "description": "Typed hierarchical folders for notes, snippets, and API requests, with durable Trash actions.",
                    "fields": {
                        "id": "string",
                        "name": "string",
                        "parentId": "string|null",
                        "kind": "notes|snippets|apiRequests",
                        "sortOrder": "number",
                        "defaultLanguage": "string|null",
                        "createdAt": "number (Unix milliseconds)",
                        "updatedAt": "number (Unix milliseconds)"
                    },
                    "tools": ["resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"]
                }
            },
            "tools": {
                "discovery": ["help", "search", "multi_get", "introspect", "counts"],
                "notes": ["notes_list", "notes_get", "notes_create", "notes_update", "notes_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
                "snippets": ["snippets_list", "snippets_get", "snippets_create", "snippets_update", "snippets_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
                "promptTemplates": ["prompt_templates_list", "prompt_templates_get", "prompt_templates_create", "prompt_templates_update", "prompt_templates_delete"],
                "apiRequests": ["api_requests_list", "api_requests_get", "api_requests_create", "api_requests_update", "api_requests_delete", "resource_folders_list", "resource_folders_create", "resource_folders_update", "resource_folders_move", "resource_folders_trash", "resource_folders_restore", "resource_folders_permanent_delete", "resource_folders_empty_trash"],
            },
            "permissions": {
                "notes": settings.permissions.notes,
                "snippets": settings.permissions.snippets,
                "promptTemplates": settings.permissions.prompt_templates,
                "apiRequests": settings.permissions.api_requests,
            },
            "settings": {
                "host": {
                    "type": "string",
                    "current": settings.host,
                    "constraint": "MVP binds to 127.0.0.1 only"
                },
                "port": {
                    "type": "number",
                    "current": settings.port,
                    "constraint": "1024-65535"
                },
                "apiKey": {
                    "type": "string",
                    "description": "Bearer token required in Authorization header. The key is never returned by introspect."
                },
                "enabled": settings.enabled,
                "apiRequestsExposeSecrets": settings.api_requests_expose_secrets
            }
        }))
    }

    #[tool(
        description = "Get aggregate counts for devdrivr MCP primary resources without fetching records."
    )]
    pub(super) async fn counts(&self, Parameters(args): Parameters<CountsArgs>) -> McpResult {
        let resource_types = self.readable_resource_types(args.types).await?;
        let mut counts = serde_json::Map::new();
        for resource_type in resource_types {
            counts.insert(
                resource_type.key().to_string(),
                Value::Number(self.count_resource(resource_type).await?.into()),
            );
        }
        to_json_text(Value::Object(counts))
    }
}
