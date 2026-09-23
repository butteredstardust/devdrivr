use super::*;
use crate::mcp::types::McpPermissions;

/// The production migrations, in the order `lib.rs` applies them.
///
/// Include the shipped files so schema changes reach the tests and cannot diverge from a
/// hand-written test schema.
const MIGRATIONS: [&str; 16] = [
    include_str!("../../../migrations/001_initial.sql"),
    include_str!("../../../migrations/002_api_client.sql"),
    include_str!("../../../migrations/003_notes_tags.sql"),
    include_str!("../../../migrations/004_history_metadata.sql"),
    include_str!("../../../migrations/005_snippets_folder.sql"),
    include_str!("../../../migrations/006_prompt_templates.sql"),
    include_str!("../../../migrations/007_prompt_template_authors.sql"),
    include_str!("../../../migrations/008_notes_sort_order.sql"),
    include_str!("../../../migrations/009_persistence_backfills.sql"),
    include_str!("../../../migrations/011_api_history_response.sql"),
    include_str!("../../../migrations/012_snippets_favorite.sql"),
    include_str!("../../../migrations/013_resource_folders.sql"),
    include_str!("../../../migrations/014_durable_trash.sql"),
    include_str!("../../../migrations/015_note_tasks.sql"),
    include_str!("../../../migrations/016_note_links.sql"),
    include_str!("../../../migrations/017_snippet_fragments.sql"),
];

fn resource_permissions(
    read: bool,
    create: bool,
    update: bool,
    delete: bool,
) -> ResourcePermissions {
    ResourcePermissions {
        read,
        create,
        update,
        delete,
    }
}

fn all_permissions(value: ResourcePermissions) -> McpPermissions {
    McpPermissions {
        notes: value.clone(),
        snippets: value.clone(),
        prompt_templates: value.clone(),
        api_requests: value,
    }
}

fn settings_with(permissions: McpPermissions) -> McpSettings {
    McpSettings {
        enabled: true,
        host: "127.0.0.1".to_string(),
        port: 17347,
        api_key: "test-key".to_string(),
        permissions,
        api_requests_expose_secrets: false,
    }
}

/// Build a service against an in-memory database carrying the real schema.
///
/// WARNING: `sqlite::memory:` gives each connection its own database, so the pool is capped
/// at one connection. A larger pool would run the migrations on one connection and the
/// queries on an empty one.
async fn service_with(permissions: McpPermissions) -> DevdrivrMcpService {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("pool");
    for migration in MIGRATIONS {
        // `raw_sql` runs a multi-statement script. Splitting on `;` would cut trigger bodies
        // in half, because a BEGIN ... END block contains its own statement terminators.
        sqlx::raw_sql(migration)
            .execute(&pool)
            .await
            .unwrap_or_else(|err| panic!("migration failed: {err}"));
    }
    DevdrivrMcpService::new_detached(pool, Arc::new(RwLock::new(settings_with(permissions))))
}

/// The tool handlers return JSON inside a text content block. Parse it back out.
fn result_json(result: &CallToolResult) -> Value {
    let text = result
        .content
        .first()
        .and_then(|content| content.as_text())
        .map(|text| text.text.clone())
        .expect("a text content block");
    serde_json::from_str(&text).expect("valid JSON in the content block")
}

fn note_create_args(title: &str) -> NoteCreateArgs {
    serde_json::from_value(json!({ "title": title, "content": "body" })).expect("note create args")
}

/// A committed write must never be reported as a failure.
///
/// Settings grants create, update, delete and read independently, so returning the record
/// through the read-gated getter answered a successful write with PERMISSION_DENIED, and an
/// agent that retried wrote the row twice.
/// A list without a limit returned every row. `limit: 0` returned one row instead of an error.
/// The transport caps a whole request. These cap the parts, so an oversized field names
/// itself instead of failing as a bare transport error.
/// The MCP contract must accept exactly what the API Client accepts. A free-text method or
/// body mode reached the database and produced a request the tool could not run.
/// Two agents editing one note both read, both wrote, and the second discarded the first
/// without a word.
/// A record deleted through MCP had no way back through MCP.
/// A client that parses results should not have to parse the text block back into JSON.
mod structured_results {
    use super::*;

    #[tokio::test]
    async fn a_list_carries_the_same_payload_as_structured_content() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        service
            .notes_create(Parameters(note_create_args("one")))
            .await
            .expect("create");
        let result = service
            .notes_list(Parameters(
                serde_json::from_value(json!({})).expect("list args"),
            ))
            .await
            .expect("list");

        let structured = result
            .structured_content
            .as_ref()
            .expect("structured content");
        assert_eq!(structured, &result_json(&result));
        assert_eq!(structured["total"], 1);
    }
}

