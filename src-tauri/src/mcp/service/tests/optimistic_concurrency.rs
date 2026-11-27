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
