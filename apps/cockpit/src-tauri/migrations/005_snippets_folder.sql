-- Add folder column to snippets for flat folder organization
ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';
UPDATE snippets SET folder = '' WHERE folder IS NULL;
