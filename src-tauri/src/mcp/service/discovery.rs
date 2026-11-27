use super::*;

#[derive(Debug)]
struct SearchCandidate {
    resource_type: ResourceType,
    value: Value,
    score: i64,
    created_at: i64,
    updated_at: i64,
}

impl SearchCandidate {
    fn to_result(&self) -> Value {
        json!({
            "type": self.resource_type.key(),
            "id": self.value.get("id").and_then(Value::as_str).unwrap_or_default(),
            "title": resource_title(self.resource_type, &self.value),
            "summary": resource_summary(self.resource_type, &self.value),
            "tags": self.value.get("tags").cloned().unwrap_or_else(|| json!([])),
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "score": self.score,
        })
    }
}

fn resource_title(resource_type: ResourceType, value: &Value) -> String {
    let field = match resource_type {
        ResourceType::PromptTemplates | ResourceType::ApiRequests => "name",
        ResourceType::Notes | ResourceType::Snippets => "title",
    };
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn resource_summary(resource_type: ResourceType, value: &Value) -> String {
    let summary = match resource_type {
        ResourceType::Notes | ResourceType::Snippets => value
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        ResourceType::PromptTemplates => value
            .get("description")
            .and_then(Value::as_str)
            .filter(|description| !description.trim().is_empty())
            .or_else(|| value.get("prompt").and_then(Value::as_str))
            .unwrap_or_default()
            .to_string(),
        ResourceType::ApiRequests => {
            let method = value
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let url = value.get("url").and_then(Value::as_str).unwrap_or_default();
            format!("{method} {url}").trim().to_string()
        }
    };
    truncate_chars(summary.trim(), 220)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn value_i64(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or_default()
}

fn value_tags(value: &Value) -> Vec<String> {
    value
        .get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(Value::as_str)
                .map(|tag| tag.trim().to_lowercase())
                .filter(|tag| !tag.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn has_all_tags(value: &Value, required_tags: &[String]) -> bool {
    if required_tags.is_empty() {
        return true;
    }
    let tags = value_tags(value);
    required_tags
        .iter()
        .all(|required| tags.iter().any(|tag| tag == required))
}

fn matches_date_filters(value: &Value, args: &SearchArgs) -> bool {
    let created_at = value_i64(value, "createdAt");
    let updated_at = value_i64(value, "updatedAt");
    args.created_after.is_none_or(|after| created_at >= after)
        && args
            .created_before
            .is_none_or(|before| created_at <= before)
        && args.updated_after.is_none_or(|after| updated_at >= after)
        && args
            .updated_before
            .is_none_or(|before| updated_at <= before)
}

fn searchable_text(resource_type: ResourceType, value: &Value) -> String {
    match resource_type {
        ResourceType::Notes => format!(
            "{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::Snippets => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("fragments")
                .map_or_else(String::new, |fragments| {
                    fragments
                        .as_array()
                        .into_iter()
                        .flatten()
                        .flat_map(|fragment| {
                            ["name", "content", "language"].map(|field| {
                                fragment
                                    .get(field)
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                            })
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                }),
            value
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::PromptTemplates => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value_tags(value).join(" ")
        ),
        ResourceType::ApiRequests => format!(
            "{}\n{}\n{}\n{}\n{}",
            resource_title(resource_type, value),
            value
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value.get("url").and_then(Value::as_str).unwrap_or_default(),
            value
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            value.get("headers").cloned().unwrap_or_else(|| json!([]))
        ),
    }
}

fn search_score(resource_type: ResourceType, value: &Value, query: Option<&str>) -> Option<i64> {
    let Some(query) = query.map(str::trim).filter(|query| !query.is_empty()) else {
        return Some(1);
    };
    let query = query.to_lowercase();
    let title = resource_title(resource_type, value).to_lowercase();
    let tags = value_tags(value).join(" ");
    let text = searchable_text(resource_type, value).to_lowercase();
    let mut score = 0;

    if title == query {
        score += 120;
    } else if title.contains(&query) {
        score += 80;
    }
    if tags.split_whitespace().any(|tag| tag == query) {
        score += 60;
    } else if tags.contains(&query) {
        score += 40;
    }
    if text.contains(&query) {
        score += 20;
    }

    (score > 0).then_some(score)
}

fn build_search_candidate(
    resource_type: ResourceType,
    value: Value,
    query: Option<&str>,
    required_tags: &[String],
    args: &SearchArgs,
) -> Option<SearchCandidate> {
    if !has_all_tags(&value, required_tags) || !matches_date_filters(&value, args) {
        return None;
    }
    let score = search_score(resource_type, &value, query)?;
    Some(SearchCandidate {
        resource_type,
        created_at: value_i64(&value, "createdAt"),
        updated_at: value_i64(&value, "updatedAt"),
        value,
        score,
    })
}

fn compare_search_candidates(
    left: &SearchCandidate,
    right: &SearchCandidate,
    sort: SearchSort,
) -> Ordering {
    let ordering = match sort {
        SearchSort::Relevance => right
            .score
            .cmp(&left.score)
            .then_with(|| right.updated_at.cmp(&left.updated_at)),
        SearchSort::UpdatedDesc => right.updated_at.cmp(&left.updated_at),
        SearchSort::UpdatedAsc => left.updated_at.cmp(&right.updated_at),
        SearchSort::CreatedDesc => right.created_at.cmp(&left.created_at),
        SearchSort::CreatedAsc => left.created_at.cmp(&right.created_at),
    };
    ordering
        .then_with(|| left.resource_type.key().cmp(right.resource_type.key()))
        .then_with(|| {
            resource_title(left.resource_type, &left.value)
                .cmp(&resource_title(right.resource_type, &right.value))
        })
}

#[tool_router(router = discovery_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "Get topic-based help for devdrivr MCP. Topics: overview, tools, workflows, permissions, errors, schema, clients."
    )]
    pub(super) async fn help(&self, Parameters(args): Parameters<HelpArgs>) -> McpResult {
        let settings = self.settings.read().await.clone();
        super::discovery_help::render_help(args, &settings, &self.tool_router)
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
        super::discovery_help::render_introspection(settings)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn search_args() -> SearchArgs {
        SearchArgs {
            query: None,
            types: None,
            tags: None,
            created_after: None,
            created_before: None,
            updated_after: None,
            updated_before: None,
            limit: None,
            sort: None,
        }
    }

    #[test]
    fn search_candidate_applies_query_tag_and_date_filters() {
        let mut args = search_args();
        args.query = Some("React".to_string());
        args.tags = Some(vec!["frontend".to_string(), "auth".to_string()]);
        args.updated_after = Some(900);
        let required_tags = normalize_tags(args.tags.clone());
        let value = json!({
            "id": "note-1",
            "title": "React authentication",
            "content": "Token handling notes",
            "tags": ["frontend", "auth", "react"],
            "createdAt": 500,
            "updatedAt": 1000
        });

        let candidate = build_search_candidate(
            ResourceType::Notes,
            value.clone(),
            args.query.as_deref(),
            &required_tags,
            &args,
        )
        .expect("candidate should match");

        assert_eq!(candidate.resource_type, ResourceType::Notes);
        assert!(candidate.score >= 80);

        args.updated_after = Some(1100);
        assert!(build_search_candidate(
            ResourceType::Notes,
            value,
            args.query.as_deref(),
            &required_tags,
            &args,
        )
        .is_none());
    }

    #[test]
    fn search_sort_orders_by_relevance_then_updated_date() {
        let mut lower = SearchCandidate {
            resource_type: ResourceType::Notes,
            value: json!({
                "id": "note-1",
                "title": "React",
                "content": "",
                "tags": [],
                "createdAt": 100,
                "updatedAt": 300
            }),
            score: 20,
            created_at: 100,
            updated_at: 300,
        };
        let higher = SearchCandidate {
            resource_type: ResourceType::Snippets,
            value: json!({
                "id": "snippet-1",
                "title": "React auth helper",
                "content": "",
                "tags": [],
                "createdAt": 50,
                "updatedAt": 200
            }),
            score: 80,
            created_at: 50,
            updated_at: 200,
        };

        assert_eq!(
            compare_search_candidates(&higher, &lower, SearchSort::Relevance),
            Ordering::Less
        );

        lower.score = 80;
        assert_eq!(
            compare_search_candidates(&lower, &higher, SearchSort::Relevance),
            Ordering::Less
        );
    }
}
