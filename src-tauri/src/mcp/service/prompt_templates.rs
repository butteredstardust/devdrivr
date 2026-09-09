use super::*;

#[tool_router(router = prompt_templates_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(description = "List devdrivr prompt templates, including persisted built-ins.", output_schema = list_page_schema("promptTemplates"))]
    pub(super) async fn prompt_templates_list(
        &self,
        Parameters(args): Parameters<ListArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let (total, rows) = self
            .page_rows::<PromptTemplateRow>(
                resource_table(ResourceType::PromptTemplates),
                &resource_filter(ResourceType::PromptTemplates),
                resource_order(ResourceType::PromptTemplates),
                args.query.as_deref(),
                page,
            )
            .await?;
        page_payload(
            "promptTemplates",
            rows.into_iter().map(prompt_to_json).collect(),
            page,
            total,
        )
    }

    #[tool(description = "Get one devdrivr prompt template by ID.")]
    pub(super) async fn prompt_templates_get(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "read").await?;
        let row = sqlx::query_as::<_, PromptTemplateRow>(
            "SELECT * FROM user_prompt_templates WHERE id = $1",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("promptTemplates", &args.id))?;
        to_json_text(prompt_to_json(row))
    }

    #[tool(description = "Create a user-owned devdrivr prompt template.", output_schema = mutation_schema())]
    pub(super) async fn prompt_templates_create(
        &self,
        Parameters(args): Parameters<PromptTemplateCreateArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "create").await?;
        let id = Uuid::new_v4().to_string();
        let now = now_ms();
        let prompt = require_non_blank("prompt", &args.prompt)?;
        sqlx::query(
            "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', $10, $11, $12, $13)",
        )
        .bind(&id)
        .bind(require_non_blank("name", &args.name)?)
        .bind(args.description.unwrap_or_default())
        .bind(
            args.category
                .as_deref()
                .map_or_else(|| Ok("productivity".to_string()), validate_template_category)?,
        )
        .bind(string_vec_to_db_json(args.tags))
        .bind(&prompt)
        .bind(normalize_prompt_variables(args.variables)?)
        .bind(estimated_tokens(&prompt))
        .bind(
            args.optimized_for
                .as_deref()
                .map_or_else(|| Ok("Generic".to_string()), validate_template_optimized_for)?,
        )
        .bind(args.version.unwrap_or_else(|| "1.0.0".to_string()))
        .bind(string_vec_to_db_json(args.tips))
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        self.emit_changed("promptTemplates", "create", Some(id.clone()));
        self.mutation_result(ResourceType::PromptTemplates, "create", &id)
            .await
    }

    #[tool(description = "Update a user prompt template. Updating a built-in creates a user copy.", output_schema = mutation_schema())]
    pub(super) async fn prompt_templates_update(
        &self,
        Parameters(args): Parameters<PromptTemplateUpdateArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "update").await?;
        let current = sqlx::query_as::<_, PromptTemplateRow>(
            "SELECT * FROM user_prompt_templates WHERE id = $1",
        )
        .bind(&args.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(db_error)?
        .ok_or_else(|| not_found("promptTemplates", &args.id))?;
        check_expected_updated_at(
            "promptTemplates",
            &args.id,
            args.expected_updated_at,
            current.updated_at,
        )?;
        // A built-in is never edited in place: the update becomes a new user-owned record. That
        // is a create, so it needs the create permission as well. Charging it to `update` alone
        // let an update-only grant add rows.
        let target_id = if current.author == "builtin" {
            self.ensure_permission("promptTemplates", "create").await?;
            Uuid::new_v4().to_string()
        } else {
            current.id.clone()
        };
        let now = now_ms();
        let prompt = match args.prompt {
            Some(prompt) => require_non_blank("prompt", &prompt)?,
            None => current.prompt,
        };
        let variables = match args.variables {
            Some(value) => normalize_prompt_variables(Some(value))?,
            None => current.variables_schema,
        };
        let tags = args
            .tags
            .map(|tags| serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.tags);
        let tips = args
            .tips
            .map(|tips| serde_json::to_string(&tips).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or(current.tips);
        let updated = sqlx::query(
            "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', $10, $11, $12, $13) ON CONFLICT(id) DO UPDATE SET name=$2, description=$3, category=$4, tags=$5, prompt=$6, variables_schema=$7, estimated_tokens=$8, optimized_for=$9, author='user', version=$10, tips=$11, updated_at=$13 WHERE ($14 IS NULL OR user_prompt_templates.updated_at = $14)",
        )
        .bind(&target_id)
        .bind(match args.name {
            Some(name) => require_non_blank("name", &name)?,
            None => current.name,
        })
        .bind(args.description.unwrap_or(current.description))
        .bind(
            args.category
                .as_deref()
                .map_or_else(|| Ok(heal_template_category(&current.category)), validate_template_category)?,
        )
        .bind(tags)
        .bind(&prompt)
        .bind(variables)
        .bind(estimated_tokens(&prompt))
        .bind(
            args.optimized_for
                .as_deref()
                .map_or_else(
                    || Ok(heal_template_optimized_for(&current.optimized_for)),
                    validate_template_optimized_for,
                )?,
        )
        .bind(args.version.unwrap_or(current.version))
        .bind(tips)
        .bind(if current.author == "builtin" { now } else { current.created_at })
        .bind(now)
        .bind(args.expected_updated_at)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if updated.rows_affected() == 0 {
            return Err(self
                .stale_write_failure(
                    ResourceType::PromptTemplates,
                    &target_id,
                    args.expected_updated_at,
                )
                .await);
        }
        self.emit_changed("promptTemplates", "update", Some(target_id.clone()));
        self.mutation_result(ResourceType::PromptTemplates, "update", &target_id)
            .await
    }

    #[tool(description = "Delete a user-owned devdrivr prompt template by ID.")]
    pub(super) async fn prompt_templates_delete(
        &self,
        Parameters(args): Parameters<DeleteArgs>,
    ) -> McpResult {
        self.ensure_permission("promptTemplates", "delete").await?;
        let result = sqlx::query(
            "DELETE FROM user_prompt_templates WHERE id = $1 AND author = 'user' AND ($2 IS NULL OR updated_at = $2)",
        )
        .bind(&args.id)
        .bind(args.expected_updated_at)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        if result.rows_affected() == 0 {
            // A built-in is refused whatever the expectation, so the conflict check runs first
            // only for rows that could have been deleted.
            if let Some(expected) = args.expected_updated_at {
                if let Some(actual) = sqlx::query_scalar::<_, i64>(
                    "SELECT updated_at FROM user_prompt_templates WHERE id = $1 AND author = 'user'",
                )
                .bind(&args.id)
                .fetch_optional(&self.pool)
                .await
                .map_err(db_error)?
                {
                    return Err(version_conflict("promptTemplates", &args.id, expected, actual));
                }
            }
            return Err(builtin_template_delete_denied(&args.id));
        }
        self.emit_changed("promptTemplates", "delete", Some(args.id));
        to_json_text(json!({ "deleted": true }))
    }
}
