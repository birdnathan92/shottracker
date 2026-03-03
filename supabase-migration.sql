-- Supabase Migration: Update schema to support complete data persistence
-- Run this migration on your Supabase database to update the existing schema

-- 1. Alter rounds table to add new columns
-- First, drop the foreign key constraint if it exists
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_course_id_fkey;

-- Add new columns to rounds table
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS course_name TEXT DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS total_par INTEGER DEFAULT 72,
  ADD COLUMN IF NOT EXISTS hole_stats_data JSONB DEFAULT '{}'::jsonb;

-- Drop the old course_id column if you don't need it anymore (optional, comment out to keep)
-- ALTER TABLE rounds DROP COLUMN IF EXISTS course_id;

-- Drop the old total_putts column if you don't need it anymore (optional, comment out to keep)
-- ALTER TABLE rounds DROP COLUMN IF EXISTS total_putts;

-- 2. Update hole_stats table to add missing columns
ALTER TABLE hole_stats
  ADD COLUMN IF NOT EXISTS up_and_down BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sand_save BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tee_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS approach_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS par INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS distance INTEGER DEFAULT 0;

-- 3. Update clubs table to add updated_at column
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. Create new indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rounds_course_name ON rounds(course_name);
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);

-- Note: After running this migration, the app will start saving data to the new columns.
-- You can optionally clean up old columns (course_id, total_putts) once you verify data is syncing correctly.
