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
