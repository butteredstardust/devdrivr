CREATE TABLE IF NOT EXISTS api_environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_requests (
  id TEXT PRIMARY KEY,
  collection_id TEXT,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT NOT NULL,
  body_mode TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES api_collections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_requests_collection ON api_requests(collection_id);
