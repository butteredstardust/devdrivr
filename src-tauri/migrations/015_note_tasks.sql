-- Task metadata remains optional so every existing note stays a plain note.
ALTER TABLE notes ADD COLUMN task_status TEXT
  CHECK(task_status IN ('todo', 'in_progress', 'done', 'blocked'));
ALTER TABLE notes ADD COLUMN task_priority TEXT
  CHECK(task_priority IN ('low', 'medium', 'high'));
ALTER TABLE notes ADD COLUMN task_due_date TEXT;

-- Explicitly backfill existing rows in the same migration. Nullable metadata
-- distinguishes plain notes from tasks without manufacturing task records.
UPDATE notes
SET task_status = NULL, task_priority = NULL, task_due_date = NULL
WHERE task_status IS NULL OR task_priority IS NULL OR task_due_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_task_status
  ON notes(task_status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_task_due_date
  ON notes(task_due_date, task_status, deleted_at);
