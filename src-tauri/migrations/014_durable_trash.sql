-- Durable trash is intentionally a nullable timestamp rather than a boolean: it
-- records when a row was trashed and lets a folder restore only the rows trashed
-- by that same subtree operation.
ALTER TABLE notes ADD COLUMN deleted_at INTEGER;
UPDATE notes SET deleted_at = NULL WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);

ALTER TABLE snippets ADD COLUMN deleted_at INTEGER;
UPDATE snippets SET deleted_at = NULL WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_snippets_deleted_at ON snippets(deleted_at);

ALTER TABLE api_requests ADD COLUMN deleted_at INTEGER;
UPDATE api_requests SET deleted_at = NULL WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_requests_deleted_at ON api_requests(deleted_at);

ALTER TABLE resource_folders ADD COLUMN deleted_at INTEGER;
UPDATE resource_folders SET deleted_at = NULL WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resource_folders_deleted_at ON resource_folders(deleted_at);

-- API collections mirror typed API folders and must share their trash state.
ALTER TABLE api_collections ADD COLUMN deleted_at INTEGER;
UPDATE api_collections SET deleted_at = NULL WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_collections_deleted_at ON api_collections(deleted_at);
