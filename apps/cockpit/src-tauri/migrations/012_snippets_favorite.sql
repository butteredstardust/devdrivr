-- Keep favorite state separate from user-defined tags.
ALTER TABLE snippets ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
UPDATE snippets SET favorite = 1 WHERE tags LIKE '%⭐%';
UPDATE snippets SET favorite = 0 WHERE favorite IS NULL;