mod trash {
    use super::*;

    async fn service_with_a_trashed_note() -> (DevdrivrMcpService, String) {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        let created = result_json(
            &service
                .notes_create(Parameters(note_create_args("gone")))
                .await
                .expect("create"),
        );
        let id = created["id"].as_str().expect("id").to_string();
        let args: DeleteArgs = serde_json::from_value(json!({ "id": &id })).expect("delete args");
        service
            .notes_delete(Parameters(args))
            .await
            .expect("delete");
        (service, id)
    }

    fn trash_list_args() -> TrashListArgs {
        serde_json::from_value(json!({})).expect("trash list args")
    }

    #[tokio::test]
    async fn a_trashed_record_is_listed_with_its_resource_type() {
        let (service, id) = service_with_a_trashed_note().await;
        let json = result_json(
            &service
                .trash_list(Parameters(trash_list_args()))
                .await
                .expect("trash list"),
        );
        let items = json["trashed"].as_array().expect("trashed");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], json!(id));
        assert_eq!(items[0]["resource"], "notes");
    }

    #[tokio::test]
    async fn restoring_puts_the_record_back_in_the_list() {
        let (service, id) = service_with_a_trashed_note().await;
        let args: TrashRestoreArgs =
            serde_json::from_value(json!({ "type": "notes", "id": &id })).expect("restore args");
        service
            .trash_restore(Parameters(args))
            .await
            .expect("restore");

        let listed = result_json(
            &service
                .notes_list(Parameters(
                    serde_json::from_value(json!({})).expect("list args"),
                ))
                .await
                .expect("list"),
        );
        assert_eq!(listed["total"], 1);
    }

    #[tokio::test]
    async fn restoring_needs_the_update_permission() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, false, true,
        )))
        .await;
        let args: TrashRestoreArgs =
            serde_json::from_value(json!({ "type": "notes", "id": "any" })).expect("restore args");
        let error = service
            .trash_restore(Parameters(args))
            .await
            .expect_err("restore without update permission");
        assert_eq!(
            error.data.as_ref().expect("data")["code"],
            "PERMISSION_DENIED"
        );
    }

    #[tokio::test]
    async fn prompt_templates_cannot_be_restored() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        let args: TrashRestoreArgs =
            serde_json::from_value(json!({ "type": "promptTemplates", "id": "any" }))
                .expect("restore args");
        let error = service
            .trash_restore(Parameters(args))
            .await
            .expect_err("prompt templates never enter trash");
        assert!(error.message.contains("Trash"));
    }
}

mod optimistic_concurrency {
    use super::*;

    async fn service_with_a_note() -> (DevdrivrMcpService, String, i64) {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        let created = result_json(
            &service
                .notes_create(Parameters(note_create_args("first")))
                .await
                .expect("create"),
        );
        let id = created["id"].as_str().expect("id").to_string();
        let updated_at = created["record"]["updatedAt"].as_i64().expect("updatedAt");
        (service, id, updated_at)
    }

    fn note_update(id: &str, expected: Option<i64>) -> NoteUpdateArgs {
        let mut value = json!({ "id": id, "title": "second" });
        if let (Value::Object(obj), Some(expected)) = (&mut value, expected) {
            obj.insert("expectedUpdatedAt".to_string(), json!(expected));
        }
        serde_json::from_value(value).expect("update args")
    }

