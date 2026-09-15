-- Provenance for a prompt template. Every column is nullable, so ADD COLUMN already leaves
-- existing rows at NULL and no backfill is needed.
ALTER TABLE user_prompt_templates ADD COLUMN language TEXT;
ALTER TABLE user_prompt_templates ADD COLUMN engine TEXT;
ALTER TABLE user_prompt_templates ADD COLUMN example_json TEXT;
ALTER TABLE user_prompt_templates ADD COLUMN source_json TEXT;

-- Remap user templates off the retired categories. A row left on a retired category fails
-- promptTemplateRowSchema, and the reader drops it, so the user loses the template.
UPDATE user_prompt_templates
SET category = CASE category
  WHEN 'code-review' THEN 'engineering'
  WHEN 'refactoring' THEN 'engineering'
  WHEN 'testing' THEN 'engineering'
  WHEN 'debugging' THEN 'engineering'
  WHEN 'docs' THEN 'content-creation'
  WHEN 'learning' THEN 'productivity'
  ELSE category
END
WHERE author = 'user'
  AND category IN ('code-review', 'refactoring', 'testing', 'debugging', 'docs', 'learning');

-- Remove the retired built-ins. The seed upserts by id and never deletes, so without this the old
-- rows stay in the library forever. Deleting by author is safe: a user template is author 'user',
-- and the seed re-inserts the current built-ins on the next boot.
DELETE FROM user_prompt_templates WHERE author = 'builtin';
