-- Shared hierarchical folders. IDs are intentionally stable: later migrations and
-- import/export can refer to the same Inbox rows without relying on generated IDs.
CREATE TABLE IF NOT EXISTS resource_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES resource_folders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('notes', 'snippets', 'apiRequests')),
  sort_order REAL NOT NULL DEFAULT 0,
  default_language TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resource_folders_tree
  ON resource_folders(kind, parent_id, sort_order);

CREATE TRIGGER IF NOT EXISTS resource_folders_validate_insert
BEFORE INSERT ON resource_folders
WHEN NEW.parent_id IS NOT NULL AND (
  NEW.parent_id = NEW.id OR
  NOT EXISTS (
    SELECT 1 FROM resource_folders parent
    WHERE parent.id = NEW.parent_id AND parent.kind = NEW.kind
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid resource folder parent');
END;

CREATE TRIGGER IF NOT EXISTS resource_folders_validate_update
BEFORE UPDATE OF parent_id, kind ON resource_folders
WHEN NEW.parent_id IS NOT NULL AND (
  NOT EXISTS (
    SELECT 1 FROM resource_folders parent
    WHERE parent.id = NEW.parent_id AND parent.kind = NEW.kind
  ) OR
  EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM resource_folders WHERE parent_id = NEW.id
      UNION ALL
      SELECT folder.id FROM resource_folders folder
      JOIN descendants ON folder.parent_id = descendants.id
    )
    SELECT 1 FROM descendants WHERE id = NEW.parent_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid resource folder parent');
END;

-- Every resource type has an Inbox, including types with no existing rows.
INSERT OR IGNORE INTO resource_folders
  (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at)
VALUES
  ('notes-inbox', 'Inbox', NULL, 'notes', 0, NULL, 0, 0),
  ('snippets-inbox', 'Inbox', NULL, 'snippets', 0, NULL, 0, 0),
  ('api-requests-inbox', 'Inbox', NULL, 'apiRequests', 0, NULL, 0, 0);

ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES resource_folders(id);
UPDATE notes SET folder_id = 'notes-inbox' WHERE folder_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id, sort_order);

ALTER TABLE snippets ADD COLUMN folder_id TEXT REFERENCES resource_folders(id);
-- A legacy display-name folder is retained verbatim and receives a deterministic,
-- lossless ID based on its UTF-8 bytes. This deliberately distinguishes names that
-- only differ by case or whitespace.
INSERT OR IGNORE INTO resource_folders
  (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at)
SELECT
  'snippets-folder-' || lower(hex(folder)), folder, NULL, 'snippets', 1, NULL,
  MIN(created_at), MAX(updated_at)
FROM snippets
WHERE folder <> ''
GROUP BY folder;
UPDATE snippets SET folder_id = 'snippets-inbox'
  WHERE folder_id IS NULL AND folder = '';
UPDATE snippets
  SET folder_id = 'snippets-folder-' || lower(hex(folder))
  WHERE folder_id IS NULL AND folder <> '';
CREATE INDEX IF NOT EXISTS idx_snippets_folder_id ON snippets(folder_id, updated_at);

-- Keep api_collections and api_requests intact: collection IDs remain the target
-- of api_requests.collection_id. The Inbox collection makes formerly unassigned
-- requests valid members of the typed API hierarchy without breaking that FK.
ALTER TABLE api_collections ADD COLUMN parent_id TEXT REFERENCES resource_folders(id);
ALTER TABLE api_collections ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;
ALTER TABLE api_collections ADD COLUMN default_language TEXT;
INSERT OR IGNORE INTO api_collections
  (id, name, parent_id, sort_order, default_language, created_at, updated_at)
VALUES
  ('api-requests-inbox', 'Inbox', NULL, 0, NULL, 0, 0);
UPDATE api_collections
  SET parent_id = 'api-requests-inbox'
  WHERE parent_id IS NULL AND id <> 'api-requests-inbox';
UPDATE api_collections
  SET sort_order = created_at
  WHERE sort_order = 0 AND id <> 'api-requests-inbox';
INSERT OR IGNORE INTO resource_folders
  (id, name, parent_id, kind, sort_order, default_language, created_at, updated_at)
SELECT id, name, parent_id, 'apiRequests', sort_order, default_language, created_at, updated_at
FROM api_collections
WHERE id <> 'api-requests-inbox';
UPDATE api_requests
  SET collection_id = 'api-requests-inbox'
  WHERE collection_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_collections_tree ON api_collections(parent_id, sort_order);