    #[tokio::test]
    async fn an_update_against_the_read_version_succeeds() {
        let (service, id, updated_at) = service_with_a_note().await;
        assert!(service
            .notes_update(Parameters(note_update(&id, Some(updated_at))))
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn an_update_against_a_stale_version_is_refused() {
        let (service, id, updated_at) = service_with_a_note().await;
        let error = service
            .notes_update(Parameters(note_update(&id, Some(updated_at - 1))))
            .await
            .expect_err("stale update");
        assert_eq!(error.data.as_ref().expect("data")["code"], "CONFLICT");

        let title = sqlx::query_scalar::<_, String>("SELECT title FROM notes WHERE id = $1")
            .bind(&id)
            .fetch_one(&service.pool)
            .await
            .expect("title");
        assert_eq!(title, "first", "the refused update must not have written");
    }

    #[tokio::test]
    async fn an_update_without_an_expectation_still_writes() {
        let (service, id, _) = service_with_a_note().await;
        assert!(service
            .notes_update(Parameters(note_update(&id, None)))
            .await
            .is_ok());
    }

    /// The guard rides on the last parameter of each `UPDATE`. A misnumbered one would
    /// compare against the wrong column value and refuse a write the caller is entitled to
    /// make, so every guarded resource needs a passing case, not only notes.
    #[tokio::test]
    async fn a_guarded_update_of_every_resource_writes_against_its_read_version() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;

        let snippet = result_json(
            &service
                .snippets_create(Parameters(
                    serde_json::from_value(json!({ "title": "first", "content": "body" }))
                        .expect("snippet create args"),
                ))
                .await
                .expect("create snippet"),
        );
        service
            .snippets_update(Parameters(
                serde_json::from_value(json!({
                    "id": snippet["id"],
                    "title": "second",
                    "expectedUpdatedAt": snippet["record"]["updatedAt"],
                }))
                .expect("snippet update args"),
            ))
            .await
            .expect("guarded snippet update");

        let request = result_json(
            &service
                .api_requests_create(Parameters(
                    serde_json::from_value(json!({
                        "name": "first",
                        "method": "GET",
                        "url": "https://example.test",
                    }))
                    .expect("api request create args"),
                ))
                .await
                .expect("create api request"),
        );
        service
            .api_requests_update(Parameters(
                serde_json::from_value(json!({
                    "id": request["id"],
                    "name": "second",
                    "expectedUpdatedAt": request["record"]["updatedAt"],
                }))
                .expect("api request update args"),
            ))
            .await
            .expect("guarded api request update");

        let template = result_json(
            &service
                .prompt_templates_create(Parameters(
                    serde_json::from_value(json!({ "name": "first", "prompt": "body" }))
                        .expect("template create args"),
                ))
                .await
                .expect("create template"),
        );
        service
            .prompt_templates_update(Parameters(
                serde_json::from_value(json!({
                    "id": template["id"],
                    "name": "second",
                    "expectedUpdatedAt": template["record"]["updatedAt"],
                }))
                .expect("template update args"),
            ))
            .await
            .expect("guarded template update");
    }

    #[tokio::test]
    async fn a_delete_against_a_stale_version_is_refused() {
        let (service, id, updated_at) = service_with_a_note().await;
        let args: DeleteArgs =
            serde_json::from_value(json!({ "id": &id, "expectedUpdatedAt": updated_at - 1 }))
                .expect("delete args");
        let error = service
            .notes_delete(Parameters(args))
            .await
            .expect_err("stale delete");
        assert_eq!(error.data.as_ref().expect("data")["code"], "CONFLICT");
    }

    #[tokio::test]
    async fn a_delete_of_a_missing_record_still_reports_not_found() {
        let (service, _, updated_at) = service_with_a_note().await;
        let args: DeleteArgs =
            serde_json::from_value(json!({ "id": "missing", "expectedUpdatedAt": updated_at }))
                .expect("delete args");
        let error = service
            .notes_delete(Parameters(args))
            .await
            .expect_err("missing record");
        assert_eq!(
            error.data.as_ref().expect("data")["code"],
            "RESOURCE_NOT_FOUND"
        );
    }
}

mod api_request_contract {
    use super::*;

    /// The contract both sides read. A method added to one side and forgotten on the other
    /// fails here instead of reaching a user.
    #[test]
    fn the_rust_constants_match_the_shared_contract() {
        let contract: Value =
            serde_json::from_str(include_str!("../../../../shared/api-request-contract.json"))
                .expect("shared contract");
        assert_eq!(contract["methods"], json!(HTTP_METHODS));
        assert_eq!(contract["bodyMethods"], json!(BODY_METHODS));
        assert_eq!(contract["bodyModes"], json!(BODY_MODES));
    }

    #[test]
    fn methods_are_accepted_case_insensitively() {
        assert_eq!(validate_http_method("post").expect("post"), "POST");
        assert_eq!(validate_http_method(" GET ").expect("get"), "GET");
    }

    #[test]
    fn an_unknown_method_is_rejected() {
        let error = validate_http_method("TRACE").expect_err("unknown method");
        assert_eq!(error.data.as_ref().expect("data")["argument"], "method");
    }

    #[test]
    fn an_unknown_body_mode_is_rejected() {
        assert_eq!(validate_body_mode("JSON").expect("json"), "json");
        assert!(validate_body_mode("xml").is_err());
    }

    #[test]
    fn a_method_without_a_body_forces_the_none_mode() {
        assert_eq!(
            body_mode_for_method("GET", Some("json".to_string())),
            "none"
        );
        assert_eq!(body_mode_for_method("HEAD", None), "none");
        assert_eq!(body_mode_for_method("POST", None), "json");
        assert_eq!(
            body_mode_for_method("POST", Some("text".to_string())),
            "text"
        );
    }

    #[test]
    fn conflicting_folder_aliases_are_rejected() {
        assert_eq!(
            resolve_folder_alias(Some("a".to_string()), Some("a".to_string())).expect("same"),
            Some("a".to_string())
        );
        assert_eq!(
            resolve_folder_alias(None, Some("legacy".to_string())).expect("legacy only"),
            Some("legacy".to_string())
        );
        assert!(resolve_folder_alias(Some("a".to_string()), Some("b".to_string())).is_err());
    }

