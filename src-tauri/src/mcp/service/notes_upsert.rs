use super::{
    note_assets::{asset_storage_error, prepare_asset},
    *,
};
use crate::note_assets::AssetWrites;
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use std::{collections::HashMap, ops::Range, path::Path};

const MAX_UPSERT_ITEMS: usize = 100;

#[tool_router(router = notes_upsert_router, vis = "pub(super)")]
impl DevdrivrMcpService {
    #[tool(
        description = "Create or update notes by externalKey and return a result per item. Assets replace matching inline Markdown image destinations. Notes render CommonMark with GFM tables, strikethrough, autolinks and task lists. Raw HTML is discarded and rendered output is sanitized. Use italic text below an image for captions. Use devdrivr-asset:<uuid> for managed images. Limits: 1 MiB Markdown content, 10 MiB per image and 100 items per upsert batch."
    )]
    pub(super) async fn notes_upsert(
        &self,
        Parameters(args): Parameters<NoteUpsertArgs>,
    ) -> McpResult {
        if args.items.is_empty() {
            return Err(invalid_argument(
                "items",
                "At least one upsert item is required",
                &["Send between 1 and 100 notes per call"],
            ));
        }
        if args.items.len() > MAX_UPSERT_ITEMS {
            return Err(batch_too_large("items", args.items.len(), MAX_UPSERT_ITEMS));
        }
        let mut results = Vec::with_capacity(args.items.len());
        for item in args.items {
            let external_key = item
                .get("externalKey")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let result = async {
                check_argument_budget(&item, 2, Some(&["assets", "data"]))?;
                let item = serde_json::from_value(item).map_err(|error| invalid_argument(
                    "items", format!("Invalid note upsert item: {error}"),
                    &["Provide a string externalKey and use the field types shown in the tool schema"]))?;
                self.upsert_note(item).await
            }.await;
            results.push(match result {
                Ok(result) => result,
                Err(error) => json!({
                    "externalKey": external_key, "status": "error", "error": upsert_error_message(error),
                }),
            });
        }
        to_json_text(json!({ "results": results }))
    }
}

impl DevdrivrMcpService {
    async fn upsert_note(&self, item: NoteUpsertItem) -> Result<Value, McpError> {
        validate_sync_key("externalKey", &item.external_key)?;
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(db_error)?;
        let current = sqlx::query_as::<_, NoteRow>(
            "SELECT * FROM notes WHERE external_key = $1 AND deleted_at IS NULL",
        )
        .bind(&item.external_key)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(db_error)?;
        let action = if current.is_some() {
            "update"
        } else {
            "create"
        };
        self.ensure_permission("notes", action).await?;
        if let Some(expected) = item.expected_updated_at {
            if let Some(row) = &current {
                check_expected_updated_at("notes", &row.id, Some(expected), row.updated_at)?;
            } else {
                return Err(McpError::invalid_request(
                    "No live note matches externalKey and expectedUpdatedAt",
                    Some(error_data(
                        "CONFLICT",
                        Some("notes"),
                        None,
                        None,
                        Some("expectedUpdatedAt"),
                        &["Check externalKey or omit expectedUpdatedAt to create the note"],
                    )),
                ));
            }
        }

        let color = item
            .color
            .as_deref()
            .map(validate_note_color)
            .transpose()?
            .or_else(|| current.as_ref().map(|row| row.color.clone()))
            .unwrap_or_else(|| "yellow".to_string());
        let (folder_id, created_folders) = self
            .resolve_note_folder(
                &mut transaction,
                item.folder_id,
                item.folder.as_deref(),
                true,
            )
            .await?;
        let title = item
            .title
            .or_else(|| current.as_ref().map(|row| row.title.clone()))
            .unwrap_or_default();
        let pinned = item
            .pinned
            .map(i64::from)
            .unwrap_or_else(|| current.as_ref().map_or(0, |row| row.pinned));
        let tags = item
            .tags
            .map(|tags| string_vec_to_db_json(Some(tags)))
            .or_else(|| {
                current
                    .as_ref()
                    .map_or_else(|| Some("[]".to_string()), |row| row.tags.clone())
            });
        let folder_id = folder_id.or_else(|| {
            current.as_ref().map_or_else(
                || Some("notes-inbox".to_string()),
                |row| row.folder_id.clone(),
            )
        });
        let mut content = item
            .content
            .or_else(|| current.as_ref().map(|row| row.content.clone()))
            .unwrap_or_default();

        let mut asset_writes = None;
        if let Some(assets) = item.assets.filter(|assets| !assets.is_empty()) {
            let directory = self.asset_dir()?;
            let mut writes = AssetWrites::new(directory.clone());
            write_note_images(
                &directory,
                &item.external_key,
                assets,
                &mut content,
                &mut writes,
            )?;
            asset_writes = Some(writes);
        }

        let (id, updated_at, status) = if let Some(row) = current {
            if title == row.title
                && content == row.content
                && color == row.color
                && pinned == row.pinned
                && tags == row.tags
                && folder_id == row.folder_id
            {
                (row.id, row.updated_at, "unchanged")
            } else {
                let updated_at = now_ms().max(row.updated_at + 1);
                sqlx::query(
                    "UPDATE notes SET title=$2, content=$3, color=$4, pinned=$5, tags=$6, folder_id=$7, updated_at=$8 WHERE id=$1",
                ).bind(&row.id).bind(title).bind(&content).bind(color).bind(pinned)
                    .bind(tags).bind(folder_id).bind(updated_at)
                    .execute(&mut *transaction).await.map_err(db_error)?;
                (row.id, updated_at, "updated")
            }
        } else {
            let id = Uuid::new_v4().to_string();
            let now = now_ms();
            sqlx::query(
                "INSERT INTO notes (id, title, content, color, pinned, popped_out, tags, folder_id, created_at, updated_at, external_key) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $8, $9)",
            ).bind(&id).bind(title).bind(&content).bind(color).bind(pinned)
                .bind(tags).bind(folder_id).bind(now).bind(&item.external_key)
                .execute(&mut *transaction).await.map_err(|error| note_key_write_error(error, Some(&item.external_key)))?;
            (id, now, "created")
        };
        if status != "unchanged" {
            Self::replace_note_links(&mut transaction, &id, &content).await?;
        }
        transaction.commit().await.map_err(db_error)?;
        if let Some(writes) = asset_writes {
            writes.commit();
        }
        self.emit_note_folders_created(created_folders);
        if status != "unchanged" {
            self.emit_changed("notes", action, Some(id.clone()));
        }
        Ok(json!({
            "externalKey": item.external_key, "status": status, "id": id, "updatedAt": updated_at,
        }))
    }
}

