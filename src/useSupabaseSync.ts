import { useEffect, useRef } from 'react';
import { supabaseDb } from './supabaseClient';

interface SyncOptions {
  enabled: boolean;
  debounceMs?: number;
}

export function useSupabaseSync<T>(
  data: T,
  tableName: string,
  saveFunction: (data: T) => Promise<any>,
  options: SyncOptions = { enabled: true, debounceMs: 1000 }
) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!options.enabled) return;

    // Debounce the save operation
    const timer = setTimeout(async () => {
      try {
        await saveFunction(data);
      } catch (error) {
        console.error(`Failed to sync ${tableName} to Supabase:`, error);
      }
    }, options.debounceMs || 1000);

    return () => clearTimeout(timer);
  }, [data, tableName, saveFunction, options]);
}

// Helper to load initial data from Supabase
export async function loadFromSupabase(tableName: string) {
  try {
    switch (tableName) {
      case 'rounds':
        return await supabaseDb.getRounds();
      case 'courses':
        return await supabaseDb.getCourses();
      case 'drives':
        return await supabaseDb.getDrives();
      case 'clubs':
        return await supabaseDb.getClubs();
      default:
        return [];
    }
  } catch (error) {
    console.error(`Failed to load ${tableName} from Supabase:`, error);
    return [];
  }
}

// Helper to check if Supabase is available
export function isSupabaseAvailable(): boolean {
  return !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}
