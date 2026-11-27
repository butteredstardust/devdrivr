-- Existing notes have no external identity, so NULL is the correct backfill.
ALTER TABLE notes ADD COLUMN external_key TEXT;

CREATE UNIQUE INDEX idx_notes_live_external_key ON notes(external_key)
WHERE external_key IS NOT NULL AND deleted_at IS NULL;
