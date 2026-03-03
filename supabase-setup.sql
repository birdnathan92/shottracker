-- Create Courses table
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  holes_data JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Rounds table
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  date BIGINT NOT NULL,
  total_score INTEGER,
  total_par INTEGER,
  hole_stats_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Drives table
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

-- Create Hole Stats table
CREATE TABLE IF NOT EXISTS hole_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  putts INTEGER NOT NULL,
  fairway BOOLEAN DEFAULT FALSE,
  gir BOOLEAN DEFAULT FALSE,
  up_and_down BOOLEAN DEFAULT FALSE,
  sand_save BOOLEAN DEFAULT FALSE,
  tee_accuracy TEXT,
  approach_accuracy TEXT,
  par INTEGER DEFAULT 4,
  distance INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- Create Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  avg_distance DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rounds_date ON rounds(date);
CREATE INDEX IF NOT EXISTS idx_rounds_course_name ON rounds(course_name);
CREATE INDEX IF NOT EXISTS idx_drives_round_id ON drives(round_id);
CREATE INDEX IF NOT EXISTS idx_drives_timestamp ON drives(timestamp);
CREATE INDEX IF NOT EXISTS idx_hole_stats_round_id ON hole_stats(round_id);
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);

-- Enable Row Level Security (RLS) for security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE hole_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all access - modify based on your auth needs)
CREATE POLICY "Allow all access to courses" ON courses
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to rounds" ON rounds
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to drives" ON drives
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to hole_stats" ON hole_stats
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to clubs" ON clubs
  FOR ALL USING (true) WITH CHECK (true);