fn upsert_error_message(error: McpError) -> String {
    let mut message = error.message.into_owned();
    if let Some(hints) = error
        .data
        .as_ref()
        .and_then(|data| data["suggestions"].as_array())
    {
        for hint in hints.iter().filter_map(Value::as_str) {
            message.push_str(". ");
            message.push_str(hint);
        }
    }
    message
}

fn write_note_images(
    directory: &Path,
    external_key: &str,
    assets: Vec<NoteAssetInput>,
    content: &mut String,
    writes: &mut AssetWrites,
) -> Result<(), McpError> {
    let mut targets = inline_image_targets(content);
    let mut edits = Vec::new();
    for input in assets {
        let ranges = targets.remove(&input.reference).ok_or_else(|| invalid_argument(
            "assets.ref", format!("No unused inline Markdown image target matches '{}'", input.reference),
            &["Use each image target once in assets and match the destination in the note's Markdown exactly"],
        ))?;
        let default_key = format!("{external_key}#{}", input.reference);
        let asset = prepare_asset(directory, input.asset, Some(&default_key))?;
        let url = super::note_assets::asset_url(&asset.id);
        edits.extend(ranges.into_iter().map(|range| (range, url.clone())));
        writes.write(asset).map_err(asset_storage_error)?;
    }
    edits.sort_unstable_by_key(|(range, _)| std::cmp::Reverse(range.start));
    for (range, replacement) in edits {
        content.replace_range(range, &replacement);
    }
    if content.len() > MAX_TEXT_FIELD_BYTES {
        return Err(resource_limit(
            "Rewritten Markdown exceeds the 1 MiB content limit",
            &["Shorten the note or split it across several notes"],
        ));
    }
    Ok(())
}

/// The parser identifies inline image nodes, so links, escaped syntax and code are left alone.
fn inline_image_targets(content: &str) -> HashMap<String, Vec<Range<usize>>> {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut images = Vec::new();
    let mut targets = HashMap::<_, Vec<_>>::new();
    for (event, range) in Parser::new_ext(content, options).into_offset_iter() {
        match event {
            Event::Start(Tag::Image {
                link_type,
                dest_url,
                ..
            }) => {
                images.push((link_type, dest_url, range.start + 2));
            }
            Event::End(TagEnd::Image) => {
                if let Some((LinkType::Inline, destination, alt_end)) = images.pop() {
                    if let Some(target) = image_target_range(content, alt_end..range.end) {
                        targets
                            .entry(destination.into_string())
                            .or_default()
                            .push(target);
                    }
                }
                if let Some((_, _, alt_end)) = images.last_mut() {
                    *alt_end = (*alt_end).max(range.end);
                }
            }
            _ => {
                if let Some((_, _, alt_end)) = images.last_mut() {
                    *alt_end = (*alt_end).max(range.end);
                }
            }
        }
    }
    targets
}

fn image_target_range(content: &str, range: Range<usize>) -> Option<Range<usize>> {
    let tail = content.get(range.clone())?;
    let after_open = tail.find("](")? + 2;
    let destination = tail[after_open..].trim_start_matches(|c: char| c.is_ascii_whitespace());
    let start = range.end - destination.len();
    let angle = destination.starts_with('<');
    let offset = usize::from(angle);
    let mut escaped = false;
    let mut nested = 0;
    for (index, byte) in destination.bytes().enumerate().skip(offset) {
        if escaped {
            escaped = false;
            if byte.is_ascii_punctuation() {
                continue;
            }
        }
        match byte {
            b'\\' => escaped = true,
            b'>' if angle => return Some(start + 1..start + index),
            b'(' if !angle => nested += 1,
            b')' if !angle && nested == 0 => return Some(start..start + index),
            b')' if !angle => nested -= 1,
            byte if !angle && byte.is_ascii_whitespace() => return Some(start..start + index),
            _ => {}
        }
    }
    None
}
