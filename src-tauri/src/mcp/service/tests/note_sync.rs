use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs, path::PathBuf};

struct Files(PathBuf);

impl Files {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("devdrivr-note-sync-{}", Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for Files {
    fn drop(&mut self) {
        if let Ok(entries) = fs::read_dir(&self.0) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
        let _ = fs::remove_dir(&self.0);
    }
}

const PNG: &[u8] = b"\x89PNG\r\n\x1a\nexample";
const GIF: &[u8] = b"GIF89aexample";

async fn service() -> DevdrivrMcpService {
    service_with(all_permissions(resource_permissions(
        true, true, true, true,
    )))
    .await
}

fn args<T: serde::de::DeserializeOwned>(value: Value) -> Parameters<T> {
    Parameters(serde_json::from_value(value).unwrap())
}

async fn upload(service: &DevdrivrMcpService, input: Value) -> Value {
    result_json(&service.note_assets_upload(args(input)).await.unwrap())
}

async fn upsert(service: &DevdrivrMcpService, items: Value) -> Value {
    result_json(
        &service
            .notes_upsert(args(json!({"items": items})))
            .await
            .unwrap(),
    )["results"]
        .clone()
}

#[tokio::test]
async fn uploads_validates_and_replaces_keyed_assets_by_data_and_path() {
    let mut service = service().await;
    let files = Files::new();
    service.test_asset_directory = Some(files.0.clone());
    {
        let mut settings = service.settings.write().await;
        settings.permissions.notes.create = false;
    }
    let first = upload(
        &service,
        json!({"data": STANDARD.encode(PNG), "key": "guide#image", "filename": "wrong.gif"}),
    )
    .await;
    let id = first["assetId"].as_str().unwrap();
    assert_eq!(Uuid::parse_str(id).unwrap().get_version_num(), 5);
    assert_eq!(first["url"], format!("devdrivr-asset:{id}"));
    assert_eq!(first["mimeType"], "image/png");
    assert_eq!(first["size"], PNG.len());
    assert_eq!(first["replaced"], false);

    let path = files.0.join("source.bin");
    fs::write(&path, GIF).unwrap();
    let second = upload(&service, json!({"path": path, "key": "guide#image"})).await;
    assert_eq!(second["assetId"], id);
    assert_eq!(second["replaced"], true);
    assert_eq!(second["mimeType"], "image/gif");
    assert!(!files.0.join(format!("{id}.png")).exists());
    assert_eq!(fs::read(files.0.join(format!("{id}.gif"))).unwrap(), GIF);
    let random = upload(&service, json!({"data": STANDARD.encode(PNG)})).await;
    assert_eq!(
        Uuid::parse_str(random["assetId"].as_str().unwrap())
            .unwrap()
            .get_version_num(),
        4
    );
    assert!(service
        .note_assets_upload(args(json!({"data": "aGVsbG8="})))
        .await
        .unwrap_err()
        .message
        .contains("Only PNG"));
    assert!(service
        .note_assets_upload(args(json!({"data": "", "path": path})))
        .await
        .unwrap_err()
        .message
        .contains("exactly one"));
    assert!(service
        .note_assets_upload(args(json!({"path": "relative.png"})))
        .await
        .unwrap_err()
        .message
        .contains("absolute"));
}

#[tokio::test]
async fn accepts_the_full_decoded_image_limit() {
    let mut service = service().await;
    let files = Files::new();
    service.test_asset_directory = Some(files.0.clone());
    let mut image = PNG.to_vec();
    image.resize(crate::note_assets::MAX_ASSET_BYTES, 0);
    let uploaded = upload(&service, json!({"data": STANDARD.encode(&image)})).await;
    assert_eq!(uploaded["size"], image.len());
    image.push(0);
    let error = service
        .note_assets_upload(args(json!({"data": STANDARD.encode(&image)})))
        .await
        .unwrap_err();
    assert!(error.message.contains("10 MiB"));
}

#[tokio::test]
async fn lists_references_and_refuses_to_delete_an_asset_in_trash() {
    let mut service = service().await;
    let files = Files::new();
    service.test_asset_directory = Some(files.0.clone());
    let image = upload(&service, json!({"data": STANDARD.encode(PNG)})).await;
    let orphan = upload(&service, json!({"data": STANDARD.encode(PNG)})).await;
    let note = result_json(
        &service
            .notes_create(args(json!({
                "content": format!("![image]({})", image["url"].as_str().unwrap())
            })))
            .await
            .unwrap(),
    );
    service
        .notes_delete(args(json!({"id": note["id"]})))
        .await
        .unwrap();

    let response = service.note_assets_list(args(json!({}))).await.unwrap();
    let listed = result_json(&response);
    let asset = listed["assets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|asset| asset["id"] == image["assetId"])
        .unwrap();
    assert_eq!(asset["referencedBy"], json!([note["id"]]));
    let unreferenced = result_json(
        &service
            .note_assets_list(args(json!({"unreferencedOnly": true})))
            .await
            .unwrap(),
    );
    assert_eq!(unreferenced["total"], 1);
    assert_eq!(unreferenced["assets"][0]["id"], orphan["assetId"]);
    let error = service
        .note_assets_delete(args(json!({"id": image["assetId"]})))
        .await
        .unwrap_err();
    assert!(error.message.contains(note["id"].as_str().unwrap()));
    let deleted = service
        .note_assets_delete(args(json!({"id": orphan["assetId"]})))
        .await
        .unwrap();
    assert_eq!(result_json(&deleted)["deleted"], true);
}

#[tokio::test]
async fn upsert_is_idempotent_and_rewrites_only_inline_image_destinations() {
    let mut service = service().await;
    let files = Files::new();
    service.test_asset_directory = Some(files.0.clone());
    let inputs = json!([{
        "externalKey": "guide",
        "title": "Guide",
        "folder": "Work/Guides",
        "tags": ["docs"],
        "content": "![img](screen.png) ![second [part]](<screen.png> \"Preview\") [link](screen.png) `![code](screen.png)` [[note:other|Other]]",
        "assets": [{"ref": "screen.png", "data": STANDARD.encode(PNG)}],
    }]);
    let created = upsert(&service, inputs.clone()).await;
    assert_eq!(created[0]["status"], "created", "{created}");
    let id = &created[0]["id"];
    let unchanged = upsert(&service, inputs).await;
    assert_eq!(unchanged[0]["status"], "unchanged", "{unchanged}");
    assert_eq!(unchanged[0]["id"], *id);
    assert_eq!(unchanged[0]["updatedAt"], created[0]["updatedAt"]);

    let updated = upsert(&service, json!([
        {"externalKey": "bad", "folder": "Failed/Nested", "content": "`![code](unused.png)`", "assets": [{"ref": "unused.png", "data": STANDARD.encode(PNG)}]},
        {"externalKey": 123},
        {"externalKey": "guide", "title": "Revised", "expectedUpdatedAt": created[0]["updatedAt"]},
        {"externalKey": "guide", "title": "Stale", "expectedUpdatedAt": created[0]["updatedAt"]},
    ])).await;
    assert_eq!(updated[0]["status"], "error");
    assert!(updated[0]["error"].as_str().unwrap().contains("unused.png"));
    assert_eq!(updated[1]["status"], "error");
    assert_eq!(updated[2]["status"], "updated", "{updated}");
    assert_eq!(updated[2]["id"], *id);
    assert!(updated[2]["updatedAt"].as_i64().unwrap() > created[0]["updatedAt"].as_i64().unwrap());
    assert!(updated[3]["error"]
        .as_str()
        .unwrap()
        .contains("not at the expected"));
    let failed_folder =
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM resource_folders WHERE name = 'Failed'")
            .fetch_one(&service.pool)
            .await
            .unwrap();
    assert_eq!(failed_folder, 0);

    let note = result_json(&service.notes_get(args(json!({"id": id}))).await.unwrap());
    assert_eq!(note["folderPath"], json!(["Work", "Guides"]));
    assert_eq!(note["tags"], json!(["docs"]));
    assert_eq!(note["title"], "Revised");
    let asset = result_json(&service.note_assets_list(args(json!({}))).await.unwrap());
    let url = asset["assets"][0]["url"].as_str().unwrap();
    assert_eq!(note["content"], format!(
        "![img]({url}) ![second [part]](<{url}> \"Preview\") [link](screen.png) `![code](screen.png)` [[note:other|Other]]"
    ));
    let linked = sqlx::query_scalar::<_, String>(
        "SELECT target_id FROM note_links WHERE source_note_id = $1",
    )
    .bind(id.as_str().unwrap())
    .fetch_one(&service.pool)
    .await
    .unwrap();
    assert_eq!(linked, "other");
}

#[tokio::test]
async fn a_failed_upsert_restores_replaced_files() {
    let mut service = service().await;
    let files = Files::new();
    service.test_asset_directory = Some(files.0.clone());
    let existing = upload(
        &service,
        json!({"key": "guide#first.png", "data": STANDARD.encode(PNG)}),
    )
    .await;
    let result = upsert(
        &service,
        json!([{
            "externalKey": "guide",
            "content": "![first](first.png) ![second](second.png)",
            "assets": [
                {"ref": "first.png", "data": STANDARD.encode(GIF)},
                {"ref": "second.png", "data": "bad!"},
            ],
        }]),
    )
    .await;
    assert_eq!(result[0]["status"], "error");
    let id = existing["assetId"].as_str().unwrap();
    assert_eq!(fs::read(files.0.join(format!("{id}.png"))).unwrap(), PNG);
    assert!(!files.0.join(format!("{id}.gif")).exists());
    assert_eq!(fs::read_dir(&files.0).unwrap().count(), 1);
}

#[tokio::test]
async fn resolves_paths_and_filters_lean_lists() {
    let service = service().await;
    let saved = result_json(
        &service
            .notes_create(args(json!({
                "externalKey": "guide", "folder": "Work/Guides", "title": "start", "tags": ["docs"],
                "content": "café",
            })))
            .await
            .unwrap(),
    );
    service
        .notes_create(args(
            json!({"folder": "Work/Guides", "tags": ["docs-extra"]}),
        ))
        .await
        .unwrap();
    service
        .notes_create(args(json!({"tags": ["docs"]})))
        .await
        .unwrap();
    let response = result_json(
        &service
            .notes_list(args(
                json!({"folder": "Work/Guides", "tag": "docs", "query": "café"}),
            ))
            .await
            .unwrap(),
    );
    assert_eq!(response["total"], 1);
    let note = &response["notes"][0];
    assert_eq!(note["id"], saved["id"]);
    assert_eq!(note["externalKey"], "guide");
    assert_eq!(note["folderPath"], json!(["Work", "Guides"]));
    assert_eq!(note["contentLength"], 5);
    assert!(note.get("content").is_none());
    let response = result_json(
        &service
            .notes_list(args(json!({
                "folderId": note["folderId"], "externalKey": "guide", "includeContent": true,
            })))
            .await
            .unwrap(),
    );
    assert_eq!(response["total"], 1);
    assert_eq!(response["notes"][0]["content"], "café");
    assert!(service
        .notes_list(args(json!({"folder": "Missing"})))
        .await
        .unwrap_err()
        .message
        .contains("does not exist"));
    assert!(service
        .notes_list(args(
            json!({"folder": "Work", "folderId": note["folderId"]})
        ))
        .await
        .unwrap_err()
        .message
        .contains("mutually exclusive"));
    service
        .resource_folders_create(args(json!({"kind": "notes", "name": "Work"})))
        .await
        .unwrap();
    let error = service
        .notes_update(args(json!({"id": saved["id"], "folder": "Work/Guides"})))
        .await
        .unwrap_err();
    assert!(error.message.contains("ambiguous"));
}

#[tokio::test]
async fn enforces_unique_live_external_keys_and_refuses_conflicting_restores() {
    let service = service().await;
    let note = result_json(
        &service
            .notes_create(args(json!({"externalKey": "unique"})))
            .await
            .unwrap(),
    );
    assert_eq!(note["record"]["externalKey"], "unique");
    let duplicate = service
        .notes_create(args(json!({"externalKey": "unique"})))
        .await
        .unwrap_err();
    assert_eq!(duplicate.data.unwrap()["code"], "CONFLICT");
    service
        .notes_delete(args(json!({"id": note["id"]})))
        .await
        .unwrap();
    let replacement = upsert(&service, json!([{"externalKey": "unique"}])).await;
    let restore = json!({"type": "notes", "id": note["id"]});
    let error = service
        .trash_restore(args(restore.clone()))
        .await
        .unwrap_err();
    assert_eq!(error.data.unwrap()["code"], "CONFLICT");
    assert!(error.message.contains("held by a live note"));
    let clear = service
        .notes_update(args(json!({"id": replacement[0]["id"], "externalKey": ""})))
        .await
        .unwrap();
    assert!(result_json(&clear)["record"]["externalKey"].is_null());
    assert!(service.trash_restore(args(restore)).await.is_ok());
}

#[test]
fn only_asset_data_has_the_larger_text_budget() {
    let data = "A".repeat(MAX_TEXT_FIELD_BYTES + 1);
    assert!(check_argument_budget(
        &json!({"assets": [{"data": data}]}),
        2,
        Some(&["assets", "data"])
    )
    .is_ok());
    assert!(check_argument_budget(
        &json!({"assets": [{"path": data}]}),
        2,
        Some(&["assets", "data"])
    )
    .is_err());
    assert!(
        check_argument_budget(&json!({"content": data}), 2, Some(&["assets", "data"])).is_err()
    );
    assert!(check_argument_budget(&json!({"data": data}), 2, None).is_err());
}

#[tokio::test]
async fn backfills_a_key_on_an_existing_note_and_matches_folder_names_exactly() {
    let service = service().await;
    let name = "TWXLearning10.SN \u{2013} How it works";
    let folder = result_json(
        &service
            .resource_folders_create(args(json!({"kind": "notes", "name": name})))
            .await
            .unwrap(),
    );
    let folder_id = folder["id"].clone();
    let note = result_json(
        &service
            .notes_create(args(
                json!({"title": "Guide", "content": "Body", "folderId": folder_id}),
            ))
            .await
            .unwrap(),
    );
    let id = note["id"].clone();
    service
        .notes_update(args(
            json!({"id": id, "externalKey": "twxlearning10-howto/page"}),
        ))
        .await
        .unwrap();

    let same = upsert(&service, json!([{
        "externalKey": "twxlearning10-howto/page", "title": "Guide", "content": "Body", "folder": name,
    }]))
    .await;
    assert_eq!(same[0]["status"], "unchanged", "{same}");
    assert_eq!(same[0]["id"], id);

    let retagged = upsert(
        &service,
        json!([{
            "externalKey": "twxlearning10-howto/page", "tags": ["guide"],
        }]),
    )
    .await;
    assert_eq!(retagged[0]["status"], "updated", "{retagged}");
    assert_eq!(retagged[0]["id"], id);

    let folders = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM resource_folders WHERE kind = 'notes' AND name LIKE 'TWXLearning10.SN%'",
    )
    .fetch_one(&service.pool)
    .await
    .unwrap();
    assert_eq!(folders, 1);
    let hyphen = upsert(
        &service,
        json!([{
            "externalKey": "other", "folder": "TWXLearning10.SN - How it works",
        }]),
    )
    .await;
    let note = result_json(
        &service
            .notes_get(args(json!({"id": hyphen[0]["id"]})))
            .await
            .unwrap(),
    );
    assert_ne!(note["folderId"], folder_id);
}
