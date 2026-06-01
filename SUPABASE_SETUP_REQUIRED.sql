-- ============================================================================
-- GOLF TRACKER - SUPABASE SETUP (SAFE TO RE-RUN)
-- ============================================================================
-- Run this script in Supabase SQL Editor.
-- It is SAFE to run multiple times — it will NOT delete existing data.
-- It only creates tables/indexes/policies if they don't already exist.
-- This is the ONLY SQL file you need to run — ignore all other supabase-*.sql files.
-- ============================================================================

-- ============================================================================
-- CLUBS TABLE (reference data of all possible clubs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  avg_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clubs' AND policyname = 'Allow all access to clubs') THEN
    CREATE POLICY "Allow all access to clubs" ON clubs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- USER_BAG TABLE (stores user's selected clubs and custom distances)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_bag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_data JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_bag ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_bag' AND policyname = 'Allow all access to user_bag') THEN
    CREATE POLICY "Allow all access to user_bag" ON user_bag FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- COURSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  holes_data JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'courses' AND policyname = 'Allow all access to courses') THEN
    CREATE POLICY "Allow all access to courses" ON courses FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- ROUNDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS rounds (
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

CREATE INDEX IF NOT EXISTS idx_rounds_date ON rounds(date);
CREATE INDEX IF NOT EXISTS idx_rounds_course_name ON rounds(course_name);
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rounds' AND policyname = 'Allow all access to rounds') THEN
    CREATE POLICY "Allow all access to rounds" ON rounds FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- DRIVES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS drives (
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

CREATE INDEX IF NOT EXISTS idx_drives_round_id ON drives(round_id);
CREATE INDEX IF NOT EXISTS idx_drives_timestamp ON drives(timestamp);
ALTER TABLE drives ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drives' AND policyname = 'Allow all access to drives') THEN
    CREATE POLICY "Allow all access to drives" ON drives FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- HOLE_STATS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS hole_stats (
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

CREATE INDEX IF NOT EXISTS idx_hole_stats_round_id ON hole_stats(round_id);
ALTER TABLE hole_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hole_stats' AND policyname = 'Allow all access to hole_stats') THEN
    CREATE POLICY "Allow all access to hole_stats" ON hole_stats FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- COURSE_DATA_POINTS TABLE (Mapping Mode collected GPS coordinates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_data_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  hole_number INTEGER NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION DEFAULT 0,
  area_type TEXT NOT NULL CHECK (area_type IN ('tee_box', 'fairway', 'rough', 'green', 'bunker', 'fairway_bunker', 'greenside_bunker')),
  shot_number INTEGER,
  club TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_data_points_course ON course_data_points(course_name);
CREATE INDEX IF NOT EXISTS idx_course_data_points_hole ON course_data_points(course_name, hole_number);
ALTER TABLE course_data_points ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'course_data_points' AND policyname = 'Allow all access to course_data_points') THEN
    CREATE POLICY "Allow all access to course_data_points" ON course_data_points FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- All tables created (if they didn't exist) with proper schemas and RLS policies.
-- Existing data is preserved. Safe to re-run at any time.