    #[test]
    fn a_blank_required_string_is_rejected() {
        assert_eq!(require_non_blank("name", "  hi  ").expect("trimmed"), "hi");
        assert!(require_non_blank("name", "   ").is_err());
    }

    #[test]
    fn fragments_repeating_an_id_are_rejected() {
        let fragments: Vec<SnippetFragmentInput> = serde_json::from_value(json!([
            { "id": "same", "name": "one", "content": "a" },
            { "id": "same", "name": "two", "content": "b" },
        ]))
        .expect("fragments");
        let error = normalize_snippet_fragments(Some(fragments), None, None)
            .expect_err("duplicate fragment ids");
        assert!(error.message.contains("repeats the id"));
    }

    #[tokio::test]
    async fn a_create_with_an_unknown_method_writes_nothing() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        let args: ApiRequestCreateArgs = serde_json::from_value(json!({
            "name": "probe",
            "method": "FETCH",
            "url": "https://example.test",
        }))
        .expect("create args");

        assert!(service.api_requests_create(Parameters(args)).await.is_err());
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM api_requests")
            .fetch_one(&service.pool)
            .await
            .expect("count");
        assert_eq!(count, 0);
    }
}

mod wiki_link_contract {
    use super::*;

    #[test]
    fn the_rust_parser_matches_every_shared_case() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../../../shared/wiki-link-cases.json"))
                .expect("shared wiki-link cases");
        for case in cases {
            let name = case["name"].as_str().expect("case name");
            let content = case["content"].as_str().expect("case content");
            assert_eq!(
                json!(stable_note_link_targets(content)),
                case["targets"],
                "{name}"
            );
        }
    }
}

mod argument_budget {
    use super::*;

    #[test]
    fn ordinary_arguments_pass() {
        let value = json!({ "title": "note", "tags": ["a", "b"], "nested": { "x": [1, 2] } });
        assert!(check_argument_budget(&value, 1).is_ok());
    }

    #[test]
    fn an_oversized_string_is_rejected() {
        let value = json!("x".repeat(MAX_TEXT_FIELD_BYTES + 1));
        let error = check_argument_budget(&value, 1).expect_err("oversized string");
        assert_eq!(error.data.as_ref().expect("data")["code"], "RESOURCE_LIMIT");
    }

    #[test]
    fn an_oversized_string_nested_in_an_array_is_rejected() {
        let value = json!([{ "content": "x".repeat(MAX_TEXT_FIELD_BYTES + 1) }]);
        assert!(check_argument_budget(&value, 1).is_err());
    }

    #[test]
    fn an_oversized_array_is_rejected() {
        let value = Value::Array(vec![json!(1); MAX_ARRAY_ITEMS + 1]);
        let error = check_argument_budget(&value, 1).expect_err("oversized array");
        assert!(error.message.contains("maximum"));
    }

    #[test]
    fn arguments_nested_past_the_depth_cap_are_rejected() {
        let mut value = json!(1);
        for _ in 0..MAX_ARGUMENT_DEPTH + 1 {
            value = json!([value]);
        }
        let error = check_argument_budget(&value, 1).expect_err("over-nested arguments");
        assert!(error.message.contains("nest"));
    }
}

mod list_bounds {
    use super::*;

    async fn service_with_notes(count: usize) -> DevdrivrMcpService {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        for index in 0..count {
            service
                .notes_create(Parameters(note_create_args(&format!("note {index}"))))
                .await
                .expect("create a note");
        }
        service
    }

    fn list_args(limit: Option<i64>) -> ListArgs {
        let mut value = json!({});
        if let (Value::Object(obj), Some(limit)) = (&mut value, limit) {
            obj.insert("limit".to_string(), json!(limit));
        }
        serde_json::from_value(value).expect("list args")
    }

    #[tokio::test]
    async fn an_absent_limit_returns_the_default_page() {
        let service = service_with_notes(52).await;
        let result = service
            .notes_list(Parameters(list_args(None)))
            .await
            .expect("list");
        let json = result_json(&result);
        assert_eq!(json["notes"].as_array().expect("notes").len(), 50);
        assert_eq!(json["total"], 52);
        assert_eq!(json["limit"], 50);
        assert_eq!(json["hasMore"], true);
    }

    #[tokio::test]
    async fn a_full_page_reports_no_more() {
        let service = service_with_notes(3).await;
        let json = result_json(
            &service
                .notes_list(Parameters(list_args(Some(3))))
                .await
                .expect("list"),
        );
        assert_eq!(json["notes"].as_array().expect("notes").len(), 3);
        assert_eq!(json["hasMore"], false);
    }

