use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const ASSET_DIRECTORY: &str = "note-assets";
const MAX_ASSET_BYTES: usize = 10 * 1024 * 1024;
const MAX_RESTORE_ASSETS: usize = 500;
const MAX_RESTORE_BYTES: usize = 100 * 1024 * 1024;

#[derive(Clone, Debug)]
struct ImageFormat {
    extension: &'static str,
    mime_type: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAsset {
    id: String,
    file_name: String,
    mime_type: String,
    size: usize,
    path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAssetBackup {
    id: String,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
}

fn image_format(bytes: &[u8]) -> Option<ImageFormat> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(ImageFormat {
            extension: "png",
            mime_type: "image/png",
        })
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some(ImageFormat {
            extension: "jpg",
            mime_type: "image/jpeg",
        })
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(ImageFormat {
            extension: "gif",
            mime_type: "image/gif",
        })
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(ImageFormat {
            extension: "webp",
            mime_type: "image/webp",
        })
    } else {
        None
    }
}

fn validate_bytes(bytes: &[u8]) -> Result<ImageFormat, String> {
    if bytes.is_empty() {
        return Err("Image is empty".into());
    }
    if bytes.len() > MAX_ASSET_BYTES {
        return Err("Image exceeds the 10 MiB attachment limit".into());
    }
    image_format(bytes).ok_or_else(|| "Only PNG, JPEG, GIF, and WebP images are supported".into())
}

fn validate_id(id: &str) -> Result<Uuid, String> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid note asset ID".to_string())?;
    if parsed.to_string() != id {
        return Err("Invalid note asset ID".into());
    }
    Ok(parsed)
}

fn asset_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(ASSET_DIRECTORY))
        .map_err(|error| format!("Unable to resolve the note asset directory: {error}"))
}

fn path_for(directory: &Path, id: &str, extension: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    if !matches!(extension, "png" | "jpg" | "gif" | "webp") {
        return Err("Invalid note asset extension".into());
    }
    Ok(directory.join(format!("{id}.{extension}")))
}

fn find_asset(directory: &Path, id: &str) -> Result<(PathBuf, ImageFormat), String> {
    validate_id(id)?;
    for extension in ["png", "jpg", "gif", "webp"] {
        let path = path_for(directory, id, extension)?;
        if path.is_file() {
            let bytes =
                fs::read(&path).map_err(|error| format!("Unable to read note asset: {error}"))?;
            let format = validate_bytes(&bytes)?;
            if format.extension != extension {
                return Err("Stored note asset type does not match its filename".into());
            }
            return Ok((path, format));
        }
    }
    Err("Note asset is missing".into())
}

fn unique_asset_id(directory: &Path) -> Result<String, String> {
    for _ in 0..8 {
        let id = Uuid::new_v4().to_string();
        if ["png", "jpg", "gif", "webp"]
            .iter()
            .all(|extension| !directory.join(format!("{id}.{extension}")).exists())
        {
            return Ok(id);
        }
    }
    Err("Unable to allocate a unique note asset ID".into())
}

fn write_new_asset(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid note asset destination".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create the note asset directory: {error}"))?;
    let temporary = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    fs::write(&temporary, bytes).map_err(|error| format!("Unable to write note asset: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Unable to finalize note asset: {error}"));
    }
    Ok(())
}

