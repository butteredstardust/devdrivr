use super::*;

#[tool_router(router = notes_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(description = "List devdrivr notes with optional folder, tag, external key and query filters. Behavior change: content is omitted by default. Pass includeContent: true or use notes_get or multi_get for full content.", output_schema = list_page_schema("notes"))]
    pub(super) async fn notes_list(&self, Parameters(args): Parameters<NoteListArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        if let Some(key) = &args.external_key {
            validate_sync_key("externalKey", key)?;
        }
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        let (folder, _) = self
            .resolve_note_folder(
                &mut transaction,
                args.folder_id,
                args.folder.as_deref(),
                false,
            )
            .await?;
        let filter = format!(
            "{} AND ($2 IS NULL OR folder_id = $2) AND ($3 IS NULL OR external_key = $3) AND ($4 IS NULL OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(tags) THEN tags ELSE '[]' END) WHERE type = 'text' AND value = $4))",
            resource_filter(ResourceType::Notes),
        );
        let pattern = like_pattern(args.query.as_deref());
        let total =
            sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM notes WHERE {filter}"))
                .bind(&pattern)
                .bind(&folder)
                .bind(&args.external_key)
                .bind(&args.tag)
                .fetch_one(&mut *transaction)
                .await
                .map_err(db_error)?;
        let include_content = args.include_content.unwrap_or(false);
        let rows = sqlx::query_as::<_, NoteRow>(&format!(
            "SELECT id, title, CASE WHEN $5 THEN content ELSE '' END AS content, length(CAST(content AS BLOB)) AS content_length, color, pinned, popped_out, window_x, window_y, window_width, window_height, created_at, updated_at, tags, folder_id, deleted_at, task_status, task_priority, task_due_date, external_key FROM notes WHERE {filter} ORDER BY {} LIMIT $6 OFFSET $7",
            resource_order(ResourceType::Notes),
        ))
        .bind(pattern).bind(folder).bind(args.external_key).bind(args.tag).bind(include_content)
        .bind(page.probe_limit()).bind(page.offset())
        .fetch_all(&mut *transaction).await.map_err(db_error)?;
        transaction.commit().await.map_err(db_error)?;
        let mut values = Vec::with_capacity(rows.len());
        for row in rows {
            if include_content {
                values.push(self.note_value(row).await?);
            } else {
                let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
                values.push(json!({
                    "id": row.id, "title": row.title, "color": row.color, "pinned": row.pinned == 1,
                    "folderId": row.folder_id, "folderPath": folder_path,
                    "tags": parse_json(row.tags.as_deref().unwrap_or("[]"), json!([])),
                    "externalKey": row.external_key, "createdAt": row.created_at,
                    "updatedAt": row.updated_at, "contentLength": row.content_length,
                }));
            }
        }
        page_payload("notes", values, page, total)
    }

    #[tool(description = "Get one devdrivr note by ID.")]
    pub(super) async fn notes_get(&self, Parameters(args): Parameters<IdArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let row = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("notes", &args.id))?;
        to_json_text(self.note_value(row).await?)
    }

    #[tool(description = "Create a devdrivr note by folderId or slash-separated folder path with an optional externalKey. Notes render CommonMark with GFM tables, strikethrough, autolinks and task lists. Raw HTML is discarded and rendered output is sanitized. Use italic text below an image for captions. Use devdrivr-asset:<uuid> for managed images. Limits: 1 MiB Markdown content, 10 MiB per image and 100 items per upsert batch.", output_schema = mutation_schema())]
    pub(super) async fn notes_create(
        &self,
        Parameters(args): Parameters<NoteCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("notes", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let title = args.title.unwrap_or_default();
        let content = args.content.unwrap_or_default();
        let color = args
            .color
            .as_deref()
            .map_or_else(|| Ok("yellow".to_string()), validate_note_color)?;
        let pinned = args.pinned.unwrap_or(false);
        let tags = string_vec_to_db_json(args.tags);
        if let Some(key) = &args.external_key {
            validate_sync_key("externalKey", key)?;
        }
        let task_priority = args
            .task_priority
            .as_deref()
            .map(validate_task_priority)
            .transpose()?;
        let task_due_date = args
            .task_due_date
            .as_deref()
            .map(validate_task_due_date)
            .transpose()?;
        let task_status = args
            .task_status
            .as_deref()
            .map(validate_task_status)
            .transpose()?
            .or_else(|| {
                (task_priority.is_some() || task_due_date.is_some()).then(|| "todo".to_string())
            });
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let (folder_id, created_folders) = self
            .resolve_note_folder(
                &mut transaction,
                args.folder_id,
                args.folder.as_deref(),
                true,
            )
            .await?;
        let folder_id = folder_id.as_deref().unwrap_or("notes-inbox");
        sqlx::query(
            "INSERT INTO notes (id, title, content, color, pinned, popped_out, created_at, updated_at, tags, folder_id, task_status, task_priority, task_due_date, external_key) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13)",
        )
        .bind(&id)
        .bind(title)
        .bind(&content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(now)
        .bind(now)
        .bind(tags)
        .bind(folder_id)
        .bind(task_status)
        .bind(task_priority)
        .bind(task_due_date)
        .bind(&args.external_key)
        .execute(&mut *transaction)
        .await
        .map_err(|error| note_key_write_error(error, args.external_key.as_deref()))?;
        Self::replace_note_links(&mut transaction, &id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_note_folders_created(created_folders);
        self.emit_changed("notes", "create", Some(id.clone()));
        self.mutation_result(ResourceType::Notes, "create", &id)
            .await
    }

    #[tool(description = "Update a devdrivr note by ID. An empty externalKey clears it. Notes render CommonMark with GFM tables, strikethrough, autolinks and task lists. Raw HTML is discarded and rendered output is sanitized. Use italic text below an image for captions. Use devdrivr-asset:<uuid> for managed images. Limits: 1 MiB Markdown content, 10 MiB per image and 100 items per upsert batch.", output_schema = mutation_schema())]
    pub(super) async fn notes_update(
        &self,
        Parameters(args): Parameters<NoteUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("notes", "update").await?;
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let current = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("notes", &args.id))?;
        check_expected_updated_at(
            "notes",
            &args.id,
            args.expected_updated_at,
            current.updated_at,
        )?;
        let title = args.title.unwrap_or_else(|| current.title.clone());
        let content = args.content.unwrap_or_else(|| current.content.clone());
        let color = args
            .color
            .as_deref()
            .map_or_else(|| Ok(heal_note_color(&current.color)), validate_note_color)?;
        let pinned = args.pinned.unwrap_or(current.pinned == 1);
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| current.tags.unwrap_or_else(|| "[]".to_string()));
        let external_key = match args.external_key {
            Some(key) if key.is_empty() => None,
            Some(key) => {
                validate_sync_key("externalKey", &key)?;
                Some(key)
            }
            None => current.external_key,
        };
        let supplied_task_status = args
            .task_status
            .as_deref()
            .map(validate_task_status)
            .transpose()?;
        let supplied_task_priority = args
            .task_priority
            .as_deref()
            .map(validate_task_priority)
            .transpose()?;
        let supplied_task_due_date = args
            .task_due_date
            .as_deref()
            .map(validate_task_due_date)
            .transpose()?;
        let clear_task_metadata = args.clear_task_metadata.unwrap_or(false);
        if clear_task_metadata
            && (supplied_task_status.is_some()
                || supplied_task_priority.is_some()
                || supplied_task_due_date.is_some())
        {
            return Err(invalid_argument(
                "clearTaskMetadata",
                "Task metadata cannot be supplied while clearing it",
                &["Remove taskStatus, taskPriority, and taskDueDate from this request"],
            ));
        }
        let task_priority = if clear_task_metadata || args.clear_task_priority.unwrap_or(false) {
            None
        } else {
            supplied_task_priority.or(current.task_priority)
        };
        let task_due_date = if clear_task_metadata || args.clear_task_due_date.unwrap_or(false) {
            None
        } else {
            supplied_task_due_date.or(current.task_due_date)
        };
        let task_status = if clear_task_metadata {
            None
        } else {
            supplied_task_status.or(current.task_status).or_else(|| {
                (task_priority.is_some() || task_due_date.is_some()).then(|| "todo".to_string())
            })
        };
        let (folder_id, created_folders) = self
            .resolve_note_folder(
                &mut transaction,
                args.folder_id,
                args.folder.as_deref(),
                true,
            )
            .await?;
        let folder_id = folder_id.or(current.folder_id);
        let updated_at = std::cmp::max(now_ms(), current.updated_at + 1);
        sqlx::query(
            "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, folder_id=$7, updated_at=$8, task_status=$9, task_priority=$10, task_due_date=$11, external_key=$12 WHERE id=$1",
        )
        .bind(&args.id)
        .bind(title)
        .bind(&content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(tags)
        .bind(folder_id)
        .bind(updated_at)
        .bind(task_status)
        .bind(task_priority)
        .bind(task_due_date)
        .bind(&external_key)
        .execute(&mut *transaction)
        .await
        .map_err(|error| note_key_write_error(error, external_key.as_deref()))?;
        Self::replace_note_links(&mut transaction, &args.id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_note_folders_created(created_folders);
        self.emit_changed("notes", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::Notes, "update", &args.id)
            .await
    }

    #[tool(description = "Move a devdrivr note to durable Trash by ID.")]
    pub(super) async fn notes_delete(&self, Parameters(args): Parameters<DeleteArgs>) -> McpResult {
        self.ensure_permission("notes", "delete").await?;
        // The expectation is part of the WHERE clause, so a record that changes between the
        // check and the write is still refused.
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        let result = sqlx::query(
            "UPDATE notes SET deleted_at = $2, updated_at = MAX(updated_at + 1, $2) WHERE id = $1 AND deleted_at IS NULL AND ($3 IS NULL OR updated_at = $3)",
        )
        .bind(&args.id)
        .bind(now_ms())
        .bind(args.expected_updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            transaction.rollback().await.map_err(db_error)?;
            return Err(self
                .stale_write_failure(ResourceType::Notes, &args.id, args.expected_updated_at)
                .await);
        }
        sqlx::query("DELETE FROM note_links WHERE source_note_id = $1")
            .bind(&args.id)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("notes", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
    }
}