    #[tokio::test]
    async fn a_limit_above_the_cap_is_clamped() {
        let service = service_with_notes(1).await;
        let json = result_json(
            &service
                .notes_list(Parameters(list_args(Some(9_000))))
                .await
                .expect("list"),
        );
        assert_eq!(json["limit"], 500);
    }

    #[tokio::test]
    async fn a_non_positive_limit_is_rejected() {
        let service = service_with_notes(1).await;
        let error = service
            .notes_list(Parameters(list_args(Some(0))))
            .await
            .expect_err("zero limit must fail");
        assert!(error.message.contains("greater than zero"));
    }
}

/// A published output schema must describe what the tool really returns.
mod output_schemas {
    use super::*;

    fn tool_named(service: &DevdrivrMcpService, name: &str) -> rmcp::model::Tool {
        service
            .tool_router
            .get(name)
            .cloned()
            .unwrap_or_else(|| panic!("{name} must be registered"))
    }

    async fn service() -> DevdrivrMcpService {
        service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await
    }

    /// Every field the schema requires must be present in a real response, or a client that
    /// validates rejects a correct answer.
    #[tokio::test]
    async fn a_list_response_carries_every_field_its_schema_requires() {
        let service = service().await;
        let schema = tool_named(&service, "notes_list")
            .output_schema
            .expect("notes_list must publish an output schema");
        let payload = result_json(
            &service
                .notes_list(Parameters(
                    serde_json::from_value(json!({})).expect("list args"),
                ))
                .await
                .expect("list"),
        );

        let required = schema["required"].as_array().expect("required");
        assert!(!required.is_empty());
        for field in required {
            let field = field.as_str().expect("field name");
            assert!(
                payload.get(field).is_some(),
                "notes_list must return the required field {field}"
            );
        }
        assert!(schema["properties"].get("notes").is_some());
    }

    #[tokio::test]
    async fn a_write_receipt_carries_every_field_its_schema_requires() {
        let service = service().await;
        let schema = tool_named(&service, "notes_create")
            .output_schema
            .expect("notes_create must publish an output schema");
        let payload = result_json(
            &service
                .notes_create(Parameters(note_create_args("one")))
                .await
                .expect("create"),
        );

        for field in schema["required"].as_array().expect("required") {
            let field = field.as_str().expect("field name");
            assert!(
                payload.get(field).is_some(),
                "notes_create must return the required field {field}"
            );
        }
        // `record` is optional, because a write-only client is never shown the record.
        assert!(schema["properties"].get("record").is_some());
    }
}

/// The database applies the search filter, so it must match every field the score reads.
mod search_filter {
    use super::*;

    async fn service_with_snippet(value: Value) -> DevdrivrMcpService {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        service
            .snippets_create(Parameters(
                serde_json::from_value(value).expect("snippet create args"),
            ))
            .await
            .expect("create a snippet");
        service
    }

    async fn search_titles(service: &DevdrivrMcpService, query: &str) -> Vec<String> {
        let payload = result_json(
            &service
                .search(Parameters(
                    serde_json::from_value(json!({ "query": query, "types": ["snippets"] }))
                        .expect("search args"),
                ))
                .await
                .expect("search"),
        );
        payload["results"]
            .as_array()
            .expect("results")
            .iter()
            .map(|result| result["title"].as_str().unwrap_or_default().to_string())
            .collect()
    }

    /// A fragment holds its own text. Filtering on the snippet columns alone would hide a
    /// snippet whose only match is inside a fragment.
    #[tokio::test]
    async fn a_snippet_matches_through_its_fragment() {
        let service = service_with_snippet(json!({
            "title": "helpers",
            "fragments": [
                { "name": "setup", "content": "connect to sqlite", "language": "rust" },
                { "name": "teardown", "content": "close the pool", "language": "rust" }
            ]
        }))
        .await;

        assert_eq!(search_titles(&service, "teardown").await, ["helpers"]);
        assert_eq!(search_titles(&service, "close the pool").await, ["helpers"]);
    }

    #[tokio::test]
    async fn a_snippet_that_matches_nothing_is_not_returned() {
        let service = service_with_snippet(json!({
            "title": "helpers",
            "content": "connect to sqlite",
            "language": "rust"
        }))
        .await;

        assert!(search_titles(&service, "postgres").await.is_empty());
    }
}

/// A list must read one page from the database, not the whole table.
///
/// The filter and the page both belong in SQL. Loading every note to hydrate its folder path
/// and links, only to drop all but fifty, cost the same whether the caller asked for one
/// record or all of them.
mod list_paging {
    use super::*;

    fn list_args(value: Value) -> ListArgs {
        serde_json::from_value(value).expect("list args")
    }

