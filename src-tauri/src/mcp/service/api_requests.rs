use super::*;

#[tool_router(router = api_requests_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(description = "List API client collections for assigning saved requests.", output_schema = list_page_schema("apiCollections"))]
    pub(super) async fn api_collections_list(
        &self,
        Parameters(args): Parameters<ListArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let (total, rows) = self
            .page_rows::<ApiCollectionRow>(
                "api_collections collection",
                &format!(
                    "collection.deleted_at IS NULL \
                     AND (collection.parent_id IS NULL OR EXISTS (SELECT 1 FROM resource_folders parent WHERE parent.id = collection.parent_id AND parent.deleted_at IS NULL)) \
                     AND ({})",
                    like_any(&["collection.name"])
                ),
                "collection.name ASC, collection.id ASC",
                args.query.as_deref(),
                page,
            )
            .await?;
        page_payload(
            "apiCollections",
            rows.into_iter().map(api_collection_to_json).collect(),
            page,
            total,
        )
    }

    #[tool(
        description = "List saved API client requests. Auth secrets are redacted unless allowed."
    , output_schema = list_page_schema("apiRequests"))]
    pub(super) async fn api_requests_list(
        &self,
        Parameters(args): Parameters<ListArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let (total, rows) = self
            .page_rows::<ApiRequestRow>(
                resource_table(ResourceType::ApiRequests),
                &resource_filter(ResourceType::ApiRequests),
                resource_order(ResourceType::ApiRequests),
                args.query.as_deref(),
                page,
            )
            .await?;
        let mut values = Vec::with_capacity(rows.len());
        for row in rows {
            values.push(self.api_request_value(row, expose_auth).await?);
        }
        page_payload("apiRequests", values, page, total)
    }

    #[tool(description = "Get one saved API client request by ID.")]
    pub(super) async fn api_requests_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("apiRequests", "read").await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let row = sqlx::query_as::<_, ApiRequestRow>(
            "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("apiRequests", &args.id))?;
        to_json_text(self.api_request_value(row, expose_auth).await?)
    }

    #[tool(description = "Create a saved API client request. This does not execute the request.", output_schema = mutation_schema())]
    pub(super) async fn api_requests_create(
        &self,
        Parameters(args): Parameters<ApiRequestCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let folder_id = resolve_folder_alias(args.folder_id, args.collection_id)?
            .unwrap_or_else(|| "api-requests-inbox".to_string());
        self.require_folder_kind(&folder_id, "apiRequests").await?;
        let method = validate_http_method(&args.method)?;
        let body_mode = match args.body_mode {
            Some(mode) => Some(validate_body_mode(&mode)?),
            None => None,
        };
        sqlx::query(
            "INSERT INTO api_requests (id, collection_id, name, method, url, headers, body, body_mode, auth, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(&id)
        .bind(folder_id)
        .bind(require_non_blank("name", &args.name)?)
        .bind(&method)
        .bind(require_non_blank("url", &args.url)?)
        .bind(normalize_api_headers(args.headers)?)
        .bind(args.body.unwrap_or_default())
        .bind(body_mode_for_method(&method, body_mode))
        .bind(match args.auth {
            Some(auth) => normalize_api_auth(strip_redaction_marker(auth))?,
            None => r#"{"type":"none"}"#.to_string(),
        })
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("apiRequests", "create", Some(id.clone()));
        self.mutation_result(ResourceType::ApiRequests, "create", &id)
            .await
    }

    #[tool(description = "Update a saved API client request by ID.", output_schema = mutation_schema())]
    pub(super) async fn api_requests_update(
        &self,
        Parameters(args): Parameters<ApiRequestUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "update").await?;
        let current = sqlx::query_as::<_, ApiRequestRow>(
            "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("apiRequests", &args.id))?;
        check_expected_updated_at(
            "apiRequests",
            &args.id,
            args.expected_updated_at,
            current.updated_at,
        )?;
        let auth = match args.auth {
            Some(value) => {
                // Resolve first: the redaction marker restores the secret the client never saw.
                let resolved = resolve_auth_update(value, &current.auth);
                normalize_api_auth(parse_json(&resolved, json!({ "type": "none" })))?
            }
            None => current.auth,
        };
        let headers = match args.headers {
            Some(value) => normalize_api_headers(Some(value))?,
            None => current.headers,
        };
        let folder_id = resolve_folder_alias(args.folder_id, args.collection_id)?
            .or(current.collection_id)
            .unwrap_or_else(|| "api-requests-inbox".to_string());
        self.require_folder_kind(&folder_id, "apiRequests").await?;
        let name = match args.name {
            Some(name) => require_non_blank("name", &name)?,
            None => current.name,
        };
        let url = match args.url {
            Some(url) => require_non_blank("url", &url)?,
            None => current.url,
        };
        let method = match args.method {
            Some(method) => validate_http_method(&method)?,
            None => current.method,
        };
        // A method that carries no body forces the mode to `none`, so switching GET to POST and
        // back cannot leave a body editor open on a request that never sends one.
        let body_mode = match args.body_mode {
            Some(mode) => Some(validate_body_mode(&mode)?),
            None => Some(current.body_mode),
        };
        sqlx::query(
            "UPDATE api_requests SET collection_id=$2, name=$3, method=$4, url=$5, headers=$6, body=$7, body_mode=$8, auth=$9, updated_at=$10 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(folder_id)
        .bind(name)
        .bind(&method)
        .bind(url)
        .bind(headers)
        .bind(args.body.unwrap_or(current.body))
        .bind(body_mode_for_method(&method, body_mode))
        .bind(auth)
        .bind(now_ms())
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("apiRequests", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::ApiRequests, "update", &args.id)
            .await
    }

    #[tool(description = "Move a saved API client request to durable Trash by ID.")]
    pub(super) async fn api_requests_delete(
        &self,
        Parameters(args): Parameters<DeleteArgs>,
    ) -> McpResult {
        self.ensure_permission("apiRequests", "delete").await?;
        let result = sqlx::query(
            "UPDATE api_requests SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL AND ($3 IS NULL OR updated_at = $3)",
        )
        .bind(&args.id)
        .bind(now_ms())
        .bind(args.expected_updated_at)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(self
                .deletion_failure(
                    "api_requests",
                    "apiRequests",
                    &args.id,
                    args.expected_updated_at,
                )
                .await);
        }
        self.emit_changed("apiRequests", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
    }
}
