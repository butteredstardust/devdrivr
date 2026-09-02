-- Repair nullable values left by migrations that originally relied on column defaults.
-- This migration is required for databases that already recorded migrations 003 and 004.
UPDATE notes SET tags = '[]' WHERE tags IS NULL;
UPDATE history SET success = 1 WHERE success IS NULL;
UPDATE history SET starred = 0 WHERE starred IS NULL;