    async fn service_with_titles(titles: &[&str]) -> DevdrivrMcpService {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;
        for title in titles {
            service
                .notes_create(Parameters(note_create_args(title)))
                .await
                .expect("create a note");
        }
        service
    }

    fn titles(payload: &Value) -> Vec<String> {
        payload["notes"]
            .as_array()
            .expect("notes")
            .iter()
            .map(|note| note["title"].as_str().expect("title").to_string())
            .collect()
    }

    #[tokio::test]
    async fn a_cursor_walks_every_record_exactly_once() {
        let service = service_with_titles(&["one", "two", "three", "four", "five"]).await;
        let mut seen = Vec::new();
        let mut cursor = Value::Null;

        loop {
            let mut args = json!({ "limit": 2 });
            if let Some(cursor) = cursor.as_str() {
                args["cursor"] = json!(cursor);
            }
            let payload = result_json(
                &service
                    .notes_list(Parameters(list_args(args)))
                    .await
                    .expect("list"),
            );
            assert_eq!(payload["total"], 5);
            seen.extend(titles(&payload));
            cursor = payload["nextCursor"].clone();
            if cursor.is_null() {
                break;
            }
        }

        seen.sort();
        assert_eq!(seen, ["five", "four", "one", "three", "two"]);
    }

    #[tokio::test]
    async fn the_last_page_carries_no_cursor() {
        let service = service_with_titles(&["only"]).await;
        let payload = result_json(
            &service
                .notes_list(Parameters(list_args(json!({}))))
                .await
                .expect("list"),
        );
        assert_eq!(payload["hasMore"], false);
        assert!(payload["nextCursor"].is_null());
    }

    #[tokio::test]
    async fn a_query_counts_and_returns_only_the_matching_records() {
        let service = service_with_titles(&["rust notes", "swift notes", "rust guide"]).await;
        let payload = result_json(
            &service
                .notes_list(Parameters(list_args(json!({ "query": "RUST" }))))
                .await
                .expect("list"),
        );
        // The count comes from the same filter as the page, so it must not report the table.
        assert_eq!(payload["total"], 2);
        let mut found = titles(&payload);
        found.sort();
        assert_eq!(found, ["rust guide", "rust notes"]);
    }

    #[tokio::test]
    async fn a_wildcard_in_the_query_matches_itself() {
        let service = service_with_titles(&["50% off", "50 percent off"]).await;
        let payload = result_json(
            &service
                .notes_list(Parameters(list_args(json!({ "query": "50%" }))))
                .await
                .expect("list"),
        );
        // Unescaped, `%` and `_` are LIKE wildcards, so this query would return both notes.
        assert_eq!(titles(&payload), ["50% off"]);

        let payload = result_json(
            &service
                .notes_list(Parameters(list_args(json!({ "query": "50_percent" }))))
                .await
                .expect("list"),
        );
        assert_eq!(payload["total"], 0);
    }

    #[tokio::test]
    async fn a_cursor_the_server_did_not_issue_is_rejected() {
        let service = service_with_titles(&["one"]).await;
        let error = service
            .notes_list(Parameters(list_args(json!({ "cursor": "not-a-cursor" }))))
            .await
            .expect_err("a forged cursor must fail");
        assert!(error.message.contains("cursor"));
    }

    #[tokio::test]
    async fn every_list_tool_pages_the_same_way() {
        let service = service_with_titles(&["one"]).await;
        for (tool, key) in [
            ("snippets", "snippets"),
            ("promptTemplates", "promptTemplates"),
            ("apiRequests", "apiRequests"),
            ("apiCollections", "apiCollections"),
        ] {
            let payload = match tool {
                "snippets" => {
                    service
                        .snippets_list(Parameters(list_args(json!({}))))
                        .await
                }
                "promptTemplates" => {
                    service
                        .prompt_templates_list(Parameters(list_args(json!({}))))
                        .await
                }
                "apiRequests" => {
                    service
                        .api_requests_list(Parameters(list_args(json!({}))))
                        .await
                }
                _ => {
                    service
                        .api_collections_list(Parameters(list_args(json!({}))))
                        .await
                }
            }
            .expect("list");
            let payload = result_json(&payload);
            assert!(payload[key].is_array(), "{tool} must return {key}");
            assert_eq!(payload["limit"], 50, "{tool} must apply the default page");
            assert!(payload["total"].is_i64(), "{tool} must report a total");
            assert_eq!(payload["hasMore"], false, "{tool} must report hasMore");
        }
    }
}

mod committed_writes_always_report_success {
    use super::*;

    async fn write_only_service() -> DevdrivrMcpService {
        service_with(all_permissions(resource_permissions(
            false, true, true, true,
        )))
        .await
    }

