//! Read records from the database and shape them as MCP results.

use super::*;

impl DevdrivrMcpService {
    pub(super) async fn fetch_resource_value(
        &self,
        resource_type: ResourceType,
        id: &str,
    ) -> std::result::Result<Option<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                let row = sqlx::query_as::<_, NoteRow>(
                    "SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.note_value(row).await?)),
                    None => Ok(None),
                }
            }
            ResourceType::Snippets => {
                let row = sqlx::query_as::<_, SnippetRow>(
                    "SELECT * FROM snippets WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.snippet_value(row).await?)),
                    None => Ok(None),
                }
            }
            ResourceType::PromptTemplates => sqlx::query_as::<_, PromptTemplateRow>(
                "SELECT * FROM user_prompt_templates WHERE id = $1",
            )
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map(|row| row.map(prompt_to_json))
            .map_err(db_error),
            ResourceType::ApiRequests => {
                let expose_auth = self.settings.read().await.api_requests_expose_secrets;
                let row = sqlx::query_as::<_, ApiRequestRow>(
                    "SELECT * FROM api_requests WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)?;
                match row {
                    Some(row) => Ok(Some(self.api_request_value(row, expose_auth).await?)),
                    None => Ok(None),
                }
            }
        }
    }

    /// Read the trashed records of one type, newest first.
    pub(super) async fn fetch_trashed_values(
        &self,
        resource_type: ResourceType,
        expose_auth: bool,
    ) -> std::result::Result<Vec<Value>, McpError> {
        match resource_type {
            ResourceType::Notes => {
                let rows = sqlx::query_as::<_, NoteRow>(
                    "SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.note_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::Snippets => {
                let rows = sqlx::query_as::<_, SnippetRow>(
                    "SELECT * FROM snippets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.snippet_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::ApiRequests => {
                let rows = sqlx::query_as::<_, ApiRequestRow>(
                    "SELECT * FROM api_requests WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
                )
                .fetch_all(&self.pool)
                .await
                .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.api_request_value(row, expose_auth).await?);
                }
                Ok(values)
            }
            // Deleting a prompt template removes the row, so there is nothing to list.
            ResourceType::PromptTemplates => Ok(Vec::new()),
        }
    }

    /// Count the matching rows, then read one page of them.
    ///
    /// WARNING: `filter` and `order` are composed into SQL. Build them from `like_any` and from
    /// literals only. The caller query reaches the database as the single bound `LIKE` pattern.
    ///
    /// Both queries share one filter, so `total` always describes the page's own result set.
    /// `order` must end in a unique column, or offset paging repeats a row across two pages.
    pub(super) async fn page_rows<Row>(
        &self,
        table: &str,
        filter: &str,
        order: &str,
        query: Option<&str>,
        page: PageRequest,
    ) -> std::result::Result<(i64, Vec<Row>), McpError>
    where
        Row: for<'row> FromRow<'row, sqlx::sqlite::SqliteRow> + Send + Unpin,
    {
        let pattern = like_pattern(query);
        let total =
            sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM {table} WHERE {filter}"))
                .bind(&pattern)
                .fetch_one(&self.pool)
                .await
                .map_err(db_error)?;
        let rows = sqlx::query_as::<_, Row>(&format!(
            "SELECT * FROM {table} WHERE {filter} ORDER BY {order} LIMIT $2 OFFSET $3"
        ))
        .bind(&pattern)
        .bind(page.probe_limit())
        .bind(page.offset())
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        Ok((total, rows))
    }

    /// Read every record of one type that matches `query`, hydrated for scoring.
    ///
    /// The database applies the filter, so a search hydrates the matching records only. Hydrating
    /// a note reads its folder path and its links, which made an unfiltered read cost one query
    /// per record in the table.
    ///
    /// An absent query still reads the whole type. Search ranks across all candidates, so it
    /// cannot stop early.
    pub(super) async fn fetch_resource_values(
        &self,
        resource_type: ResourceType,
        query: Option<&str>,
    ) -> std::result::Result<Vec<Value>, McpError> {
        let filter = resource_filter(resource_type);
        let order = resource_order(resource_type);
        let pattern = like_pattern(query);
        let sql = format!(
            "SELECT * FROM {table} WHERE {filter} ORDER BY {order}",
            table = resource_table(resource_type)
        );

        match resource_type {
            ResourceType::Notes => {
                let rows = sqlx::query_as::<_, NoteRow>(&sql)
                    .bind(&pattern)
                    .fetch_all(&self.pool)
                    .await
                    .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.note_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::Snippets => {
                let rows = sqlx::query_as::<_, SnippetRow>(&sql)
                    .bind(&pattern)
                    .fetch_all(&self.pool)
                    .await
                    .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.snippet_value(row).await?);
                }
                Ok(values)
            }
            ResourceType::PromptTemplates => sqlx::query_as::<_, PromptTemplateRow>(&sql)
                .bind(&pattern)
                .fetch_all(&self.pool)
                .await
                .map(|rows| rows.into_iter().map(prompt_to_json).collect())
                .map_err(db_error),
            ResourceType::ApiRequests => {
                let expose_auth = self.settings.read().await.api_requests_expose_secrets;
                let rows = sqlx::query_as::<_, ApiRequestRow>(&sql)
                    .bind(&pattern)
                    .fetch_all(&self.pool)
                    .await
                    .map_err(db_error)?;
                let mut values = Vec::with_capacity(rows.len());
                for row in rows {
                    values.push(self.api_request_value(row, expose_auth).await?);
                }
                Ok(values)
            }
        }
    }

    pub(super) async fn note_value(&self, row: NoteRow) -> std::result::Result<Value, McpError> {
        let note_id = row.id.clone();
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        let outgoing = sqlx::query_as::<_, (String, String)>(
            r#"SELECT target_kind, target_id FROM note_links link
               WHERE source_note_id = $1 AND (
                 (target_kind = 'note' AND EXISTS (SELECT 1 FROM notes target WHERE target.id = link.target_id AND target.deleted_at IS NULL)) OR
                 (target_kind = 'snippet' AND EXISTS (SELECT 1 FROM snippets target WHERE target.id = link.target_id AND target.deleted_at IS NULL)) OR
                 (target_kind = 'api-request' AND EXISTS (SELECT 1 FROM api_requests target WHERE target.id = link.target_id AND target.deleted_at IS NULL))
               ) ORDER BY target_kind, target_id"#,
        )
        .bind(&note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let backlinks = sqlx::query_as::<_, (String, String)>(
            r#"SELECT source.id, source.title FROM note_links link
               JOIN notes source ON source.id = link.source_note_id
               WHERE link.target_kind = 'note' AND link.target_id = $1
                 AND source.deleted_at IS NULL
               ORDER BY source.updated_at DESC"#,
        )
        .bind(&note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut value = note_to_json(row, folder_path);
        if let Value::Object(fields) = &mut value {
            fields.insert(
                "outgoingLinks".to_string(),
                json!(outgoing
                    .into_iter()
                    .map(|(kind, id)| json!({ "kind": kind, "id": id }))
                    .collect::<Vec<_>>()),
            );
            fields.insert(
                "backlinks".to_string(),
                json!(backlinks
                    .into_iter()
                    .map(|(id, title)| json!({ "id": id, "title": title }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(value)
    }

    pub(super) async fn snippet_value(
        &self,
        row: SnippetRow,
    ) -> std::result::Result<Value, McpError> {
        let snippet_id = row.id.clone();
        let folder_path = self.folder_path(row.folder_id.as_deref()).await?;
        let fragments = sqlx::query_as::<_, SnippetFragmentRow>(
            "SELECT id, name, content, language, sort_order, created_at, updated_at FROM snippet_fragments WHERE snippet_id = $1 ORDER BY sort_order, created_at",
        )
        .bind(snippet_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut value = snippet_to_json(row, folder_path);
        if let Value::Object(fields) = &mut value {
            fields.insert(
                "fragments".to_string(),
                json!(fragments
                    .into_iter()
                    .map(|fragment| json!({
                        "id": fragment.id,
                        "name": fragment.name,
                        "content": fragment.content,
                        "language": fragment.language,
                        "sortOrder": fragment.sort_order,
                        "createdAt": fragment.created_at,
                        "updatedAt": fragment.updated_at,
                    }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(value)
    }

    pub(super) async fn api_request_value(
        &self,
        row: ApiRequestRow,
        expose_auth: bool,
    ) -> std::result::Result<Value, McpError> {
        let folder_path = self.folder_path(row.collection_id.as_deref()).await?;
        Ok(api_request_to_json(row, folder_path, expose_auth))
    }

    pub(super) async fn count_resource(
        &self,
        resource_type: ResourceType,
    ) -> std::result::Result<i64, McpError> {
        let query = match resource_type {
            ResourceType::Notes => "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
            ResourceType::Snippets => "SELECT COUNT(*) FROM snippets WHERE deleted_at IS NULL",
            ResourceType::PromptTemplates => "SELECT COUNT(*) FROM user_prompt_templates",
            ResourceType::ApiRequests => {
                "SELECT COUNT(*) FROM api_requests WHERE deleted_at IS NULL"
            }
        };
        sqlx::query_scalar::<_, i64>(query)
            .fetch_one(&self.pool)
            .await
            .map_err(db_error)
    }
}
