ALTER TABLE snippets ADD COLUMN description TEXT NOT NULL DEFAULT '';
UPDATE snippets SET description = '' WHERE description IS NULL;

CREATE TABLE IF NOT EXISTS snippet_fragments (
  id TEXT PRIMARY KEY,
  snippet_id TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(snippet_id, sort_order)
);

INSERT INTO snippet_fragments
  (id, snippet_id, name, content, language, sort_order, created_at, updated_at)
SELECT id || ':fragment:1', id, 'main', content, language, 0, created_at, updated_at
FROM snippets
WHERE NOT EXISTS (
  SELECT 1 FROM snippet_fragments fragment WHERE fragment.snippet_id = snippets.id
);

CREATE INDEX IF NOT EXISTS idx_snippet_fragments_snippet_order
  ON snippet_fragments(snippet_id, sort_order);