    #[tokio::test]
    async fn create_succeeds_without_read_permission() {
        let service = write_only_service().await;

        let result = service
            .notes_create(Parameters(note_create_args("Written blind")))
            .await
            .expect("a create granted create must not fail on read");

        let payload = result_json(&result);
        assert_eq!(payload["action"], "create");
        assert_eq!(payload["resource"], "notes");
        assert!(payload["id"].is_string());
        // Withholding read must withhold the record, not the receipt.
        assert!(payload.get("record").is_none());
    }

    #[tokio::test]
    async fn create_writes_exactly_one_row_without_read_permission() {
        let service = write_only_service().await;

        service
            .notes_create(Parameters(note_create_args("Written once")))
            .await
            .expect("create");

        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM notes")
            .fetch_one(&service.pool)
            .await
            .expect("count");
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn update_succeeds_without_read_permission() {
        let service = write_only_service().await;
        let created = result_json(
            &service
                .notes_create(Parameters(note_create_args("Before")))
                .await
                .expect("create"),
        );
        let id = created["id"].as_str().expect("id").to_string();

        let result = service
            .notes_update(Parameters(
                serde_json::from_value(json!({ "id": id, "title": "After" })).expect("update args"),
            ))
            .await
            .expect("an update granted update must not fail on read");

        assert_eq!(result_json(&result)["action"], "update");
        let title = sqlx::query_scalar::<_, String>("SELECT title FROM notes WHERE id = $1")
            .bind(&id)
            .fetch_one(&service.pool)
            .await
            .expect("title");
        assert_eq!(title, "After");
    }

    #[tokio::test]
    async fn the_record_rides_along_when_read_is_granted() {
        let service = service_with(all_permissions(resource_permissions(
            true, true, true, true,
        )))
        .await;

        let payload = result_json(
            &service
                .notes_create(Parameters(note_create_args("Readable")))
                .await
                .expect("create"),
        );

        assert_eq!(payload["record"]["title"], "Readable");
        assert_eq!(payload["record"]["content"], "body");
    }

    /// Updating a built-in template inserts a new user-owned row. That is a create, so an
    /// update-only grant must not be able to do it.
    #[tokio::test]
    async fn cloning_a_builtin_template_needs_create_permission() {
        let service = service_with(all_permissions(resource_permissions(
            true, false, true, false,
        )))
        .await;
        sqlx::query(
            "INSERT INTO user_prompt_templates (id, name, description, category, tags, prompt, variables_schema, estimated_tokens, optimized_for, author, version, tips, created_at, updated_at) VALUES ('builtin-1', 'Built in', 'desc', 'general', '[]', 'text', '[]', 1, 'claude', 'builtin', '1', '[]', 1, 1)",
        )
        .execute(&service.pool)
        .await
        .expect("seed a built-in template");

        let error = service
            .prompt_templates_update(Parameters(
                serde_json::from_value(json!({ "id": "builtin-1", "prompt": "changed" }))
                    .expect("update args"),
            ))
            .await
            .expect_err("cloning a built-in without create permission must fail");

        assert!(error.message.contains("promptTemplates.create"));
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_prompt_templates")
            .fetch_one(&service.pool)
            .await
            .expect("count");
        assert_eq!(count, 1, "the clone must not have been written");
    }

    #[tokio::test]
    async fn create_is_still_refused_without_create_permission() {
        let service = service_with(all_permissions(resource_permissions(
            true, false, true, true,
        )))
        .await;

        let error = service
            .notes_create(Parameters(note_create_args("Refused")))
            .await
            .expect_err("create without the create permission must fail");

        assert!(error.message.contains("notes.create"));
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM notes")
            .fetch_one(&service.pool)
            .await
            .expect("count");
        assert_eq!(count, 0, "a refused create must not reach the database");
    }
}

/// The two folder tools read `MAX(sort_order)` through this expression. Creating the first
/// child of a parent leaves no rows to aggregate, so the expression must still decode as f64.
const MAX_SORT_ORDER_EXPRESSION: &str =
    "SELECT CAST(COALESCE(MAX(sort_order), 0) AS REAL) FROM resource_folders WHERE parent_id = $1";

async fn folder_sort_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.expect("pool");
    sqlx::query("CREATE TABLE resource_folders (id TEXT PRIMARY KEY, parent_id TEXT, sort_order REAL NOT NULL DEFAULT 0)")
        .execute(&pool)
        .await
        .expect("schema");
    pool
}

#[tokio::test]
async fn folder_sort_order_decodes_when_the_parent_has_no_children_yet() {
    let pool = folder_sort_pool().await;
    let max_sort = sqlx::query_scalar::<_, f64>(MAX_SORT_ORDER_EXPRESSION)
        .bind("empty-parent")
        .fetch_one(&pool)
        .await
        .expect("an empty parent must not fail to decode");
    assert_eq!(max_sort, 0.0);
}

