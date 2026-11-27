use super::*;
use crate::note_assets::{self as storage, AssetWrites, PreparedAsset};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

const ASSET_SCHEME: &str = "devdrivr-asset:";
const ID_BYTES: usize = 36;

pub(super) fn asset_url(id: &str) -> String {
    format!("{ASSET_SCHEME}{id}")
}

fn asset_error(field: &str, message: String) -> McpError {
    invalid_argument(
        field,
        message,
        &[
            "Use a PNG, JPEG, GIF, or WebP file of at most 10 MiB",
            "Supply standard base64 data or an absolute path on the devdrivr server",
        ],
    )
}

pub(super) fn prepare_asset(
    directory: &Path,
    input: AssetInput,
    default_key: Option<&str>,
) -> Result<PreparedAsset, McpError> {
    let AssetInput { data, path, key } = input;
    if let Some(key) = &key {
        validate_sync_key("key", key)?;
    }
    let (field, bytes) = match (data, path) {
        (Some(data), None) => {
            if data.len() > storage::MAX_ASSET_BYTES.div_ceil(3) * 4 {
                return Err(asset_error(
                    "data",
                    "Image exceeds the 10 MiB attachment limit".into(),
                ));
            }
            (
                "data",
                STANDARD.decode(data).map_err(|error| {
                    asset_error("data", format!("Invalid base64 image data: {error}"))
                })?,
            )
        }
        (None, Some(path)) => (
            "path",
            storage::read_local_image(Path::new(&path))
                .map_err(|error| asset_error("path", error))?,
        ),
        _ => {
            return Err(invalid_argument(
                "data",
                "Supply exactly one of data and path",
                &["Send base64 in data or an absolute file path in path"],
            ))
        }
    };
    PreparedAsset::new(directory, bytes, key.as_deref().or(default_key))
        .map_err(|error| asset_error(field, error))
}

pub(super) fn asset_storage_error(error: String) -> McpError {
    McpError::internal_error(
        error,
        Some(error_data(
            "ASSET_STORAGE_ERROR",
            Some("notes"),
            None,
            None,
            None,
            &["Check that devdrivr can read and write its note asset directory"],
        )),
    )
}

#[tool_router(router = note_assets_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "Upload a PNG, JPEG, GIF or WebP image from standard base64 data or an absolute server-local path. Pass a stable key to replace an existing image. Notes render CommonMark with GFM tables, strikethrough, autolinks and task lists. Raw HTML is discarded and rendered output is sanitized. Use italic text below an image for captions. Use devdrivr-asset:<uuid> for managed images. Limits: 1 MiB Markdown content, 10 MiB per image and 100 items per upsert batch."
    )]
    pub(super) async fn note_assets_upload(
        &self,
        Parameters(args): Parameters<AssetUploadArgs>,
    ) -> McpResult {
        let permissions = self.permissions_for("notes").await;
        if !permissions.create && !permissions.update {
            return Err(McpError::invalid_request(
                "Permission denied: asset upload requires notes.create or notes.update",
                Some(error_data("PERMISSION_DENIED", Some("notes"), None, None, None,
                    &["Enable either notes.create or notes.update in Settings > MCP > Permissions"])),
            ));
        }
        let directory = self.asset_dir()?;
        let asset = prepare_asset(&directory, args.asset, None)?;
        let transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let mut writes = AssetWrites::new(directory);
        let (asset, replaced) = writes.write(asset).map_err(asset_storage_error)?;
        transaction.commit().await.map_err(db_error)?;
        writes.commit();
        to_json_text(json!({
            "assetId": asset.id, "url": asset_url(&asset.id), "mimeType": asset.mime_type,
            "size": asset.size, "replaced": replaced,
        }))
    }

    #[tool(description = "List managed note images and note IDs that reference them, including trashed notes.", output_schema = list_page_schema("assets"))]
    pub(super) async fn note_assets_list(
        &self,
        Parameters(args): Parameters<AssetListArgs>,
    ) -> McpResult {
        self.ensure_permission("notes", "read").await?;
        let page = PageRequest::parse(args.limit, args.cursor.as_deref())?;
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT id, content FROM notes WHERE instr(content, $1) > 0 ORDER BY id",
        )
        .bind(ASSET_SCHEME)
        .fetch_all(&mut *transaction)
        .await
        .map_err(db_error)?;
        let mut references: HashMap<&str, Vec<&str>> = HashMap::new();
        for (id, content) in &rows {
            let mentioned = content
                .split(ASSET_SCHEME)
                .skip(1)
                .filter_map(|tail| tail.get(..ID_BYTES))
                .filter(|id| storage::validate_id(id).is_ok())
                .collect::<HashSet<_>>();
            for asset_id in mentioned {
                references.entry(asset_id).or_default().push(id);
            }
        }
        let excluded = if args.unreferenced_only.unwrap_or(false) {
            references.keys().copied().collect()
        } else {
            HashSet::new()
        };
        let assets =
            storage::list_assets(&self.asset_dir()?, &excluded).map_err(asset_storage_error)?;
        transaction.commit().await.map_err(db_error)?;
        let values = assets.into_iter().map(|asset| json!({
            "id": asset.id, "url": asset_url(&asset.id), "mimeType": asset.mime_type, "size": asset.size,
            "referencedBy": references.get(asset.id.as_str()).map(Vec::as_slice).unwrap_or_default(),
        })).collect();
        page_in_memory("assets", values, page)
    }

    #[tool(description = "Delete a managed image by ID if no live or trashed note references it.")]
    pub(super) async fn note_assets_delete(
        &self,
        Parameters(args): Parameters<IdArgs>,
    ) -> McpResult {
        self.ensure_permission("notes", "delete").await?;
        storage::validate_id(&args.id).map_err(|error| {
            invalid_argument(
                "id",
                error,
                &["Use the UUID returned by note_assets_upload or note_assets_list"],
            )
        })?;
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let references = sqlx::query_scalar::<_, String>(
            "SELECT id FROM notes WHERE instr(content, $1) > 0 ORDER BY id",
        )
        .bind(asset_url(&args.id))
        .fetch_all(&mut *transaction)
        .await
        .map_err(db_error)?;
        if !references.is_empty() {
            return Err(invalid_argument("id", format!("Asset is still referenced by notes: {}", references.join(", ")),
                &["Remove the asset URL from the listed notes or permanently delete them before retrying"]));
        }
        let deleted =
            storage::delete_asset(&self.asset_dir()?, &args.id).map_err(asset_storage_error)?;
        transaction.commit().await.map_err(db_error)?;
        to_json_text(json!({ "deleted": deleted }))
    }
}

impl DevdrivrMcpService {
    pub(super) fn asset_dir(&self) -> Result<PathBuf, McpError> {
        if let Some(app) = &self.app {
            return storage::asset_directory(app).map_err(asset_storage_error);
        }
        #[cfg(test)]
        if let Some(directory) = &self.test_asset_directory {
            return Ok(directory.clone());
        }
        Err(asset_storage_error(
            "No note asset directory is configured".into(),
        ))
    }
}
