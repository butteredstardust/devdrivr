ALTER TABLE notes ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;

UPDATE notes SET sort_order = -updated_at WHERE sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(pinned, sort_order);