#[tokio::test]
async fn folder_sort_order_reads_the_highest_existing_sibling() {
    let pool = folder_sort_pool().await;
    sqlx::query("INSERT INTO resource_folders (id, parent_id, sort_order) VALUES ('a', 'parent', 1000.0), ('b', 'parent', 2000.0)")
        .execute(&pool)
        .await
        .expect("seed");
    let max_sort = sqlx::query_scalar::<_, f64>(MAX_SORT_ORDER_EXPRESSION)
        .bind("parent")
        .fetch_one(&pool)
        .await
        .expect("decode");
    assert_eq!(max_sort + FOLDER_SORT_STEP, 3000.0);
}

#[test]
fn stable_note_links_are_deduplicated_without_guessing_legacy_titles() {
    let targets = stable_note_link_targets(
        "[[note:note-1|Plan]] [[snippet:snippet-1|Helper]] [[note:note-1|Renamed]] [[Legacy]]",
    );

    assert_eq!(
        targets,
        vec![
            ("note".to_string(), "note-1".to_string()),
            ("snippet".to_string(), "snippet-1".to_string()),
        ]
    );
}

#[test]
fn an_update_heals_a_stored_value_an_earlier_import_left_invalid() {
    assert_eq!(heal_note_color("teal"), "yellow");
    assert_eq!(heal_note_color("purple"), "purple");
    assert_eq!(heal_template_category("general"), "productivity");
    assert_eq!(heal_template_category("docs"), "docs");
    assert_eq!(heal_template_optimized_for("GPT-4"), "Generic");
    assert_eq!(heal_template_optimized_for("Cursor"), "Cursor");
}

#[test]
fn redacted_basic_auth_preserves_only_password() {
    let current = json!({
        "type": "basic",
        "username": "old-user",
        "password": "old-password"
    })
    .to_string();
    let incoming = json!({
        "type": "basic",
        "username": "new-user",
        "password": REDACTED_AUTH_VALUE,
        "__devdrivrRedacted": true
    });

    let updated = parse_json(&resolve_auth_update(incoming, &current), json!({}));

    assert_eq!(updated["username"], "new-user");
    assert_eq!(updated["password"], "old-password");
    assert_eq!(updated.get("__devdrivrRedacted"), None);
}

#[test]
fn redacted_literal_without_marker_is_saved() {
    let current = json!({
        "type": "bearer",
        "token": "old-token"
    })
    .to_string();
    let incoming = json!({
        "type": "bearer",
        "token": REDACTED_AUTH_VALUE
    });

    let updated = parse_json(&resolve_auth_update(incoming, &current), json!({}));

    assert_eq!(updated["token"], REDACTED_AUTH_VALUE);
    assert_eq!(updated.get("__devdrivrRedacted"), None);
}

#[test]
fn resource_type_parser_deduplicates_and_reports_unsupported_types() {
    let parsed = parse_resource_types(vec![
        "notes".to_string(),
        "snippets".to_string(),
        "notes".to_string(),
    ])
    .expect("valid types");

    assert_eq!(parsed, vec![ResourceType::Notes, ResourceType::Snippets]);

    let err = parse_resource_types(vec!["bookmarks".to_string()])
        .expect_err("unsupported type should fail");
    let data = err.data.expect("error data");
    assert_eq!(data["code"], "UNSUPPORTED_RESOURCE_TYPE");
    assert_eq!(data["argument"], "type");
}

#[test]
fn folder_kind_parser_accepts_only_resource_kinds_with_folders() {
    assert_eq!(parse_folder_kind("notes").unwrap(), "notes");
    assert_eq!(parse_folder_kind(" apiRequests ").unwrap(), "apiRequests");

    let err = parse_folder_kind("promptTemplates").expect_err("templates have no folders");
    let data = err.data.expect("error data");
    assert_eq!(data["code"], "INVALID_ARGUMENT");
    assert_eq!(data["argument"], "kind");
}

#[test]
fn system_inboxes_are_immutable_and_default_language_is_snippets_only() {
    assert!(is_system_inbox("notes-inbox"));
    assert!(is_system_inbox("snippets-inbox"));
    assert!(is_system_inbox("api-requests-inbox"));
    assert!(!is_system_inbox("notes-project"));

    assert!(validate_default_language("snippets", true).is_ok());
    assert!(validate_default_language("notes", false).is_ok());
    let err = validate_default_language("apiRequests", true)
        .expect_err("API request folders cannot have a snippet language default");
    let data = err.data.expect("error data");
    assert_eq!(data["argument"], "defaultLanguage");
}
