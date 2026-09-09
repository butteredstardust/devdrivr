use super::*;

#[tool_router(router = trash_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "List records in devdrivr Trash. Prompt templates are deleted outright and never appear here."
    , output_schema = list_page_schema("trashed"))]
    pub(super) async fn trash_list(
        &self,
        Parameters(args): Parameters<TrashListArgs>,
    ) -> McpResult {
        let resource_types = self.readable_resource_types(args.types).await?;
        let expose_auth = self.settings.read().await.api_requests_expose_secrets;
        let mut values = Vec::new();
        for resource_type in resource_types {
            for mut value in self
                .fetch_trashed_values(resource_type, expose_auth)
                .await?
            {
                // Says which tool restores it, so the caller does not have to guess the type
                // back from the record shape.
                if let Value::Object(obj) = &mut value {
                    obj.insert(
                        "resource".to_string(),
                        Value::String(resource_type.key().to_string()),
                    );
                }
                values.push(value);
            }
        }
        values.retain(|value| matches_query(value, &args.query));
        page_in_memory(
            "trashed",
            values,
            PageRequest::parse(args.limit, args.cursor.as_deref())?,
        )
    }

    #[tool(
        description = "Restore one record from devdrivr Trash. Requires the update permission for its resource type."
    )]
    pub(super) async fn trash_restore(
        &self,
        Parameters(args): Parameters<TrashRestoreArgs>,
    ) -> McpResult {
        let resource_type = ResourceType::from_key(&args.resource_type)
            .ok_or_else(|| unsupported_resource_type(&args.resource_type))?;
        // Restoring puts a record back where other tools can change it, so it is charged to
        // `update` rather than to `delete`.
        self.ensure_permission(resource_type.key(), "update")
            .await?;
        let table = trash_table(resource_type)?;
        let result = sqlx::query(&format!(
            "UPDATE {table} SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL"
        ))
        .bind(&args.id)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            return Err(not_found(resource_type.key(), &args.id));
        }
        self.emit_changed(resource_type.key(), "update", Some(args.id.clone()));
        to_json_text(json!({
            "restored": true,
            "id": args.id,
            "resource": resource_type.key(),
        }))
    }
}
