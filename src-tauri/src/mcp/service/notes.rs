use super::*;

#[tool_router(router = notes_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(description = "List devdrivr notes. Returns compact JSON note records.", output_schema = list_page_schema("notes"))]
    pub(super) async fn notes_list(&self, Parameters(args): Parameters<ListArgs>) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let (total, rows) = self
            .page_rows::<NoteRow>(
                resource_table(ResourceType::Notes),
                &resource_filter(ResourceType::Notes),
                resource_order(ResourceType::Notes),
                args.query.as_deref(),
                page,
            )
            .await?;
        let mut values = Vec::with_capacity(rows.len());
        for row in rows {
            values.push(self.note_value(row).await?);
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

    #[tool(description = "Create a devdrivr note.", output_schema = mutation_schema())]
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
        let folder_id = args.folder_id.unwrap_or_else(|| "notes-inbox".to_string());
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
        self.require_folder_kind(&folder_id, "notes").await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        sqlx::query(
            "INSERT INTO notes (id, title, content, color, pinned, popped_out, created_at, updated_at, tags, folder_id, task_status, task_priority, task_due_date) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12)",
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
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        Self::replace_note_links(&mut transaction, &id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("notes", "create", Some(id.clone()));
        self.mutation_result(ResourceType::Notes, "create", &id)
            .await
    }

    #[tool(description = "Update a devdrivr note by ID.", output_schema = mutation_schema())]
    pub(super) async fn notes_update(
        &self,
        Parameters(args): Parameters<NoteUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("notes", "update").await?;
        let current = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
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
        let folder_id = args.folder_id.unwrap_or_else(|| {
            current
                .folder_id
                .unwrap_or_else(|| "notes-inbox".to_string())
        });
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
        self.require_folder_kind(&folder_id, "notes").await?;
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        let updated = sqlx::query(
            "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, folder_id=$7, updated_at=$8, task_status=$9, task_priority=$10, task_due_date=$11 WHERE id=$1 AND deleted_at IS NULL AND ($12 IS NULL OR updated_at = $12)",
        )
        .bind(&args.id)
        .bind(title)
        .bind(&content)
        .bind(color)
        .bind(if pinned { 1 } else { 0 })
        .bind(tags)
        .bind(folder_id)
        .bind(now_ms())
        .bind(task_status)
        .bind(task_priority)
        .bind(task_due_date)
        .bind(args.expected_updated_at)
        .execute(&mut *transaction)
        .await
        .map_err(db_error)?;
        if updated.rows_affected() == 0 {
            return Err(self
                .stale_write_failure(ResourceType::Notes, &args.id, args.expected_updated_at)
                .await);
        }
        Self::replace_note_links(&mut transaction, &args.id, &content).await?;
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("notes", "update", Some(args.id.clone()));
        self.mutation_result(ResourceType::Notes, "update", &args.id)
            .await
    }

    #[tool(description = "Move a devdrivr note to durable Trash by ID.")]
    pub(super) async fn notes_delete(&self, Parameters(args): Parameters<DeleteArgs>) -> McpResult {
        self.ensure_permission("notes", "delete").await?;
        // The expectation is part of the WHERE clause, so a record that changes between the
        // check and the write is still refused.
        let result = sqlx::query(
            "UPDATE notes SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL AND ($3 IS NULL OR updated_at = $3)",
        )
        .bind(&args.id)
        .bind(now_ms())
        .bind(args.expected_updated_at)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(self
                .stale_write_failure(ResourceType::Notes, &args.id, args.expected_updated_at)
                .await);
        }
        self.emit_changed("notes", "delete", Some(args.id));
        to_json_text(json!({ "trashed": true }))
    }
}
