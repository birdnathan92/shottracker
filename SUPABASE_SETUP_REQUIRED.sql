-- ============================================================================
-- GOLF TRACKER - FINAL SUPABASE SETUP
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- This is the ONLY SQL file you need to run - ignore all other supabase-*.sql files
-- ============================================================================

-- Drop and recreate ALL tables to ensure clean schema
DROP TABLE IF EXISTS drives CASCADE;
DROP TABLE IF EXISTS hole_stats CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;

-- ============================================================================
-- CLUBS TABLE
-- ============================================================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  avg_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_clubs_name ON clubs(name);
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to clubs" ON clubs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- COURSES TABLE
-- ============================================================================
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  holes_data JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_courses_name ON courses(name);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to courses" ON courses FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- ROUNDS TABLE
-- ============================================================================
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  date BIGINT NOT NULL,
  total_score INTEGER,
  total_par INTEGER,
  hole_stats_data JSONB DEFAULT '{}'::jsonb,
  slope INTEGER,
  course_rating DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rounds_date ON rounds(date);
CREATE INDEX idx_rounds_course_name ON rounds(course_name);
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to rounds" ON rounds FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- DRIVES TABLE
-- ============================================================================
CREATE TABLE drives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  start_accuracy DOUBLE PRECISION,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  end_accuracy DOUBLE PRECISION,
  distance DOUBLE PRECISION NOT NULL,
  club TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_drives_round_id ON drives(round_id);
CREATE INDEX idx_drives_timestamp ON drives(timestamp);
ALTER TABLE drives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to drives" ON drives FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- HOLE_STATS TABLE
-- ============================================================================
CREATE TABLE hole_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  putts INTEGER NOT NULL,
  fairway BOOLEAN DEFAULT NULL,
  gir BOOLEAN DEFAULT NULL,
  up_and_down BOOLEAN DEFAULT NULL,
  sand_save BOOLEAN DEFAULT NULL,
  tee_accuracy TEXT,
  approach_accuracy TEXT,
  par INTEGER DEFAULT 4,
  distance INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

CREATE INDEX idx_hole_stats_round_id ON hole_stats(round_id);
ALTER TABLE hole_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hole_stats" ON hole_stats FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- All tables have been created with proper schemas and RLS policies.
-- The app is now ready to use with Supabase!
