CREATE TABLE IF NOT EXISTS note_links (
  source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('note', 'snippet', 'api-request')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(source_note_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_target
  ON note_links(target_kind, target_id, source_note_id);

-- Existing note bodies are rebuilt into this index by notes.store init. Keeping
-- parsing in application code avoids attempting Markdown parsing in SQLite.
