use super::*;

#[tool_router(router = folders_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "List shared resource folders. Filter by notes, snippets, or apiRequests; only folders allowed by the matching read permission are returned."
    , output_schema = list_page_schema("folders"))]
    pub(super) async fn resource_folders_list(
        &self,
        Parameters(args): Parameters<FolderListArgs>,
    ) -> McpResult {
        let requested_kind = args.kind.as_deref().map(parse_folder_kind).transpose()?;
        let kinds = match requested_kind {
            Some(kind) => {
                self.ensure_permission(kind, "read").await?;
                vec![kind]
            }
            None => {
                let mut kinds = Vec::new();
                for kind in ["notes", "snippets", "apiRequests"] {
                    if self.ensure_permission(kind, "read").await.is_ok() {
                        kinds.push(kind);
                    }
                }
                kinds
            }
        };
        let rows = sqlx::query_as::<_, ResourceFolderRow>(
            "WITH RECURSIVE active_folders(id) AS (\
             SELECT id FROM resource_folders WHERE parent_id IS NULL AND deleted_at IS NULL \
             UNION ALL \
             SELECT child.id FROM resource_folders child JOIN active_folders parent ON child.parent_id = parent.id WHERE child.deleted_at IS NULL\
             ) SELECT folder.* FROM resource_folders folder JOIN active_folders ON folder.id = active_folders.id \
             ORDER BY folder.kind ASC, folder.parent_id ASC, folder.sort_order ASC, folder.name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        page_in_memory(
            "folders",
            rows.into_iter()
                .filter(|folder| {
                    kinds.contains(&folder.kind.as_str())
                        && matches_text(&folder.name, args.query.as_deref())
                })
                .map(resource_folder_to_json)
                .collect(),
            PageRequest::parse(args.limit, args.cursor.as_deref())?,
        )
    }

    #[tool(
        description = "Create a shared resource folder for notes, snippets, or saved API requests. API request folders remain compatible with API collections."
    )]
    pub(super) async fn resource_folders_create(
        &self,
        Parameters(args): Parameters<FolderCreateArgs>,
    ) -> McpResult {
        let kind = parse_folder_kind(&args.kind)?;
        self.ensure_permission(kind, "create").await?;
        let name = require_non_blank("name", &args.name)?;
        validate_default_language(kind, args.default_language.is_some())?;
        self.validate_folder_parent(kind, None, args.parent_id.as_deref())
            .await?;
        // CAST keeps the result SQLITE_FLOAT. SQLite gives an expression no column affinity, so
        // the literal 0 that COALESCE returns for an empty parent stays an INTEGER and sqlx
        // refuses to decode it as f64. That is what blocks the first folder under a new parent.
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE kind = $1 AND deleted_at IS NULL AND ((parent_id IS NULL AND $2 IS NULL) OR parent_id = $2)",
        )
        .bind(kind)
        .bind(&args.parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(db_error)?;
        let now = now_ms();
        let folder = ResourceFolderRow {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            parent_id: args.parent_id,
            kind: kind.to_string(),
            sort_order: max_sort + FOLDER_SORT_STEP,
            default_language: args.default_language,
            created_at: now,
            updated_at: now,
            deleted_at: None,
        };
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "create", Some(folder.id.clone()));
        self.emit_changed(kind, "create", Some(folder.id.clone()));
        if kind == "apiRequests" {
            self.emit_changed("apiCollections", "create", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
    }

    #[tool(
        description = "Rename or update an active shared resource folder. Use the dedicated Trash tools for deletion and recovery."
    )]
    pub(super) async fn resource_folders_update(
        &self,
        Parameters(args): Parameters<FolderUpdateArgs>,
    ) -> McpResult {
        let mut folder = self
            .folder_by_id(&args.id)
            .await?
            .ok_or_else(|| not_found("folders", &args.id))?;
        self.ensure_permission(&folder.kind, "update").await?;
        if is_system_inbox(&folder.id) {
            return Err(system_inbox_update_denied(&folder.id));
        }
        validate_default_language(&folder.kind, args.default_language.is_some())?;
        if let Some(name) = args.name {
            let name = name.trim();
            if name.is_empty() {
                return Err(invalid_argument(
                    "name",
                    "Folder name cannot be empty",
                    &["Provide a non-empty folder name"],
                ));
            }
            folder.name = name.to_string();
        }
        if let Some(default_language) = args.default_language {
            folder.default_language = default_language;
        }
        folder.updated_at = now_ms();
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "update", Some(folder.id.clone()));
        self.emit_changed(&folder.kind, "update", Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", "update", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
    }

    #[tool(
        description = "Move a shared resource folder under another folder of the same kind. Moves that would create a cycle are rejected."
    )]
    pub(super) async fn resource_folders_move(
        &self,
        Parameters(args): Parameters<FolderMoveArgs>,
    ) -> McpResult {
        let mut folder = self
            .folder_by_id(&args.id)
            .await?
            .ok_or_else(|| not_found("folders", &args.id))?;
        self.ensure_permission(&folder.kind, "update").await?;
        if is_system_inbox(&folder.id) {
            return Err(system_inbox_update_denied(&folder.id));
        }
        self.validate_folder_parent(&folder.kind, Some(&folder.id), args.parent_id.as_deref())
            .await?;
        // CAST keeps the result SQLITE_FLOAT. See the note in resource_folders_create.
        let max_sort = sqlx::query_scalar::<_, f64>(
            "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE kind = $1 AND id <> $2 AND deleted_at IS NULL AND ((parent_id IS NULL AND $3 IS NULL) OR parent_id = $3)",
        )
        .bind(&folder.kind)
        .bind(&folder.id)
        .bind(&args.parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(db_error)?;
        folder.parent_id = args.parent_id;
        folder.sort_order = max_sort + FOLDER_SORT_STEP;
        folder.updated_at = now_ms();
        self.save_folder(&folder).await?;
        self.emit_changed("folders", "update", Some(folder.id.clone()));
        self.emit_changed(&folder.kind, "update", Some(folder.id.clone()));
        if folder.kind == "apiRequests" {
            self.emit_changed("apiCollections", "update", Some(folder.id.clone()));
        }
        to_json_text(resource_folder_to_json(folder))
    }

    #[tool(
        description = "Move a folder subtree and its contained resources to trash. This never executes or exports saved API requests."
    )]
    pub(super) async fn resource_folders_trash(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        let folder = self
            .set_folder_subtree_trashed(&args.id, Some(now_ms()))
            .await?;
        self.emit_folder_subtree_changed(&folder, "delete");
        to_json_text(json!({ "trashed": true, "id": folder.id }))
    }

    #[tool(
        description = "Restore a trashed folder subtree and its contained resources. This never executes or exports saved API requests."
    )]
    pub(super) async fn resource_folders_restore(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        let folder = self.set_folder_subtree_trashed(&args.id, None).await?;
        self.emit_folder_subtree_changed(&folder, "update");
        to_json_text(json!({ "restored": true, "id": folder.id }))
    }

    #[tool(
        description = "Permanently delete a trashed folder subtree and trashed contained resources. This operation cannot be undone and never executes or exports API requests."
    )]
    pub(super) async fn resource_folders_permanent_delete(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        let folder = self.permanently_delete_folder_subtree(&args.id).await?;
        self.emit_folder_subtree_changed(&folder, "delete");
        to_json_text(json!({ "permanentlyDeleted": true, "id": folder.id }))
    }

    #[tool(
        description = "Permanently delete all trashed resources and folder subtrees for one kind. This cannot be undone and never executes or exports API requests."
    )]
    pub(super) async fn resource_folders_empty_trash(
        &self,
        Parameters(args): Parameters<EmptyTrashArgs>,
    ) -> McpResult {
        let kind = parse_folder_kind(&args.kind)?;
        self.ensure_permission(kind, "delete").await?;
        let roots = sqlx::query_scalar::<_, String>(
            "SELECT folder.id FROM resource_folders folder WHERE folder.kind = $1 AND folder.deleted_at IS NOT NULL \
             AND (folder.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM resource_folders parent WHERE parent.id = folder.parent_id AND parent.deleted_at IS NOT NULL))",
        )
        .bind(kind)
        .fetch_all(&self.pool)
        .await
        .map_err(db_error)?;
        let mut deleted_folders = 0usize;
        for id in roots {
            self.permanently_delete_folder_subtree(&id).await?;
            deleted_folders += 1;
        }
        let mut transaction = self.pool.begin().await.map_err(db_error)?;
        let deleted_resources = match kind {
            "notes" => sqlx::query("DELETE FROM notes WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            "snippets" => sqlx::query("DELETE FROM snippets WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            "apiRequests" => sqlx::query("DELETE FROM api_requests WHERE deleted_at IS NOT NULL")
                .execute(&mut *transaction)
                .await
                .map_err(db_error)?
                .rows_affected(),
            _ => unreachable!(),
        };
        transaction.commit().await.map_err(db_error)?;
        self.emit_changed("folders", "delete", None);
        self.emit_changed(kind, "delete", None);
        if kind == "apiRequests" {
            self.emit_changed("apiCollections", "delete", None);
        }
        to_json_text(json!({
            "permanentlyDeleted": true,
            "folderSubtrees": deleted_folders,
            "resources": deleted_resources,
        }))
    }
}
