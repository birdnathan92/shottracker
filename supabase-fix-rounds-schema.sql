-- Check the current rounds table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'rounds'
ORDER BY ordinal_position;

-- If 'date' is TIMESTAMP, we need to fix it
-- This script will drop and recreate the rounds table with the correct schema

-- First, backup any existing data (optional, comment out if you have no data)
-- CREATE TABLE rounds_backup AS SELECT * FROM rounds;

-- Drop the old rounds table
DROP TABLE IF EXISTS rounds CASCADE;

-- Recreate with correct schema
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  date BIGINT NOT NULL,  -- Unix timestamp in milliseconds
  total_score INTEGER,
  total_par INTEGER,
  hole_stats_data JSONB DEFAULT '{}'::jsonb,
  slope INTEGER,
  course_rating DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_rounds_date ON rounds(date);
CREATE INDEX idx_rounds_course_name ON rounds(course_name);

-- Enable RLS
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Allow all access to rounds" ON rounds;
CREATE POLICY "Allow all access to rounds" ON rounds
  FOR ALL USING (true) WITH CHECK (true);

-- Verify the schema
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rounds' ORDER BY ordinal_position;
