//! Read, write and trash shared resource folders and their subtrees.

use super::*;

impl DevdrivrMcpService {
    pub(super) async fn folder_path(
        &self,
        folder_id: Option<&str>,
    ) -> std::result::Result<Vec<String>, McpError> {
        let Some(folder_id) = folder_id else {
            return Ok(Vec::new());
        };
        sqlx::query_scalar::<_, String>(
            "WITH RECURSIVE path(id, name, parent_id, depth) AS (\
             SELECT id, name, parent_id, 0 FROM resource_folders WHERE id = $1 AND deleted_at IS NULL \
             UNION ALL \
             SELECT folder.id, folder.name, folder.parent_id, path.depth + 1 \
             FROM resource_folders folder JOIN path ON path.parent_id = folder.id \
             WHERE path.depth < 100 AND folder.deleted_at IS NULL\
             ) SELECT name FROM path ORDER BY depth DESC",
        )
        .bind(folder_id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)
    }

    pub(super) async fn folder_by_id(
        &self,
        id: &str,
    ) -> std::result::Result<Option<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>(
            "SELECT * FROM resource_folders WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)
    }

    pub(super) async fn folder_by_id_including_trashed(
        &self,
        id: &str,
    ) -> std::result::Result<Option<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>("SELECT * FROM resource_folders WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)
    }

