-- Supabase Migration: Ensure clubs table has UNIQUE constraint on name
-- Run this if clubs aren't saving with "400 Bad Request" error

-- First, remove any duplicate clubs (keep the first one by id)
DELETE FROM clubs WHERE id NOT IN (
  SELECT DISTINCT ON (name) id FROM clubs ORDER BY name, created_at ASC
);

-- Add UNIQUE constraint on name if it doesn't exist
-- Note: This will fail silently if the constraint already exists
ALTER TABLE clubs ADD CONSTRAINT clubs_name_key UNIQUE (name);

-- Verify the constraint exists
-- SELECT constraint_name FROM information_schema.table_constraints
-- WHERE table_name = 'clubs' AND constraint_type = 'UNIQUE';
