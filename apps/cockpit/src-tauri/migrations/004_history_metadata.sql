-- Add metadata columns for enhanced history tracking
-- duration_ms, success, output_size, starred

ALTER TABLE history ADD COLUMN duration_ms INTEGER;
ALTER TABLE history ADD COLUMN success INTEGER DEFAULT 1;
ALTER TABLE history ADD COLUMN output_size INTEGER;
ALTER TABLE history ADD COLUMN starred INTEGER DEFAULT 0;

-- Update any existing rows to have success=1 (mark all existing history as successful)
UPDATE history SET success = 1 WHERE success IS NULL;

-- Create index for starred items for quick retrieval
CREATE INDEX IF NOT EXISTS idx_history_starred ON history(starred, timestamp);
