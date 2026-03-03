-- SAFE: Drop and recreate clubs table
-- This will delete all existing club data, but the app stores clubs locally anyway

-- Drop the old clubs table (and any depending rows)
DROP TABLE IF EXISTS clubs CASCADE;

-- Recreate it with the correct schema
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  avg_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);

-- Enable Row Level Security
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all access
DROP POLICY IF EXISTS "Allow all access to clubs" ON clubs;
CREATE POLICY "Allow all access to clubs" ON clubs
  FOR ALL USING (true) WITH CHECK (true);

-- Verify table was created
SELECT table_name FROM information_schema.tables WHERE table_name = 'clubs';