    pub(super) async fn folder_subtree(
        &self,
        id: &str,
    ) -> std::result::Result<Vec<ResourceFolderRow>, McpError> {
        sqlx::query_as::<_, ResourceFolderRow>(
            "WITH RECURSIVE subtree(id, depth) AS (\
             SELECT id, 0 FROM resource_folders WHERE id = $1 \
             UNION ALL \
             SELECT folder.id, subtree.depth + 1 FROM resource_folders folder \
             JOIN subtree ON folder.parent_id = subtree.id WHERE subtree.depth < 100\
             ) SELECT folder.* FROM resource_folders folder JOIN subtree ON folder.id = subtree.id \
             ORDER BY subtree.depth DESC",
        )
        .bind(id)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)
    }

    pub(super) async fn set_folder_subtree_trashed(
        &self,
        id: &str,
        deleted_at: Option<i64>,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let root = self
            .folder_by_id_including_trashed(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        let action = if deleted_at.is_some() {
            "delete"
        } else {
            "update"
        };
        self.ensure_permission(&root.kind, action).await?;
        if is_system_inbox(&root.id) {
            return Err(system_inbox_update_denied(&root.id));
        }
        if deleted_at.is_some() && root.deleted_at.is_some() {
            return Err(not_found("folders", id));
        }
        if deleted_at.is_none() && root.deleted_at.is_none() {
            return Err(invalid_argument(
                "id",
                "Folder is not in trash",
                &["Use resource_folders_trash first"],
            ));
        }
        let folders = self.folder_subtree(id).await?;
        let operation_timestamp = deleted_at.or(root.deleted_at);
        let updated_at = now_ms();
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        for folder in &folders {
            let affected_notes = if deleted_at.is_some() {
                sqlx::query_as::<_, (String, String)>(
                    "SELECT id, content FROM notes WHERE folder_id = $1 AND deleted_at IS NULL",
                )
                .bind(&folder.id)
                .fetch_all(&mut *transaction)
                .await
                .map_err(db_error)?
            } else {
                sqlx::query_as::<_, (String, String)>(
                    "SELECT id, content FROM notes WHERE folder_id = $1 AND deleted_at = $2",
                )
                .bind(&folder.id)
                .bind(operation_timestamp)
                .fetch_all(&mut *transaction)
                .await
                .map_err(db_error)?
            };
            let notes_query = if deleted_at.is_some() {
                "UPDATE notes SET deleted_at = $2, updated_at = MAX(updated_at + 1, $3) WHERE folder_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE notes SET deleted_at = NULL, updated_at = MAX(updated_at + 1, $3) WHERE folder_id = $1 AND deleted_at = $2"
            };
            sqlx::query(notes_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .bind(updated_at)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            for (note_id, content) in affected_notes {
                if deleted_at.is_some() {
                    sqlx::query("DELETE FROM note_links WHERE source_note_id = $1")
                        .bind(note_id)
                        .execute(&mut *transaction)
                        .await
                        .map_err(db_error)?;
                } else {
                    Self::replace_note_links(&mut transaction, &note_id, &content).await?;
                }
            }
            let snippets_query = if deleted_at.is_some() {
                "UPDATE snippets SET deleted_at = $2, updated_at = MAX(updated_at + 1, $3) WHERE folder_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE snippets SET deleted_at = NULL, updated_at = MAX(updated_at + 1, $3) WHERE folder_id = $1 AND deleted_at = $2"
            };
            sqlx::query(snippets_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .bind(updated_at)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let requests_query = if deleted_at.is_some() {
                "UPDATE api_requests SET deleted_at = $2 WHERE collection_id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE api_requests SET deleted_at = NULL WHERE collection_id = $1 AND deleted_at = $2"
            };
            sqlx::query(requests_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let collections_query = if deleted_at.is_some() {
                "UPDATE api_collections SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE api_collections SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2"
            };
            sqlx::query(collections_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            let folders_query = if deleted_at.is_some() {
                "UPDATE resource_folders SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL"
            } else {
                "UPDATE resource_folders SET deleted_at = NULL WHERE id = $1 AND deleted_at = $2"
            };
            sqlx::query(folders_query)
                .bind(&folder.id)
                .bind(operation_timestamp)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        Ok(root)
    }

    pub(super) fn emit_folder_subtree_changed(&self, folder: &ResourceFolderRow, action: &str) {
        self.emit_changed("folders", action, Some(folder.id.clone()));
        self.emit_changed(&folder.kind, action, Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", action, Some(folder.id.clone()));
        }
    }

    pub(super) async fn permanently_delete_folder_subtree(
        &self,
        id: &str,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let root = self
            .folder_by_id_including_trashed(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        self.ensure_permission(&root.kind, "delete").await?;
        if is_system_inbox(&root.id) {
            return Err(system_inbox_update_denied(&root.id));
        }
        if root.deleted_at.is_none() {
            return Err(invalid_argument(
                "id",
                "Only trashed folders can be permanently deleted",
                &["Use resource_folders_trash before permanent deletion"],
            ));
        }
        let folders = self.folder_subtree(id).await?;
        if folders.iter().any(|folder| folder.deleted_at.is_none()) {
            return Err(invalid_argument(
                "id",
                "The folder subtree contains restored folders",
                &["Trash the entire subtree before permanent deletion"],
            ));
        }
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        for folder in &folders {
            for query in [
                "SELECT COUNT(*) FROM notes WHERE folder_id = $1 AND deleted_at IS NULL",
                "SELECT COUNT(*) FROM snippets WHERE folder_id = $1 AND deleted_at IS NULL",
                "SELECT COUNT(*) FROM api_requests WHERE collection_id = $1 AND deleted_at IS NULL",
            ] {
                let active = sqlx::query_scalar::<_, i64>(query)
                    .bind(&folder.id)
                    .fetch_one(&mut *transaction)
                    .await
                    .map_err(db_error)?;
                if active > 0 {
                    return Err(invalid_argument(
                        "id",
                        "The folder subtree contains active resources",
                        &["Trash the entire subtree before permanent deletion"],
                    ));
                }
            }
        }
        for folder in &folders {
            sqlx::query("DELETE FROM notes WHERE folder_id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM snippets WHERE folder_id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query(
                "DELETE FROM api_requests WHERE collection_id = $1 AND deleted_at IS NOT NULL",
            )
            .bind(&folder.id)
            .execute(&mut *transaction)
            .await
            .map_err(db_error)?;
            sqlx::query("DELETE FROM api_collections WHERE id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
            sqlx::query("DELETE FROM resource_folders WHERE id = $1 AND deleted_at IS NOT NULL")
                .bind(&folder.id)
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?;
        }
        transaction.commit().await.map_err(db_error)?;
        Ok(root)
    }

    pub(super) async fn require_folder_kind(
        &self,
        id: &str,
        kind: &str,
    ) -> std::result::Result<ResourceFolderRow, McpError> {
        let folder = self
            .folder_by_id(id)
            .await?
            .ok_or_else(|| not_found("folders", id))?;
        if folder.kind != kind {
            return Err(invalid_argument(
                "folderId",
                format!("Folder {id} does not belong to {kind}"),
                &["Use a folder ID returned by resource_folders_list for this resource kind"],
            ));
        }
        Ok(folder)
    }

    pub(super) async fn save_folder(
        &self,
        folder: &ResourceFolderRow,
    ) -> std::result::Result<(), McpError> {
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        Self::save_folder_in(&mut transaction, folder).await?;
        transaction.commit().await.map_err(db_error)?;
        Ok(())
    }

    /// Write a folder inside a caller-owned transaction.
    ///
    /// Lets a folder created on the caller's behalf commit with the record that needed it. A
    /// folder written on its own connection survived a failed record insert as an empty folder.
    pub(super) async fn save_folder_in(
        transaction: &mut Transaction<'_, Sqlite>,
        folder: &ResourceFolderRow,
    ) -> std::result::Result<(), McpError> {
        sqlx::query(
            "INSERT INTO resource_folders (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, kind=$4, sort_order=$5, default_language=$6, updated_at=$8",
        )
        .bind(&folder.id)
        .bind(&folder.name)
        .bind(&folder.parent_id)
        .bind(&folder.kind)
        .bind(folder.sort_order)
        .bind(&folder.default_language)
        .bind(folder.created_at)
        .bind(folder.updated_at)
        .execute(&mut **transaction)
        .await
        .map_err(db_error)?;

        if folder.kind == "apiRequests" {
            sqlx::query(
                "INSERT INTO api_collections (id, name, parent_id, sort_order, default_language, created_at, updated_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7) \
                 ON CONFLICT(id) DO UPDATE SET name=$2, parent_id=$3, sort_order=$4, default_language=$5, updated_at=$7",
            )
            .bind(&folder.id)
            .bind(&folder.name)
            .bind(&folder.parent_id)
            .bind(folder.sort_order)
            .bind(&folder.default_language)
            .bind(folder.created_at)
            .bind(folder.updated_at)
            .execute(&mut **transaction)
            .await
            .map_err(db_error)?;
        }
        Ok(())
    }

    pub(super) async fn validate_folder_parent(
        &self,
        kind: &str,
        id: Option<&str>,
        parent_id: Option<&str>,
    ) -> std::result::Result<(), McpError> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };
        if id == Some(parent_id) {
            return Err(invalid_folder_parent("A folder cannot be its own parent"));
        }
        let parent = self.require_folder_kind(parent_id, kind).await?;
        let mut cursor = parent.parent_id;
        let mut visited = std::collections::HashSet::from([parent_id.to_string()]);
        while let Some(current_id) = cursor {
            if id == Some(current_id.as_str()) {
                return Err(invalid_folder_parent(
                    "A folder cannot be moved into its own subtree",
                ));
            }
            if !visited.insert(current_id.clone()) {
                return Err(invalid_folder_parent(
                    "The requested folder tree contains a cycle",
                ));
            }
            let ancestor = self.folder_by_id(&current_id).await?.ok_or_else(|| {
                invalid_folder_parent("A folder cannot be nested under a trashed ancestor")
            })?;
            cursor = ancestor.parent_id;
        }
        Ok(())
    }

    /// Settle which folder a snippet belongs to.
    ///
    /// WARNING: returns a folder to create rather than creating one. The caller must write it
    /// inside the snippet transaction, or a failed snippet insert leaves an empty folder behind.
    pub(super) async fn resolve_snippet_folder(
        &self,
        folder_id: Option<String>,
        legacy_folder: Option<String>,
        current: Option<&SnippetRow>,
    ) -> std::result::Result<(String, String, Option<ResourceFolderRow>), McpError> {
        if let Some(folder_id) = folder_id {
            let folder = self.require_folder_kind(&folder_id, "snippets").await?;
            return Ok((folder.id, folder.name, None));
        }
        if let Some(folder_name) = legacy_folder {
            if folder_name.is_empty() {
                return Ok(("snippets-inbox".to_string(), String::new(), None));
            }
            if let Some(folder) = sqlx::query_as::<_, ResourceFolderRow>(
                "SELECT * FROM resource_folders WHERE kind = 'snippets' AND name = $1 AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC LIMIT 1",
            )
            .bind(&folder_name)
            .fetch_optional(&self.pool)
            .await
            .map_err(db_error)? {
                return Ok((folder.id, folder_name, None));
            }
            let now = now_ms();
            let folder = ResourceFolderRow {
                id: Uuid::new_v4().to_string(),
                name: folder_name.clone(),
                parent_id: None,
                kind: "snippets".to_string(),
                sort_order: FOLDER_SORT_STEP,
                default_language: None,
                created_at: now,
                updated_at: now,
                deleted_at: None,
            };
            return Ok((folder.id.clone(), folder_name, Some(folder)));
        }
        Ok((
            current
                .and_then(|row| row.folder_id.clone())
                .unwrap_or_else(|| "snippets-inbox".to_string()),
            current.map(|row| row.folder.clone()).unwrap_or_default(),
            None,
        ))
    }
}
