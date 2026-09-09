use super::*;

#[tool_router(router = snippets_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(description = "List devdrivr snippets. Returns JSON snippet records.", output_schema = list_page_schema("snippets"))]
    pub(super) async fn snippets_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let (total, rows) = self
            .page_rows::<SnippetRow>(
                resource_table(ResourceType::Snippets),
                &resource_filter(ResourceType::Snippets),
                resource_order(ResourceType::Snippets),
                args.query.as_deref(),
                page,
            )
            .await?;
        let mut values = Vec::with_capacity(rows.len());
        for row in rows {
            values.push(self.snippet_value(row).await?);
        }
        page_payload("snippets", values, page, total)
    }

    #[tool(description = "Get one devdrivr snippet by ID.")]
    pub(super) async fn snippets_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("snippets", "read").await?;
        let row = sqlx::query_as::<_, SnippetRow>(
            "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("snippets", &args.id))?;
        to_json_text(self.snippet_value(row).await?)
    }

    #[tool(description = "Create a devdrivr snippet.", output_schema = mutation_schema())]
    pub(super) async fn snippets_create(
        &self,
        Parameters(args): Parameters<SnippetCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("snippets", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let fragments = normalize_snippet_fragments(args.fragments, args.content, args.language)?;
        let primary = &fragments[0];
        let (folder_id, folder, pending_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, None)
            .await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        // A folder named by the legacy `folder` field is created here, so it commits with the
        // snippet that asked for it or not at all.
        if let Some(folder) = &pending_folder {
            Self::save_folder_in(&mut transaction, folder).await?;
        }
        sqlx::query(
            "INSERT INTO snippets (id, title, content, language, description, tags, folder, folder_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(&id)
        .bind(require_non_blank("title", &args.title)?)
        .bind(&primary.2)
        .bind(&primary.3)
        .bind(args.description.unwrap_or_default())
        .bind(string_vec_to_db_json(args.tags))
        .bind(folder)
        .bind(folder_id)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        Self::replace_snippet_fragments(&mut transaction, &id, &fragments, now).await?;
        transaction.commit().await.map_err(db_error)?;
        if pending_folder.is_some() {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "create", Some(id.clone()));
        self.mutation_result(ResourceType::Snippets, "create", &id)
            .await
    }

    #[tool(description = "Update a devdrivr snippet by ID.", output_schema = mutation_schema())]
    pub(super) async fn snippets_update(
        &self,
        Parameters(args): Parameters<SnippetUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("snippets", "update").await?;
        let current = sqlx::query_as::<_, SnippetRow>(
            "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("snippets", &args.id))?;
        check_expected_updated_at(
            "snippets",
            &args.id,
            args.expected_updated_at,
            current.updated_at,
        )?;
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| current.tags.clone());
        let replacement_fragments = args
            .fragments
            .map(|fragments| normalize_snippet_fragments(Some(fragments), None, None))
            .transpose()?;
        let content = replacement_fragments
            .as_ref()
            .map(|fragments| fragments[0].2.clone())
            .or(args.content)
            .unwrap_or_else(|| current.content.clone());
        let language = replacement_fragments
            .as_ref()
            .map(|fragments| fragments[0].3.clone())
            .or(args.language)
            .unwrap_or_else(|| current.language.clone());
        let (folder_id, folder, pending_folder) = self
            .resolve_snippet_folder(args.folder_id, args.folder, Some(&current))
            .await?;
        let now = now_ms();
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        if let Some(folder) = &pending_folder {
            Self::save_folder_in(&mut transaction, folder).await?;
        }
        sqlx::query(
            "UPDATE snippets SET title=$2, content=$3, language=$4, description=$5, tags=$6, folder=$7, folder_id=$8, updated_at=$9 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(match args.title {
            Some(title) => require_non_blank("title", &title)?,
            None => current.title,
        })
        .bind(&content)
        .bind(&language)
        .bind(args.description.unwrap_or(current.description))
        .bind(tags)
        .bind(folder)
        .bind(folder_id)
        .bind(now)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        if let Some(fragments) = replacement_fragments {
            Self::replace_snippet_fragments(&mut transaction, &args.id, &fragments, now).await?;
        } else {
            sqlx::query(
                "UPDATE snippet_fragments SET content=$2, language=$3, updated_at=$4 WHERE id = (SELECT id FROM snippet_fragments WHERE snippet_id=$1 ORDER BY sort_order LIMIT 1)",
            )
            .bind(&args.id)
            .bind(content)
            .bind(language)
            .bind(now)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        if pending_folder.is_some() {
            self.emit_changed("folders", "create", None);
        }
        self.emit_changed("snippets", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::Snippets, "update", &args.id)
            .await
    }

    #[tool(description = "Move a devdrivr snippet to durable Trash by ID.")]
    pub(super) async fn snippets_delete(
        &self,
        Parameters(args): Parameters<DeleteArgs>,
    ) -> McpResult {
        self.ensure_permission("snippets", "delete").await?;
        let result = sqlx::query(
            "UPDATE snippets SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL AND ($3 IS NULL OR updated_at = $3)",
        )
        .bind(&args.id)
        .bind(now_ms())
        .bind(args.expected_updated_at)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(self
                .deletion_failure("snippets", "snippets", &args.id, args.expected_updated_at)
                .await);
        }
        self.emit_changed("snippets", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
    }
}
