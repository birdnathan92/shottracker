import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database operations
export interface DbRound {
  id: string;
  course_name: string;
  date: number;
  total_score: number;
  total_par: number;
  hole_stats_data: string; // JSON string of hole stats
  created_at: string;
  updated_at: string;
}

export interface DbCourse {
  id: string;
  name: string;
  location?: string;
  holes: DbCourseHole[];
  created_at: string;
  updated_at: string;
}

export interface DbCourseHole {
  hole_number: number;
  par: number;
  handicap: number;
  length?: number;
}

export interface DbDrive {
  id: string;
  round_id?: string;
  start_lat: number;
  start_lng: number;
  start_accuracy: number;
  end_lat: number;
  end_lng: number;
  end_accuracy: number;
  distance: number;
  club: string;
  timestamp: number;
  created_at: string;
}

export interface DbHoleStats {
  id: string;
  round_id: string;
  hole_number: number;
  score: number;
  putts: number;
  fairway: boolean;
  gir: boolean;
  created_at: string;
}

export interface DbClub {
  id: string;
  name: string;
  avg_distance: number;
  created_at: string;
  updated_at?: string;
}

// Database operation functions
export const supabaseDb = {
  // Rounds operations
  async saveRound(round: DbRound) {
    const { data, error } = await supabase
      .from('rounds')
      .upsert(round, { onConflict: 'id' })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getRounds() {
    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteRound(id: string) {
    const { error } = await supabase
      .from('rounds')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Courses operations
  async saveCourse(course: DbCourse) {
    const { data, error } = await supabase
      .from('courses')
      .upsert({
        id: course.id,
        name: course.name,
        location: course.location,
        holes_data: JSON.stringify(course.holes),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getCourses() {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data || []).map((course: any) => ({
      ...course,
      holes: JSON.parse(course.holes_data || '[]'),
    }));
  },

  async deleteCourse(id: string) {
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Drives operations
  async saveDrive(drive: DbDrive) {
    const { data, error } = await supabase
      .from('drives')
      .upsert(drive, { onConflict: 'id' })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getDrives(roundId?: string) {
    let query = supabase.from('drives').select('*');
    if (roundId) {
      query = query.eq('round_id', roundId);
    }
    const { data, error } = await query.order('timestamp', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deleteDrive(id: string) {
    const { error } = await supabase
      .from('drives')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Hole stats operations
  async saveHoleStats(stats: DbHoleStats) {
    const { data, error } = await supabase
      .from('hole_stats')
      .upsert(stats, { onConflict: 'id' })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getHoleStats(roundId: string) {
    const { data, error } = await supabase
      .from('hole_stats')
      .select('*')
      .eq('round_id', roundId);
    if (error) throw error;
    return data || [];
  },

  // Clubs operations
  async saveClub(club: DbClub) {
    const { data, error } = await supabase
      .from('clubs')
      .upsert(club, { onConflict: 'id' })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getClubs() {
    const { data, error } = await supabase
      .from('clubs')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async deleteClub(id: string) {
    const { error } = await supabase
      .from('clubs')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
