CREATE TABLE IF NOT EXISTS user_prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  prompt TEXT NOT NULL,
  variables_schema TEXT NOT NULL DEFAULT '[]',
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  optimized_for TEXT NOT NULL DEFAULT 'Generic',
  version TEXT NOT NULL DEFAULT '1.0.0',
  tips TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_prompt_templates_updated
  ON user_prompt_templates(updated_at);
