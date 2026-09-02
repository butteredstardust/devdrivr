-- NOTE: WAL mode is set at connection time in db.ts, not here.
-- PRAGMA journal_mode=WAL cannot run inside a migration transaction.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_state (
  tool_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snippets_updated ON snippets(updated_at);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  pinned INTEGER NOT NULL DEFAULT 0,
  popped_out INTEGER NOT NULL DEFAULT 0,
  window_x REAL,
  window_y REAL,
  window_width REAL,
  window_height REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned, updated_at);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  sub_tab TEXT,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_tool ON history(tool, timestamp);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