fn to_asset(id: &str, path: PathBuf, format: ImageFormat) -> Result<NoteAsset, String> {
    let size = fs::metadata(&path)
        .map_err(|error| format!("Unable to inspect note asset: {error}"))?
        .len() as usize;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid note asset filename".to_string())?
        .to_string();
    Ok(NoteAsset {
        id: id.to_string(),
        file_name,
        mime_type: format.mime_type.to_string(),
        size,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn note_asset_import(app: AppHandle, bytes: Vec<u8>) -> Result<NoteAsset, String> {
    let format = validate_bytes(&bytes)?;
    let directory = asset_directory(&app)?;
    let id = unique_asset_id(&directory)?;
    let path = path_for(&directory, &id, format.extension)?;
    write_new_asset(&path, &bytes)?;
    to_asset(&id, path, format)
}

#[tauri::command]
pub fn note_asset_resolve(app: AppHandle, id: String) -> Result<NoteAsset, String> {
    let directory = asset_directory(&app)?;
    let (path, format) = find_asset(&directory, &id)?;
    to_asset(&id, path, format)
}

#[tauri::command]
pub fn note_assets_find_orphans(
    app: AppHandle,
    referenced_ids: Vec<String>,
) -> Result<Vec<NoteAsset>, String> {
    let referenced = referenced_ids
        .iter()
        .map(|id| validate_id(id).map(|_| id.as_str()))
        .collect::<Result<HashSet<_>, _>>()?;
    let directory = asset_directory(&app)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut orphans = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Unable to inspect note assets: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Unable to inspect note asset: {error}"))?
            .path();
        let Some(stem) = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        if referenced.contains(stem.as_str()) || validate_id(&stem).is_err() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("");
        if !matches!(extension, "png" | "jpg" | "gif" | "webp") {
            continue;
        }
        let bytes =
            fs::read(&path).map_err(|error| format!("Unable to read note asset: {error}"))?;
        let format = validate_bytes(&bytes)?;
        if format.extension == extension {
            orphans.push(to_asset(&stem, path, format)?);
        }
    }
    orphans.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(orphans)
}

#[tauri::command]
pub fn note_assets_delete_orphans(
    app: AppHandle,
    ids: Vec<String>,
    referenced_ids: Vec<String>,
) -> Result<usize, String> {
    let referenced = referenced_ids
        .into_iter()
        .map(|id| validate_id(&id).map(|_| id))
        .collect::<Result<HashSet<_>, _>>()?;
    let directory = asset_directory(&app)?;
    for id in &ids {
        validate_id(id)?;
        if referenced.contains(id) {
            return Err("A selected asset is still referenced by a note".into());
        }
    }
    let mut deleted = 0;
    for id in ids {
        match find_asset(&directory, &id) {
            Ok((path, _)) => {
                fs::remove_file(path)
                    .map_err(|error| format!("Unable to delete unused note asset: {error}"))?;
                deleted += 1;
            }
            Err(error) if error == "Note asset is missing" => {}
            Err(error) => return Err(error),
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub fn note_assets_export(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<NoteAssetBackup>, String> {
    if ids.len() > MAX_RESTORE_ASSETS {
        return Err("Too many note assets to export".into());
    }
    let directory = asset_directory(&app)?;
    let mut unique = HashSet::new();
    let mut assets = Vec::new();
    let mut total_size = 0usize;
    for id in ids {
        validate_id(&id)?;
        if !unique.insert(id.clone()) {
            continue;
        }
        let (path, format) = find_asset(&directory, &id)?;
        let bytes =
            fs::read(&path).map_err(|error| format!("Unable to read note asset: {error}"))?;
        total_size = total_size
            .checked_add(bytes.len())
            .ok_or_else(|| "Note assets are too large to export".to_string())?;
        if total_size > MAX_RESTORE_BYTES {
            return Err("Note assets exceed the 100 MiB backup limit".into());
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Invalid note asset filename".to_string())?
            .to_string();
        assets.push(NoteAssetBackup {
            id,
            file_name,
            mime_type: format.mime_type.to_string(),
            bytes,
        });
    }
    Ok(assets)
}

#[tauri::command]
pub fn note_assets_restore(app: AppHandle, assets: Vec<NoteAssetBackup>) -> Result<usize, String> {
    if assets.len() > MAX_RESTORE_ASSETS {
        return Err("Backup contains too many note assets".into());
    }
    let directory = asset_directory(&app)?;
    let mut validated = Vec::with_capacity(assets.len());
    let mut total_size = 0usize;
    let mut unique = HashSet::new();
    for asset in assets {
        validate_id(&asset.id)?;
        if !unique.insert(asset.id.clone()) {
            return Err("Backup contains duplicate note asset IDs".into());
        }
        let format = validate_bytes(&asset.bytes)?;
        if asset.mime_type != format.mime_type
            || asset.file_name != format!("{}.{}", asset.id, format.extension)
        {
            return Err("Backup note asset metadata does not match its contents".into());
        }
        total_size = total_size
            .checked_add(asset.bytes.len())
            .ok_or_else(|| "Backup note assets are too large".to_string())?;
        if total_size > MAX_RESTORE_BYTES {
            return Err("Backup note assets exceed the 100 MiB restore limit".into());
        }
        let path = path_for(&directory, &asset.id, format.extension)?;
        match find_asset(&directory, &asset.id) {
            Ok((existing_path, existing_format)) => {
                let existing = fs::read(existing_path)
                    .map_err(|error| format!("Unable to read existing note asset: {error}"))?;
                if existing != asset.bytes || existing_format.extension != format.extension {
                    return Err("A restored asset conflicts with an existing asset".into());
                }
            }
            Err(error) if error == "Note asset is missing" => {}
            Err(error) => return Err(error),
        }
        validated.push((path, asset.bytes));
    }
    let mut restored = 0;
    for (path, bytes) in validated {
        if path.exists() {
            continue;
        }
        write_new_asset(&path, &bytes)?;
        restored += 1;
    }
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_supported_raster_signatures() {
        assert_eq!(
            image_format(b"\x89PNG\r\n\x1a\nrest").unwrap().extension,
            "png"
        );
        assert_eq!(image_format(b"\xff\xd8\xffrest").unwrap().extension, "jpg");
        assert_eq!(image_format(b"GIF89arest").unwrap().extension, "gif");
        assert_eq!(image_format(b"RIFF0000WEBPrest").unwrap().extension, "webp");
        assert!(image_format(b"<svg></svg>").is_none());
    }

    #[test]
    fn enforces_attachment_size_and_rejects_empty_files() {
        assert_eq!(validate_bytes(&[]).unwrap_err(), "Image is empty");
        let oversized = vec![0; MAX_ASSET_BYTES + 1];
        assert_eq!(
            validate_bytes(&oversized).unwrap_err(),
            "Image exceeds the 10 MiB attachment limit"
        );
    }

    #[test]
    fn rejects_paths_and_non_canonical_ids() {
        assert!(validate_id("../../secret").is_err());
        assert!(validate_id("550E8400-E29B-41D4-A716-446655440000").is_err());
        assert!(validate_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
    }

    #[test]
    fn path_is_derived_from_validated_id_and_type() {
        let directory = Path::new("/managed/note-assets");
        let path = path_for(directory, "550e8400-e29b-41d4-a716-446655440000", "png").unwrap();
        assert_eq!(
            path,
            directory.join("550e8400-e29b-41d4-a716-446655440000.png")
        );
        assert!(path_for(directory, "../../secret", "png").is_err());
        assert!(path_for(directory, "550e8400-e29b-41d4-a716-446655440000", "../png").is_err());
    }
}
