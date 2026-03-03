/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { supabaseDb } from './supabaseClient';
import { isSupabaseAvailable } from './useSupabaseSync';
import {
  MapPin,
  Pencil,
  History,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Settings,
  Target,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Save,
  Search,
  Loader2,
  Home,
  BarChart3
} from 'lucide-react';

// --- Custom Icons ---

const GolfBagIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M6 4h12v16H6z" />
    <path d="M6 8h12" />
    <path d="M6 12h12" />
    <path d="M6 16h12" />
    <path d="M9 4V2h6v2" />
    <path d="M18 6v12" />
    <path d="M6 6v12" />
  </svg>
);

// --- Types ---

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface Club {
  id: string;
  name: string;
  avgDistance: number;
}

interface Drive {
  id: string;
  start: Position;
  end: Position;
  distance: number; // in meters
  club: string;
  timestamp: number;
}

interface HoleStats {
  score: number;
  putts: number;
  fairway: boolean | null;  // null = unselected
  gir: boolean | null;      // null = unselected
  upAndDown: boolean | null; // null = unselected
  sandSave: boolean | null;  // null = unselected
  teeAccuracy: 'left' | 'center' | 'right' | null;
  approachAccuracy: 'left' | 'right' | 'short' | 'long' | 'center' | null;
  par: number;
  distance?: number;
}

interface CourseHole {
  par: number;
  distance: number;
}

interface TeeBox {
  name: string;
  color: string;
  holes: CourseHole[];
  slope?: number;
  courseRating?: number;
}

interface Course {
  id: string;
  name: string;
  holes: CourseHole[];
  teeBoxes?: TeeBox[];
}

type Unit = 'yards' | 'meters';

// --- Constants ---

const DEFAULT_CLUBS: Club[] = [
  { id: '1', name: 'Driver', avgDistance: 250 },
  { id: '2', name: '2 Iron', avgDistance: 210 },
  { id: '3', name: '2 Hybrid', avgDistance: 215 },
  { id: '4', name: '3 Iron', avgDistance: 205 },
  { id: '5', name: '3 Hybrid', avgDistance: 200 },
  { id: '6', name: '3 Wood', avgDistance: 220 },
  { id: '7', name: '4 Iron', avgDistance: 195 },
  { id: '8', name: '4 Hybrid', avgDistance: 190 },
  { id: '9', name: '5 Wood', avgDistance: 200 },
  { id: '10', name: '5 Iron', avgDistance: 180 },
  { id: '11', name: '6 Iron', avgDistance: 170 },
  { id: '12', name: '7 Iron', avgDistance: 160 },
  { id: '13', name: '8 Iron', avgDistance: 150 },
  { id: '14', name: '9 Iron', avgDistance: 140 },
  { id: '15', name: 'PW', avgDistance: 130 },
  { id: '16', name: 'GW', avgDistance: 120 },
  { id: '17', name: 'SW', avgDistance: 100 },
  { id: '18', name: 'LW', avgDistance: 80 },
  { id: '19', name: 'Mini Driver', avgDistance: 240 },
  { id: '20', name: 'Putter', avgDistance: 0 },
];

// --- Utils ---

const calculateDistance = (pos1: Position, pos2: Position): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (pos1.lat * Math.PI) / 180;
  const φ2 = (pos2.lat * Math.PI) / 180;
  const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const formatDistance = (meters: number, unit: Unit): string => {
  if (unit === 'yards') {
    return `${Math.round(meters * 1.09361)} yds`;
  }
  return `${Math.round(meters)} m`;
};

// --- Components ---

interface Round {
  id: string;
  courseName: string;
  date: number;
  totalScore: number;
  totalPar: number;
  holeStats: Record<number, HoleStats>;
  slope?: number;
  courseRating?: number;
}

// Tee box colors for UI
const TEE_BOX_COLORS: Record<string, string> = {
  black: 'bg-stone-800 text-white',
  blue: 'bg-blue-500 text-white',
  white: 'bg-white text-stone-700 border border-stone-300',
  red: 'bg-red-500 text-white',
  gold: 'bg-amber-400 text-stone-800',
  green: 'bg-green-500 text-white',
};

const TEE_COLOR_OPTIONS = ['black', 'blue', 'white', 'red', 'gold', 'green'];

// Helper: safely parse localStorage
function loadLocal<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch { return fallback; }
}

// Approach Shot type (defined outside component for lazy init)
interface ApproachShot {
  holeNumber: number;
  distance: number;
  club: string;
  timestamp: number;
}

export default function App() {
  const [currentPos, setCurrentPos] = useState<Position | null>(null);
  const [startPos, setStartPos] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastDriveDistance, setLastDriveDistance] = useState<number | null>(null);
  const [view, setView] = useState<'home' | 'tracker' | 'history' | 'settings'>('home');

  // Course Search States
  const [courseSearch, setCourseSearch] = useState('');
  const [isSearchingCourse, setIsSearchingCourse] = useState(false);
  const [courseName, setCourseName] = useState(() => loadLocal('golf_course_name', ''));

  // ---- All persisted state: lazy-initialized from localStorage ----
  const [history, setHistory] = useState<Drive[]>(() => loadLocal('golf_drive_history', []));
  const [rounds, setRounds] = useState<Round[]>(() => loadLocal('golf_rounds', []));
  const [unit, setUnit] = useState<Unit>(() => loadLocal('golf_unit', 'yards'));
  const [bag, setBag] = useState<Club[]>(() => loadLocal('golf_bag', DEFAULT_CLUBS));
  const [courses, setCourses] = useState<Course[]>(() => loadLocal('golf_courses', []));
  const [holeStats, setHoleStats] = useState<Record<number, HoleStats>>(() => loadLocal('golf_hole_stats', {
    1: { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 }
  }));
  const [approachShots, setApproachShots] = useState<ApproachShot[]>(() => loadLocal('golf_approach_shots', []));

  const [selectedClubId, setSelectedClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [isBagModalOpen, setIsBagModalOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isRoundActive, setIsRoundActive] = useState(() => loadLocal('golf_is_round_active', false));
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [isRoundModalOpen, setIsRoundModalOpen] = useState(false);
  const [selectedApproachClubId, setSelectedApproachClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [remainingDistance, setRemainingDistance] = useState<number | null>(null);
  const [teeBoxSelectionCourse, setTeeBoxSelectionCourse] = useState<Course | null>(null);
  const [activeSlope, setActiveSlope] = useState<number>(0);
  const [activeCourseRating, setActiveCourseRating] = useState<number>(0);

  // Score Tracking State
  const [currentHole, setCurrentHole] = useState(() => loadLocal('golf_current_hole', 1));

  // Editing tee boxes for manual course entry
  const [editingTeeBoxes, setEditingTeeBoxes] = useState<{ name: string; color: string; slope: number; courseRating: number; distances: number[] }[]>([]);

  // ---- DATA PERSISTENCE: Consolidated load/save with Supabase as primary ----
  const isInitialLoadComplete = React.useRef(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'connected' | 'offline' | 'error' | null>(null);

  // Single consolidated Supabase load on mount - SEQUENTIAL to prevent race conditions
  useEffect(() => {
    const loadAllFromSupabase = async () => {
      if (!isSupabaseAvailable()) {
        setSyncStatus('offline');
        isInitialLoadComplete.current = true;
        setIsAppLoading(false);
        return;
      }

      try {
        // Load courses
        const coursesFromSupabase = await supabaseDb.getCourses();
        if (coursesFromSupabase && coursesFromSupabase.length > 0) {
          const mapped = coursesFromSupabase.map((c: any) => ({
            id: c.id, name: c.name, holes: c.holes || [],
            teeBoxes: c.teeBoxes || undefined,
          }));
          setCourses(mapped);
          localStorage.setItem('golf_courses', JSON.stringify(mapped));
        }

        // Load rounds
        const roundsFromSupabase = await supabaseDb.getRounds();
        if (roundsFromSupabase && roundsFromSupabase.length > 0) {
          const mapped = roundsFromSupabase.map((r: any) => ({
            id: r.id, courseName: r.course_name, date: r.date,
            totalScore: r.total_score, totalPar: r.total_par,
            holeStats: r.hole_stats_data ? (typeof r.hole_stats_data === 'string' ? JSON.parse(r.hole_stats_data) : r.hole_stats_data) : {},
            slope: r.slope, courseRating: r.course_rating,
          }));
          setRounds(mapped);
          localStorage.setItem('golf_rounds', JSON.stringify(mapped));
        }

        // Load clubs
        const clubsFromSupabase = await supabaseDb.getClubs();
        if (clubsFromSupabase && clubsFromSupabase.length > 0) {
          const mapped = clubsFromSupabase.map((c: any) => ({
            id: c.id, name: c.name, avgDistance: c.avg_distance || 0,
          }));
          setBag(mapped);
          localStorage.setItem('golf_bag', JSON.stringify(mapped));
        }

        // Load drives
        const drivesFromSupabase = await supabaseDb.getDrives();
        if (drivesFromSupabase && drivesFromSupabase.length > 0) {
          setHistory(drivesFromSupabase);
          localStorage.setItem('golf_drive_history', JSON.stringify(drivesFromSupabase));
        }

        setSyncStatus('connected');
      } catch (error: any) {
        console.error('Supabase load failed:', error);
        setSyncStatus('error');
        setError(`Database connection failed: ${error?.message || 'Check your Supabase URL and anon key in .env'}`);
      }

      // Mark load complete AFTER all data is loaded
      isInitialLoadComplete.current = true;
      setIsAppLoading(false);
    };

    loadAllFromSupabase();
  }, []);

  // ---- Save to localStorage on state change (skip during initial load) ----
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_drive_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_rounds', JSON.stringify(rounds)); }, [rounds]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_unit', JSON.stringify(unit)); }, [unit]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_bag', JSON.stringify(bag)); }, [bag]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_courses', JSON.stringify(courses)); }, [courses]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_hole_stats', JSON.stringify(holeStats)); }, [holeStats]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_approach_shots', JSON.stringify(approachShots)); }, [approachShots]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_is_round_active', JSON.stringify(isRoundActive)); }, [isRoundActive]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_current_hole', JSON.stringify(currentHole)); }, [currentHole]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_course_name', JSON.stringify(courseName)); }, [courseName]);

  // ---- Sync to Supabase (guarded: only after initial load completes) ----
  useEffect(() => {
    if (!isInitialLoadComplete.current || !isSupabaseAvailable()) return;
    const sync = async () => {
      try {
        for (const course of courses) {
          await supabaseDb.saveCourse({
            id: course.id, name: course.name, location: undefined,
            holes: course.holes, teeBoxes: course.teeBoxes,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('Sync courses failed:', e); }
    };
    const t = setTimeout(sync, 1500);
    return () => clearTimeout(t);
  }, [courses]);

  useEffect(() => {
    if (!isInitialLoadComplete.current || !isSupabaseAvailable()) return;
    const sync = async () => {
      try {
        for (const round of rounds) {
          await supabaseDb.saveRound({
            id: round.id, course_name: round.courseName, date: round.date,
            total_score: round.totalScore, total_par: round.totalPar,
            hole_stats_data: JSON.stringify(round.holeStats),
            created_at: '', updated_at: '',  // Let DB defaults handle timestamps
          });
        }
      } catch (e) { console.error('Sync rounds failed:', e); }
    };
    const t = setTimeout(sync, 1500);
    return () => clearTimeout(t);
  }, [rounds]);

  useEffect(() => {
    if (!isInitialLoadComplete.current || !isSupabaseAvailable()) return;
    const sync = async () => {
      try {
        for (const drive of history) {
          await supabaseDb.saveDrive({
            id: drive.id, start_lat: drive.start.lat, start_lng: drive.start.lng,
            start_accuracy: drive.start.accuracy || 0,
            end_lat: drive.end.lat, end_lng: drive.end.lng,
            end_accuracy: drive.end.accuracy || 0,
            distance: drive.distance, club: drive.club,
            timestamp: drive.timestamp, created_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('Sync drives failed:', e); }
    };
    const t = setTimeout(sync, 1500);
    return () => clearTimeout(t);
  }, [history]);

  useEffect(() => {
    if (!isInitialLoadComplete.current || !isSupabaseAvailable()) {
      console.log('[App] Skipping club sync:', { isInitialLoadComplete: isInitialLoadComplete.current, supabaseAvailable: isSupabaseAvailable() });
      return;
    }
    const sync = async () => {
      console.log('[App] Syncing', bag.length, 'clubs to Supabase');
      try {
        for (const club of bag) {
          await supabaseDb.saveClub({
            name: club.name,
            avg_distance: club.avgDistance,
          });
        }
        console.log('[App] Club sync complete');
      } catch (e) {
        console.error('[App] Sync clubs failed:', e);
      }
    };
    const t = setTimeout(sync, 1500);
    return () => clearTimeout(t);
  }, [bag]);

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleStartDrive = () => {
    if (currentPos) {
      setStartPos(currentPos);
      setIsTracking(true);
      setLastDriveDistance(null);
    } else {
      setError('Waiting for GPS signal...');
    }
  };

  const handleMarkBall = () => {
    if (startPos && currentPos) {
      const distance = calculateDistance(startPos, currentPos);
      setLastDriveDistance(distance);
      const club = bag.find(c => c.id === selectedClubId)?.name || 'Unknown';
      const newDrive: Drive = {
        id: crypto.randomUUID(),
        start: startPos,
        end: currentPos,
        distance,
        club,
        timestamp: Date.now(),
      };
      setHistory([newDrive, ...history]);

      // Check if this is an approach shot (has remaining distance recorded)
      const holeDistance = courseName ? getCurrentHoleDistance() : null;
      if (holeDistance && remainingDistance && remainingDistance > 0 && distance < remainingDistance) {
        // This is an approach shot
        const approachClub = bag.find(c => c.id === selectedApproachClubId)?.name || 'Unknown';
        const newApproach: ApproachShot = {
          holeNumber: currentHole,
          distance,
          club: approachClub,
          timestamp: Date.now(),
        };
        setApproachShots([...approachShots, newApproach]);
        setRemainingDistance(null);
      } else if (holeDistance) {
        // This is a tee shot, calculate remaining distance
        setRemainingDistance(Math.max(0, holeDistance - distance));
      }

      setStartPos(null);
      setIsTracking(false);
    }
  };

  const handleReset = () => {
    setStartPos(null);
    setIsTracking(false);
  };

  const getCurrentHoleDistance = (): number => {
    if (!courseName) return 0;
    const course = courses.find(c => c.name === courseName);
    if (!course || !course.holes[currentHole - 1]) return 0;
    return course.holes[currentHole - 1].distance;
  };

  const deleteDrive = async (id: string) => {
    // Delete from Supabase first
    if (isSupabaseAvailable()) {
      try {
        await supabaseDb.deleteDrive(id);
      } catch (error) {
        console.error('Failed to delete drive from Supabase:', error);
      }
    }
    // Then delete from local state
    setHistory(history.filter(d => d.id !== id));
  };

  // Score Handlers
  const updateScore = (delta: number) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, score: Math.max(1, current.score + delta) }
      };
    });
  };

  const updatePutts = (delta: number) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, putts: Math.max(0, current.putts + delta) }
      };
    });
  };

  const setTeeAccuracy = (accuracy: 'left' | 'center' | 'right') => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, teeAccuracy: current.teeAccuracy === accuracy ? null : accuracy }
      };
    });
  };

  const setApproachAccuracy = (accuracy: 'left' | 'right' | 'short' | 'long' | 'center') => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, approachAccuracy: current.approachAccuracy === accuracy ? null : accuracy }
      };
    });
  };

  const toggleStat = (stat: keyof Omit<HoleStats, 'score' | 'putts' | 'teeAccuracy' | 'approachAccuracy' | 'par'>) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      // Cycle: null -> true -> false -> null
      let newValue: boolean | null;
      if (current[stat] === null) {
        newValue = true;
      } else if (current[stat] === true) {
        newValue = false;
      } else {
        newValue = null;
      }

      // Sand Save implies Up&Down (golf rule: sand saves are a type of up&down recovery)
      if (stat === 'sandSave' && newValue === true) {
        return {
          ...prev,
          [currentHole]: { ...current, [stat]: newValue, upAndDown: true }
        };
      }

      // Normal toggle
      return {
        ...prev,
        [currentHole]: { ...current, [stat]: newValue }
      };
    });
  };

  const changeHole = (delta: number) => {
    const nextHole = Math.max(1, Math.min(18, currentHole + delta));
    if (!holeStats[nextHole]) {
      setHoleStats(prev => ({
        ...prev,
        [nextHole]: { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 }
      }));
    }
    setCurrentHole(nextHole);
    setRemainingDistance(null);
  };

  // Auto-suggest approach shot club based on distance to green
  const suggestApproachClub = (distanceInMeters: number): string | null => {
    if (bag.length === 0) return null;

    // Convert distance to same unit as club distances for comparison
    const distanceYards = distanceInMeters * 1.09361;

    // Find club with avg distance closest to but not exceeding the remaining distance
    let bestClub: typeof bag[0] | null = null;
    let smallestDifference = Infinity;

    for (const club of bag) {
      if (club.avgDistance <= distanceYards) {
        const difference = distanceYards - club.avgDistance;
        if (difference < smallestDifference) {
          smallestDifference = difference;
          bestClub = club;
        }
      }
    }

    // If no club found that stays within distance, pick the shortest club
    if (!bestClub) {
      bestClub = bag.reduce((shortest, current) =>
        current.avgDistance < shortest.avgDistance ? current : shortest
      );
    }

    return bestClub?.id || null;
  };

  // Auto-select approach club when distance to green appears
  useEffect(() => {
    if (remainingDistance && remainingDistance > 0 && isTracking) {
      const suggestedClubId = suggestApproachClub(remainingDistance);
      if (suggestedClubId && suggestedClubId !== selectedApproachClubId) {
        setSelectedApproachClubId(suggestedClubId);
      }
    }
  }, [remainingDistance, isTracking, bag]);

  const importCoursePars = async () => {
    if (!courseSearch.trim()) return;

    // Check if API key is set
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.length < 10) {
      setError("Gemini API key not configured. Use 'Manual Entry' to add courses, or set GEMINI_API_KEY in your .env file.");
      return;
    }

    setIsSearchingCourse(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `Find hole-by-hole par and tee box yardage information for the golf course: "${courseSearch}".

Return ONLY a JSON object with this exact structure:
{
  "name": "Course Name",
  "teeBoxes": [
    {
      "name": "Blue",
      "color": "blue",
      "slope": 128,
      "courseRating": 71.2,
      "holes": [{"par": 4, "distance": 380}, ...]
    },
    {
      "name": "White",
      "color": "white",
      "slope": 124,
      "courseRating": 69.8,
      "holes": [{"par": 4, "distance": 350}, ...]
    }
  ]
}

Requirements:
- Include ALL available tee boxes (Championship/Black, Blue, White, Red, Gold, etc.)
- Each tee box must have exactly 18 holes with "par" (integer) and "distance" (integer in yards)
- Include slope rating and course rating for each tee box if available (use 0 if unknown)
- Par values are the same across all tee boxes, only distances change
- Order tee boxes from longest to shortest
- If you cannot find specific yardages for some tee boxes, still include the par values with distance as 0
- Common tee box colors: black, blue, white, red, gold, green`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        },
      });

      const data = JSON.parse(response.text || '{}');

      if (data.teeBoxes && Array.isArray(data.teeBoxes) && data.teeBoxes.length > 0) {
        const teeBoxes: TeeBox[] = data.teeBoxes.map((tb: any) => ({
          name: tb.name || 'Default',
          color: tb.color || 'white',
          slope: tb.slope || 0,
          courseRating: tb.courseRating || 0,
          holes: (tb.holes || []).map((h: any) => ({ par: h.par || 4, distance: h.distance || 0 }))
        })).filter((tb: TeeBox) => tb.holes.length === 18);

        if (teeBoxes.length > 0) {
          const newCourse: Course = {
            id: crypto.randomUUID(),
            name: data.name || courseSearch,
            holes: teeBoxes[0].holes,
            teeBoxes
          };
          setCourses(prev => [newCourse, ...prev]);
          setCourseSearch('');
          setError(null);
        } else {
          throw new Error("No valid 18-hole tee box data found");
        }
      } else if (data.holes && Array.isArray(data.holes) && data.holes.length === 18) {
        const newCourse: Course = {
          id: crypto.randomUUID(),
          name: data.name || courseSearch,
          holes: data.holes.map((h: any) => ({ par: h.par || 4, distance: h.distance || 0 }))
        };
        setCourses(prev => [newCourse, ...prev]);
        setCourseSearch('');
      } else {
        throw new Error("Invalid course data received");
      }
    } catch (err: any) {
      console.error('Course search error:', err);
      const msg = err?.message || '';
      if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
        setError("Invalid Gemini API key. Check your .env file or use Manual Entry.");
      } else {
        setError("Could not find course data. Try a more specific name or use Manual Entry.");
      }
    } finally {
      setIsSearchingCourse(false);
    }
  };

  const applyCourse = (course: Course, teeBox?: TeeBox) => {
    const holes = teeBox ? teeBox.holes : course.holes;
    const newStats: Record<number, HoleStats> = {};
    holes.forEach((hole, index) => {
      const holeNum = index + 1;
      newStats[holeNum] = {
        score: hole.par,
        putts: 2,
        fairway: false,
        gir: false,
        upAndDown: false,
        sandSave: false,
        teeAccuracy: null,
        approachAccuracy: null,
        par: hole.par,
        distance: hole.distance
      };
    });
    setHoleStats(newStats);
    const teeLabel = teeBox ? ` (${teeBox.name})` : '';
    setCourseName(course.name + teeLabel);
    setActiveSlope(teeBox?.slope || 0);
    setActiveCourseRating(teeBox?.courseRating || 0);
    setCurrentHole(1);
    setIsRoundActive(true);
    setTeeBoxSelectionCourse(null);
    setView('tracker');
  };

  const saveManualCourse = () => {
    if (!editingCourse || !editingCourse.name.trim()) return;

    // Build tee boxes from editing state
    let courseToSave = { ...editingCourse };
    if (editingTeeBoxes.length > 0) {
      const teeBoxes: TeeBox[] = editingTeeBoxes.map(tb => ({
        name: tb.name,
        color: tb.color,
        slope: tb.slope || 0,
        courseRating: tb.courseRating || 0,
        holes: editingCourse.holes.map((hole, i) => ({
          par: hole.par,
          distance: tb.distances[i] || 0,
        })),
      }));
      // Default holes use first tee box distances
      const defaultHoles = editingCourse.holes.map((hole, i) => ({
        par: hole.par,
        distance: editingTeeBoxes[0]?.distances[i] || hole.distance || 0,
      }));
      courseToSave = { ...courseToSave, holes: defaultHoles, teeBoxes };
    }

    setCourses(prev => {
      const exists = prev.find(c => c.id === courseToSave.id);
      if (exists) {
        return prev.map(c => c.id === courseToSave.id ? courseToSave : c);
      }
      return [courseToSave, ...prev];
    });

    setIsCourseModalOpen(false);
    setEditingCourse(null);
    setEditingTeeBoxes([]);
  };

  const startManualCourse = (course?: Course) => {
    if (course) {
      const clone = JSON.parse(JSON.stringify(course));
      setEditingCourse(clone);
      // Populate editing tee boxes from existing course
      if (course.teeBoxes && course.teeBoxes.length > 0) {
        setEditingTeeBoxes(course.teeBoxes.map(tb => ({
          name: tb.name,
          color: tb.color,
          slope: tb.slope || 0,
          courseRating: tb.courseRating || 0,
          distances: tb.holes.map(h => h.distance),
        })));
      } else {
        setEditingTeeBoxes([{
          name: 'White', color: 'white', slope: 0, courseRating: 0,
          distances: course.holes.map(h => h.distance),
        }]);
      }
    } else {
      setEditingCourse({
        id: crypto.randomUUID(),
        name: '',
        holes: Array(18).fill(null).map(() => ({ par: 4, distance: 0 }))
      });
      setEditingTeeBoxes([{
        name: 'White', color: 'white', slope: 0, courseRating: 0,
        distances: Array(18).fill(0),
      }]);
    }
    setIsCourseModalOpen(true);
  };

  const deleteCourse = async (id: string) => {
    if (confirm('Delete this course?')) {
      // Delete from Supabase first
      if (isSupabaseAvailable()) {
        try {
          await supabaseDb.deleteCourse(id);
        } catch (error) {
          console.error('Failed to delete course from Supabase:', error);
        }
      }
      // Then delete from local state
      setCourses(courses.filter(c => c.id !== id));
    }
  };

  const deleteRound = async (roundId: string) => {
    if (confirm('Delete this round?')) {
      // Delete from Supabase first
      if (isSupabaseAvailable()) {
        try {
          await supabaseDb.deleteRound(roundId);
        } catch (error) {
          console.error('Failed to delete round from Supabase:', error);
        }
      }
      // Then delete from local state
      setRounds(rounds.filter(r => r.id !== roundId));
      setIsRoundModalOpen(false);
      setSelectedRound(null);
    }
  };

  const updateRound = async (roundId: string, updatedHoleStats: Record<number, HoleStats>) => {
    // Update local state
    setRounds(rounds.map(r =>
      r.id === roundId
        ? { ...r, holeStats: updatedHoleStats }
        : r
    ));
    // Close modal
    setIsRoundModalOpen(false);
    setSelectedRound(null);
  };

  const saveBag = async () => {
    // Save to localStorage immediately
    localStorage.setItem('golf_bag', JSON.stringify(bag));

    // Save to Supabase
    const supabaseReady = isSupabaseAvailable();
    console.log('[App] Supabase available:', supabaseReady);

    if (supabaseReady) {
      try {
        console.log('[App] Saving', bag.length, 'clubs to Supabase');
        let successCount = 0;
        let skipCount = 0;

        for (const club of bag) {
          try {
            const result = await supabaseDb.saveClub({
              name: club.name,
              avg_distance: club.avgDistance,
            });
            if (result) successCount++;
          } catch (err) {
            console.error('[App] Error saving club', club.name, ':', err);
            skipCount++;
          }
        }

        console.log(`[App] Club save complete: ${successCount} inserted, ${skipCount} skipped (already exist)`);
        setError(null); // Clear any previous errors
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[App] Failed to save clubs to Supabase:', errorMsg);
        setError(`Club sync failed: ${errorMsg}`);
      }
    } else {
      console.warn('[App] Supabase not available - clubs saved to localStorage only');
    }

    // Close modal
    setIsBagModalOpen(false);
  };

  const resetRoundState = () => {
    setHoleStats({ 1: { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 } });
    setCourseName('');
    setCurrentHole(1);
    setRemainingDistance(null);
    setLastDriveDistance(null);
    setIsRoundActive(false);
    setIsTracking(false);
    setStartPos(null);
    setView('home');
  };

  const endRound = () => {
    if (!courseName) return;

    const holes = Object.values(holeStats) as HoleStats[];
    const totalScore = holes.reduce((acc, h) => acc + h.score, 0);
    const totalPar = holes.reduce((acc, h) => acc + (h.par || 4), 0);

    const newRound: Round = {
      id: crypto.randomUUID(),
      courseName,
      date: Date.now(),
      totalScore,
      totalPar,
      holeStats: { ...holeStats },
      slope: activeSlope || undefined,
      courseRating: activeCourseRating || undefined,
    };

    setRounds([newRound, ...rounds]);
    resetRoundState();
  };

  const cancelRound = () => {
    if (confirm('Cancel this round? All scores and stats for this round will be deleted.')) {
      resetRoundState();
    }
  };

  const liveDistance = startPos && currentPos ? calculateDistance(startPos, currentPos) : 0;
  const currentHoleData = holeStats[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };

  const getScoreIndicator = (score: number, par: number) => {
    const diff = score - par;
    if (diff === 0) return { label: 'Par', color: 'text-stone-400' };
    if (diff === -1) return { label: 'Birdie', color: 'text-emerald-500' };
    if (diff === -2) return { label: 'Eagle', color: 'text-amber-500' };
    if (diff <= -3) return { label: 'Albatross', color: 'text-purple-500' };
    if (diff === 1) return { label: 'Bogey', color: 'text-orange-500' };
    if (diff === 2) return { label: 'Double Bogey', color: 'text-red-500' };
    return { label: `${diff > 0 ? '+' : ''}${diff}`, color: 'text-red-700' };
  };

  const scoreIndicator = getScoreIndicator(currentHoleData.score, currentHoleData.par);

  // Loading screen while Supabase data loads
  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-emerald-600 mx-auto" />
          <p className="text-stone-400 font-medium text-sm">Loading your data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Sync Status Dot */}
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              syncStatus === 'connected' ? 'bg-emerald-500' :
              syncStatus === 'error' ? 'bg-red-500 animate-pulse' :
              syncStatus === 'offline' ? 'bg-amber-500' : 'bg-stone-300'
            }`}
            title={syncStatus === 'connected' ? 'Synced to cloud' : syncStatus === 'error' ? 'Database error' : syncStatus === 'offline' ? 'Offline mode' : 'Unknown'}
          />
          {courseName && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              {courseName}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView('home')}
            className={`p-2 rounded-full transition-colors ${view === 'home' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
          >
            <Home size={20} />
          </button>
          <button 
            onClick={() => setView('tracker')}
            className={`p-2 rounded-full transition-colors ${view === 'tracker' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
          >
            <Pencil size={20} />
          </button>
          <button
            onClick={() => setView('history')}
            className={`p-2 rounded-full transition-colors ${view === 'history' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
          >
            <BarChart3 size={20} />
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`p-2 rounded-full transition-colors ${view === 'settings' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500 hover:bg-stone-100'}`}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Sync Error Banner */}
      {syncStatus === 'error' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">Database not connected — data saved locally only. Check Supabase credentials in Settings.</span>
          <button onClick={() => setSyncStatus(null)} className="text-red-500 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      <main className="max-w-md mx-auto p-4 pb-20">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-3xl font-black text-stone-800 tracking-tight">Golf Dashboard</h2>
                <p className="text-stone-400 font-medium">Welcome back to the tee.</p>
              </div>

              {/* Dashboard Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Rounds Played</p>
                  <p className="text-3xl font-black text-emerald-600">{rounds.length}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Score</p>
                  <p className="text-3xl font-black text-emerald-600">
                    {rounds.length > 0 
                      ? Math.round(rounds.reduce((acc, r) => acc + r.totalScore, 0) / rounds.length) 
                      : '--'}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Best Round</p>
                  <p className="text-3xl font-black text-emerald-600">
                    {rounds.length > 0 
                      ? Math.min(...rounds.map(r => r.totalScore)) 
                      : '--'}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Putts/Hole</p>
                  <p className="text-3xl font-black text-emerald-600">
                    {rounds.length > 0
                      ? (rounds.reduce((acc, r) => {
                          const holePutts = (Object.values(r.holeStats) as HoleStats[]).reduce((sum, h) => sum + h.putts, 0);
                          return acc + holePutts;
                        }, 0) / (rounds.length * 18)).toFixed(1)
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Additional Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm text-center">
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Par 3</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {(() => {
                      if (rounds.length === 0) return '--';
                      const par3Holes = rounds.flatMap(r => (Object.values(r.holeStats) as HoleStats[]).filter(h => h.par === 3));
                      return par3Holes.length > 0 ? (par3Holes.reduce((sum, h) => sum + h.score, 0) / par3Holes.length).toFixed(1) : '--';
                    })()}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm text-center">
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Par 4</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {(() => {
                      if (rounds.length === 0) return '--';
                      const par4Holes = rounds.flatMap(r => (Object.values(r.holeStats) as HoleStats[]).filter(h => h.par === 4));
                      return par4Holes.length > 0 ? (par4Holes.reduce((sum, h) => sum + h.score, 0) / par4Holes.length).toFixed(1) : '--';
                    })()}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm text-center">
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Par 5</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {(() => {
                      if (rounds.length === 0) return '--';
                      const par5Holes = rounds.flatMap(r => (Object.values(r.holeStats) as HoleStats[]).filter(h => h.par === 5));
                      return par5Holes.length > 0 ? (par5Holes.reduce((sum, h) => sum + h.score, 0) / par5Holes.length).toFixed(1) : '--';
                    })()}
                  </p>
                </div>
              </div>

              {/* Current Round Display */}
              {isRoundActive && (
                <button
                  onClick={() => setView('tracker')}
                  className="w-full text-left bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2 hover:bg-emerald-100 transition-colors"
                >
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Current Round</p>
                  <p className="text-lg font-bold text-stone-800">{courseName}</p>
                  <p className="text-sm text-stone-600">Hole {currentHole} of 18</p>
                </button>
              )}

              {/* Start Round Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                  {isRoundActive ? 'Continue Current Round' : 'Start New Round'}
                </h3>
                
                {courses.length === 0 ? (
                  <div className="bg-white p-8 rounded-3xl text-center border border-dashed border-stone-200 space-y-4">
                    <p className="text-stone-400 text-sm">No saved courses found. Go to Settings to add one!</p>
                    <button 
                      onClick={() => setView('settings')}
                      className="px-6 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-xl text-sm"
                    >
                      Go to Settings
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {courses.map(course => (
                      <div key={course.id}>
                        <button
                          onClick={() => {
                            if (course.teeBoxes && course.teeBoxes.length > 1) {
                              setTeeBoxSelectionCourse(teeBoxSelectionCourse?.id === course.id ? null : course);
                            } else {
                              applyCourse(course, course.teeBoxes?.[0]);
                            }
                          }}
                          disabled={isRoundActive}
                          className={`w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-100 shadow-sm transition-colors text-left ${
                            isRoundActive
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:border-emerald-200'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-stone-800">{course.name}</p>
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">
                              18 Holes • Par {course.holes.reduce((acc, h) => acc + h.par, 0)}
                              {course.teeBoxes && course.teeBoxes.length > 1 && ` • ${course.teeBoxes.length} Tees`}
                            </p>
                          </div>
                          <ChevronRight size={20} className={`text-stone-300 transition-transform ${teeBoxSelectionCourse?.id === course.id ? 'rotate-90' : ''}`} />
                        </button>
                        {/* Tee Box Selection */}
                        {teeBoxSelectionCourse?.id === course.id && course.teeBoxes && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="ml-4 mt-1 space-y-1"
                          >
                            {course.teeBoxes.map((tee, idx) => {
                              const totalYds = tee.holes.reduce((sum, h) => sum + h.distance, 0);
                              const teeColors: Record<string, string> = {
                                black: 'bg-stone-800 text-white',
                                blue: 'bg-blue-500 text-white',
                                white: 'bg-white text-stone-700 border border-stone-200',
                                red: 'bg-red-500 text-white',
                                gold: 'bg-amber-400 text-stone-800',
                                green: 'bg-green-500 text-white',
                              };
                              const colorClass = teeColors[tee.color.toLowerCase()] || 'bg-stone-200 text-stone-700';
                              return (
                                <button
                                  key={idx}
                                  onClick={() => applyCourse(course, tee)}
                                  className="w-full flex items-center gap-3 p-3 bg-stone-50 rounded-xl hover:bg-emerald-50 transition-colors text-left"
                                >
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${colorClass}`}>
                                    {tee.name.charAt(0)}
                                  </span>
                                  <div className="flex-1">
                                    <p className="font-bold text-stone-700 text-sm">{tee.name} Tees</p>
                                    <p className="text-[10px] text-stone-400 font-bold">{totalYds > 0 ? `${totalYds} yards` : 'Par only'}</p>
                                  </div>
                                  <ChevronRight size={16} className="text-stone-300" />
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'tracker' && (
            <motion.div
              key="tracker"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {/* Hole Header - Par & Distance at top */}
              <div className="text-center pb-1">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl font-black text-stone-800">#{currentHole}</span>
                  <div className="text-right">
                    <p className="text-xs font-bold text-stone-500 uppercase">Par {currentHoleData.par}</p>
                    <p className="text-xs font-bold text-stone-400">{Math.round(unit === 'yards' ? getCurrentHoleDistance() * 1.09361 : getCurrentHoleDistance())} {unit.toUpperCase()}</p>
                  </div>
                </div>
              </div>

              {/* Scorecard */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 divide-y divide-stone-50">
                {/* Total Strokes Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Total Strokes</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => updateScore(-1)} className="w-9 h-9 bg-stone-50 rounded-lg flex items-center justify-center text-stone-500 active:scale-90 transition-transform border border-stone-100">
                      <Minus size={16} />
                    </button>
                    <div className="w-8 text-center">
                      <p className="text-xl font-black text-stone-800">{currentHoleData.score}</p>
                    </div>
                    <button onClick={() => updateScore(1)} className="w-9 h-9 bg-stone-50 rounded-lg flex items-center justify-center text-stone-500 active:scale-90 transition-transform border border-stone-100">
                      <Plus size={16} />
                    </button>
                    <p className={`text-[9px] font-bold uppercase w-14 text-right ${scoreIndicator.color}`}>{scoreIndicator.label}</p>
                  </div>
                </div>

                {/* Putts Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Putts</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => updatePutts(-1)} className="w-9 h-9 bg-stone-50 rounded-lg flex items-center justify-center text-stone-500 active:scale-90 transition-transform border border-stone-100">
                      <Minus size={16} />
                    </button>
                    <div className="w-8 text-center">
                      <p className="text-xl font-black text-stone-800">{currentHoleData.putts}</p>
                    </div>
                    <button onClick={() => updatePutts(1)} className="w-9 h-9 bg-stone-50 rounded-lg flex items-center justify-center text-stone-500 active:scale-90 transition-transform border border-stone-100">
                      <Plus size={16} />
                    </button>
                    <div className="w-14" />
                  </div>
                </div>

                {/* Club Selection Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Tee Club</span>
                  <div className="relative">
                    <select
                      value={selectedClubId}
                      onChange={(e) => setSelectedClubId(e.target.value)}
                      className="bg-stone-50 border border-stone-100 rounded-lg px-3 py-1.5 font-bold text-stone-600 appearance-none pr-7 outline-none text-sm"
                    >
                      <option disabled value="">Select</option>
                      {bag.map(club => (
                        <option key={club.id} value={club.id}>{club.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </div>

                {/* Approach Club Row - Par 4 & 5 only */}
                {currentHoleData.par > 3 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-bold text-stone-700 text-sm">Approach Club</span>
                    <div className="relative">
                      <select
                        value={selectedApproachClubId}
                        onChange={(e) => setSelectedApproachClubId(e.target.value)}
                        className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 font-bold text-blue-600 appearance-none pr-7 outline-none text-sm"
                      >
                        <option disabled value="">Select</option>
                        {bag.map(club => (
                          <option key={club.id} value={club.id}>{club.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                        <ChevronRight size={14} className="rotate-90" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Fairway Row - Hidden on Par 3 - Check/X style with unselected state */}
                {currentHoleData.par > 3 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-bold text-stone-700 text-sm">Fairway</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleStat('fairway' as any)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.fairway === true
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : currentHoleData.fairway === false
                            ? 'bg-white border-stone-200 text-stone-300'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <Check size={20} strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => toggleStat('fairway' as any)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.fairway === false
                            ? 'bg-stone-400 border-stone-400 text-white'
                            : currentHoleData.fairway === true
                            ? 'bg-white border-stone-200 text-stone-300'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <X size={20} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                )}

                {/* GIR Row - Check/X style with unselected state */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">GIR</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStat('gir' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.gir === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : currentHoleData.gir === false
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => toggleStat('gir' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.gir === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : currentHoleData.gir === true
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>

                {/* Sand Save Row - Check/X style with unselected state */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Sand Save</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStat('sandSave' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.sandSave === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : currentHoleData.sandSave === false
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => toggleStat('sandSave' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.sandSave === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : currentHoleData.sandSave === true
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>

                {/* Up & Down Row - Check/X style with unselected state */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Up & Down</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStat('upAndDown' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.upAndDown === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : currentHoleData.upAndDown === false
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => toggleStat('upAndDown' as any)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.upAndDown === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : currentHoleData.upAndDown === true
                          ? 'bg-white border-stone-200 text-stone-300'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Accuracy Buttons - Compact */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 space-y-3">
                {/* Tee Shot Accuracy */}
                {currentHoleData.par > 3 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Tee Accuracy</p>
                    <div className="flex gap-2">
                      {(['left', 'center', 'right'] as const).map(dir => (
                        <button
                          key={dir}
                          onClick={() => setTeeAccuracy(dir)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                            currentHoleData.teeAccuracy === dir
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                              : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                          }`}
                        >
                          {dir === 'left' && <ChevronLeft size={20} />}
                          {dir === 'center' && <div className="relative flex items-center justify-center"><div className="w-4 h-4 border-2 border-current rounded-full" /><div className="absolute w-1.5 h-1.5 bg-current rounded-full" /></div>}
                          {dir === 'right' && <ChevronRight size={20} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approach Accuracy */}
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Approach</p>
                  <div className="flex gap-2">
                    {(['left', 'long', 'center', 'short', 'right'] as const).map(dir => (
                      <button
                        key={dir}
                        onClick={() => setApproachAccuracy(dir)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.approachAccuracy === dir
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                        }`}
                      >
                        {dir === 'left' && <ChevronLeft size={18} />}
                        {dir === 'long' && <div className="rotate-90"><ChevronLeft size={18} /></div>}
                        {dir === 'center' && <div className="relative flex items-center justify-center"><div className="w-4 h-4 border-2 border-current rounded-full" /><div className="absolute w-1.5 h-1.5 bg-current rounded-full" /></div>}
                        {dir === 'short' && <div className="-rotate-90"><ChevronLeft size={18} /></div>}
                        {dir === 'right' && <ChevronRight size={18} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drive Tracking - Compact */}
              <div className="space-y-2">
                {!isTracking ? (
                  <>
                    {lastDriveDistance !== null && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-center"
                      >
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Last Drive</p>
                        <p className="text-2xl font-black text-emerald-700">
                          {Math.round(unit === 'yards' ? lastDriveDistance * 1.09361 : lastDriveDistance)}
                          <span className="text-sm ml-1">{unit}</span>
                        </p>
                      </motion.div>
                    )}
                    {remainingDistance !== null && remainingDistance > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-blue-50 border border-blue-100 p-2 rounded-xl text-center"
                      >
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Distance to Green</p>
                        <p className="text-2xl font-black text-blue-700">
                          {Math.round(unit === 'yards' ? remainingDistance * 1.09361 : remainingDistance)}
                          <span className="text-sm ml-1">{unit}</span>
                        </p>
                      </motion.div>
                    )}
                    <button
                      onClick={handleStartDrive}
                      disabled={!currentPos}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                    >
                      <Target size={18} />
                      Measure Tee Shot
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleMarkBall}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                    >
                      <CheckCircle2 size={18} />
                      Mark Ball
                    </button>
                    <button
                      onClick={handleReset}
                      className="bg-white hover:bg-stone-50 text-stone-500 font-semibold py-3 px-4 rounded-xl border border-stone-200 transition-all active:scale-95 text-sm"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Hole Navigation - Bottom */}
              <div className="flex gap-3">
                <button
                  onClick={() => changeHole(-1)}
                  className="flex-1 flex items-center justify-center gap-1 py-3 bg-rose-50 text-rose-400 font-bold rounded-xl border border-rose-100 active:scale-95 transition-all text-sm"
                >
                  <ChevronLeft size={18} />
                  #{Math.max(1, currentHole - 1)}
                </button>
                <button
                  onClick={() => changeHole(1)}
                  className="flex-1 flex items-center justify-center gap-1 py-3 bg-rose-50 text-rose-400 font-bold rounded-xl border border-rose-100 active:scale-95 transition-all text-sm"
                >
                  #{Math.min(18, currentHole + 1)}
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* End Round / Cancel Round */}
              {courseName && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (confirm('End round and post score?')) {
                        endRound();
                      }
                    }}
                    className="flex-1 py-3 bg-stone-800 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <CheckCircle2 size={18} />
                    End Round & Post Score
                  </button>
                  <button
                    onClick={cancelRound}
                    className="py-3 px-4 bg-red-100 text-red-500 font-bold rounded-xl border border-red-200 active:scale-95 transition-all flex items-center justify-center"
                    title="Cancel round"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Stats</h2>
              </div>

              {/* Stats Table */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-100">
                      <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Metric</th>
                      <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {(() => {
                      // Use all rounds for stats if available, otherwise current holeStats
                      const allHoles: HoleStats[] = rounds.length > 0
                        ? rounds.flatMap(r => Object.values(r.holeStats) as HoleStats[])
                        : Object.values(holeStats) as HoleStats[];
                      
                      const holes = allHoles;
                      const holesPlayed = holes.length;
                      const par45Holes = holes.filter(h => h.par > 3);
                      const par45Played = par45Holes.length;

                      const fairwayHits = par45Holes.filter(h => h.teeAccuracy === 'center').length;
                      const leftMisses = par45Holes.filter(h => h.teeAccuracy === 'left').length;
                      const rightMisses = par45Holes.filter(h => h.teeAccuracy === 'right').length;

                      const girHits = holes.filter(h => h.gir).length;
                      const upAndDowns = holes.filter(h => h.upAndDown).length;
                      const sandSaves = holes.filter(h => h.sandSave).length;

                      const approachLeft = holes.filter(h => h.approachAccuracy === 'left').length;
                      const approachRight = holes.filter(h => h.approachAccuracy === 'right').length;
                      const approachShort = holes.filter(h => h.approachAccuracy === 'short').length;
                      const approachLong = holes.filter(h => h.approachAccuracy === 'long').length;

                      const formatPct = (val: number, total: number) => total > 0 ? `${Math.round((val / total) * 100)}%` : '0%';

                      // Calculate approach shot stats
                      const avgApproachDistance = approachShots.length > 0
                        ? Math.round(approachShots.reduce((sum, shot) => sum + shot.distance, 0) / approachShots.length)
                        : 0;

                      const mostUsedApproachClub = approachShots.length > 0
                        ? (Object.entries(approachShots.reduce((acc: Record<string, number>, shot) => {
                            acc[shot.club] = (acc[shot.club] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || '--'
                        : '--';

                      // Calculate putting stats
                      const totalPutts = holes.reduce((sum, h) => sum + h.putts, 0);
                      const avgPuttsPerHole = holesPlayed > 0 ? (totalPutts / holesPlayed).toFixed(1) : '0';
                      const avgPuttsPerRound = rounds.length > 0
                        ? (rounds.reduce((acc, r) => acc + (Object.values(r.holeStats) as HoleStats[]).reduce((sum, h) => sum + h.putts, 0), 0) / rounds.length).toFixed(1)
                        : '0';

                      // Calculate par-specific scoring averages
                      const par3Holes = holes.filter(h => h.par === 3);
                      const par4Holes = holes.filter(h => h.par === 4);
                      const par5Holes = holes.filter(h => h.par === 5);
                      const avgPar3 = par3Holes.length > 0 ? (par3Holes.reduce((sum, h) => sum + h.score, 0) / par3Holes.length).toFixed(2) : '--';
                      const avgPar4 = par4Holes.length > 0 ? (par4Holes.reduce((sum, h) => sum + h.score, 0) / par4Holes.length).toFixed(2) : '--';
                      const avgPar5 = par5Holes.length > 0 ? (par5Holes.reduce((sum, h) => sum + h.score, 0) / par5Holes.length).toFixed(2) : '--';

                      // Calculate scrambling from non-GIR holes only
                      const nonGirHoles = holes.filter(h => !h.gir);
                      const scramblingPct = nonGirHoles.length > 0 ? formatPct(upAndDowns, nonGirHoles.length) : '0%';

                      return [
                        { label: 'Avg Putts/Hole', value: avgPuttsPerHole },
                        { label: 'Avg Putts/Round', value: avgPuttsPerRound },
                        { label: 'Avg Score: Par 3s', value: avgPar3 },
                        { label: 'Avg Score: Par 4s', value: avgPar4 },
                        { label: 'Avg Score: Par 5s', value: avgPar5 },
                        { label: 'Fairway Accuracy', value: formatPct(fairwayHits, par45Played) },
                        { label: 'Left Tendency', value: formatPct(leftMisses, par45Played) },
                        { label: 'Right Tendency', value: formatPct(rightMisses, par45Played) },
                        { label: 'GIR', value: formatPct(girHits, holesPlayed) },
                        { label: 'Scrambling', value: scramblingPct },
                        { label: 'Sand Saves', value: formatPct(sandSaves, holesPlayed) },
                        { label: 'Missed Green: Left', value: formatPct(approachLeft, holesPlayed) },
                        { label: 'Missed Green: Right', value: formatPct(approachRight, holesPlayed) },
                        { label: 'Missed Green: Short', value: formatPct(approachShort, holesPlayed) },
                        { label: 'Missed Green: Long', value: formatPct(approachLong, holesPlayed) },
                        { label: 'Avg Approach Distance', value: `${Math.round(unit === 'yards' ? avgApproachDistance * 1.09361 : avgApproachDistance)} ${unit}` },
                        { label: 'Most Used Approach Club', value: mostUsedApproachClub },
                      ].map((row, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 font-medium text-stone-600">{row.label}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">{row.value}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Round History Table */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-stone-800">Round History</h3>
                {rounds.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center border border-dashed border-stone-200">
                    <p className="text-stone-400 text-sm">No rounds posted yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-100">
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Date</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Course</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {rounds.map((round) => {
                          const diff = round.totalScore - round.totalPar;
                          return (
                            <tr
                              key={round.id}
                              onClick={() => {
                                setSelectedRound(round);
                                setIsRoundModalOpen(true);
                              }}
                              className="cursor-pointer hover:bg-emerald-50 transition-colors"
                            >
                              <td className="px-4 py-3 text-stone-500 text-xs">
                                {new Date(round.date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 font-medium text-stone-700">
                                {round.courseName}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-stone-800">{round.totalScore}</span>
                                <span className={`text-[10px] font-bold ml-1 ${diff <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  ({diff > 0 ? '+' : ''}{diff})
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Approach Shots Table */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-stone-800">Approach Shots</h3>
                {approachShots.length === 0 ? (
                  <div className="bg-white p-6 rounded-2xl text-center border border-dashed border-stone-200">
                    <p className="text-stone-400 text-sm">No approach shots recorded yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-100">
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Hole</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Club</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest text-right">Distance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {approachShots.map((shot, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3 font-bold text-stone-700">#{shot.holeNumber}</td>
                            <td className="px-4 py-3 font-medium text-stone-600">{shot.club}</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-600">
                              {Math.round(unit === 'yards' ? shot.distance * 1.09361 : shot.distance)} {unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <h3 className="text-lg font-bold">Drive History</h3>
                <span className="text-sm text-stone-400 font-medium bg-stone-100 px-3 py-1 rounded-full">
                  {history.length} Drives
                </span>
              </div>

              {history.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-stone-200 space-y-4">
                  <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto text-stone-300">
                    <History size={32} />
                  </div>
                  <p className="text-stone-400">No drives tracked yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((drive) => (
                    <div 
                      key={drive.id}
                      className="bg-white p-5 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold text-stone-800">
                            {formatDistance(drive.distance, unit)}
                          </p>
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">
                            {drive.club}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 font-medium">
                          {new Date(drive.timestamp).toLocaleDateString()} at {new Date(drive.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button 
                        onClick={() => deleteDrive(drive.id)}
                        className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <h2 className="text-2xl font-bold">Settings</h2>
              
              <div className="space-y-4">
                {/* GPS Status - Moved to Settings */}
                <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${currentPos ? (currentPos.accuracy < 15 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-red-500'} animate-pulse`} />
                    <div>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">GPS Accuracy</p>
                      <p className="font-medium">
                        {currentPos ? `${Math.round(currentPos.accuracy)}m` : 'Searching...'}
                      </p>
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle size={16} />
                      <span>Signal Lost</span>
                    </div>
                  )}
                </div>

                {/* Cloud Sync Status */}
                <div className={`flex items-center justify-between p-6 rounded-2xl shadow-sm border ${
                  syncStatus === 'connected' ? 'bg-white border-stone-100' :
                  syncStatus === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      syncStatus === 'connected' ? 'bg-emerald-500' :
                      syncStatus === 'error' ? 'bg-red-500 animate-pulse' :
                      'bg-amber-500'
                    }`} />
                    <div>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Cloud Sync</p>
                      <p className="font-medium">
                        {syncStatus === 'connected' ? 'Connected to Supabase' :
                         syncStatus === 'error' ? 'Connection Failed' :
                         syncStatus === 'offline' ? 'Offline (localStorage only)' : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  {syncStatus === 'error' && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle size={16} />
                      <span>Check Keys</span>
                    </div>
                  )}
                </div>
                {syncStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-2">
                    <p className="font-bold">⚠️ Your Supabase credentials are invalid</p>
                    <p>Data is saved locally but NOT syncing to the cloud. To fix this:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Go to your <strong>Supabase Dashboard</strong> → Settings → API</li>
                      <li>Copy your <strong>Project URL</strong> (starts with https://)</li>
                      <li>Copy your <strong>anon/public key</strong> (starts with eyJ...)</li>
                      <li>Update your <code className="bg-red-100 px-1 rounded">.env</code> file with the correct values</li>
                      <li>Restart the dev server</li>
                    </ol>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
                  <h3 className="font-semibold text-stone-900">Equipment</h3>
                  <button
                    onClick={() => setIsBagModalOpen(true)}
                    className="w-full py-4 bg-emerald-50 text-emerald-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
                  >
                    <Pencil size={18} />
                    Edit Your Bag
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
                  <h3 className="font-semibold text-stone-900">Course Management</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="text"
                          placeholder="Search Course (e.g. Pebble Beach)"
                          value={courseSearch}
                          onChange={(e) => setCourseSearch(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button 
                        onClick={importCoursePars}
                        disabled={isSearchingCourse || !courseSearch}
                        className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 disabled:bg-stone-200 transition-colors"
                      >
                        {isSearchingCourse ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => startManualCourse()}
                      className="w-full py-3 bg-white border border-stone-200 text-stone-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors text-sm"
                    >
                      <Plus size={18} />
                      Manual Entry
                    </button>
                  </div>

                  {courses.length > 0 && (
                    <div className="pt-4 space-y-2">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Saved Courses</p>
                      <div className="space-y-2">
                        {courses.map(course => (
                          <div key={course.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                            <div className="flex-1 cursor-pointer" onClick={() => applyCourse(course)}>
                              <p className="font-bold text-sm text-stone-700">{course.name}</p>
                              <p className="text-[10px] text-stone-400">18 Holes • Par {course.holes.reduce((acc, h) => acc + h.par, 0)}</p>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => startManualCourse(course)}
                                className="p-2 text-stone-400 hover:text-emerald-600 transition-colors"
                              >
                                <Pencil size={16} />
                              </button>
                              <button 
                                onClick={() => deleteCourse(course.id)}
                                className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
                  <h3 className="font-semibold text-stone-900">Measurement Units</h3>
                  <div className="flex p-1 bg-stone-100 rounded-xl">
                    <button
                      onClick={() => setUnit('yards')}
                      className={`flex-1 py-2 rounded-lg font-medium transition-all ${unit === 'yards' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}
                    >
                      Yards
                    </button>
                    <button
                      onClick={() => setUnit('meters')}
                      className={`flex-1 py-2 rounded-lg font-medium transition-all ${unit === 'meters' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}
                    >
                      Meters
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all history and stats?')) {
                      setHistory([]);
                      setRounds([]);
                      setHoleStats({ 1: { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 } });
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="w-full py-4 text-red-600 font-semibold border border-red-100 rounded-2xl hover:bg-red-50 transition-colors"
                >
                  Reset All Data
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Edit Bag Modal */}
      <AnimatePresence>
        {isBagModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBagModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <GolfBagIcon size={24} />
                  </div>
                  <h2 className="text-xl font-bold">Edit Your Bag</h2>
                </div>
                <button 
                  onClick={() => setIsBagModalOpen(false)}
                  className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Your Clubs</p>

                  {bag.length === 0 ? (
                    <p className="text-center py-8 text-stone-400 text-sm">No clubs selected. Choose clubs below.</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100">
                          <th className="pb-3 pl-2">Club</th>
                          <th className="pb-3 pr-2 text-right">Max Distance</th>
                          <th className="pb-3 pr-2 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {bag.map((club, idx) => (
                          <tr key={club.id} className="hover:bg-stone-50/50">
                            <td className="py-3 pl-2">
                              <select
                                value={club.id}
                                onChange={(e) => {
                                  const selectedClub = DEFAULT_CLUBS.find(c => c.id === e.target.value);
                                  if (selectedClub) {
                                    const newBag = [...bag];
                                    newBag[idx] = selectedClub;
                                    setBag(newBag);
                                  }
                                }}
                                className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 font-bold text-stone-700 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                              >
                                {DEFAULT_CLUBS.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 pr-2 text-right">
                              <input
                                type="number"
                                value={club.avgDistance}
                                onChange={(e) => {
                                  const newBag = [...bag];
                                  newBag[idx].avgDistance = parseInt(e.target.value) || 0;
                                  setBag(newBag);
                                }}
                                className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 font-mono font-bold text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500 text-right w-16 text-sm"
                              />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <button
                                onClick={() => setBag(bag.filter((_, i) => i !== idx))}
                                className="p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="pt-4 border-t border-stone-100 space-y-2">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Add More Clubs</p>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {DEFAULT_CLUBS.filter(c => !bag.some(b => b.id === c.id)).map(availableClub => (
                        <button
                          key={availableClub.id}
                          onClick={() => setBag([...bag, { ...availableClub }])}
                          className="p-2 text-left rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-sm font-medium text-stone-700"
                        >
                          <div className="flex items-center justify-between">
                            <span>{availableClub.name}</span>
                            <Plus size={14} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100">
                <button
                  onClick={saveBag}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Save size={20} />
                  Save Bag
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Course Modal - Multi Tee Box */}
      <AnimatePresence>
        {isCourseModalOpen && editingCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsCourseModalOpen(false); setEditingTeeBoxes([]); }}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <MapPin size={24} />
                  </div>
                  <h2 className="text-lg font-bold">Course Details</h2>
                </div>
                <button
                  onClick={() => { setIsCourseModalOpen(false); setEditingTeeBoxes([]); }}
                  className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Course Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Course Name</label>
                  <input
                    type="text"
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({...editingCourse, name: e.target.value})}
                    placeholder="e.g. Augusta National"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 font-bold text-stone-700 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>

                {/* Tee Boxes Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Tee Boxes</label>
                    {editingTeeBoxes.length < 5 && (
                      <button
                        onClick={() => setEditingTeeBoxes(prev => [...prev, {
                          name: TEE_COLOR_OPTIONS.find(c => !prev.some(t => t.color === c)) || 'white',
                          color: TEE_COLOR_OPTIONS.find(c => !prev.some(t => t.color === c)) || 'white',
                          slope: 0, courseRating: 0,
                          distances: Array(18).fill(0),
                        }])}
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100"
                      >
                        <Plus size={12} /> Add Tee
                      </button>
                    )}
                  </div>
                  {editingTeeBoxes.map((tb, tbIdx) => (
                    <div key={tbIdx} className="flex items-center gap-2 bg-stone-50 rounded-xl p-2 border border-stone-100">
                      <select
                        value={tb.color}
                        onChange={(e) => {
                          const updated = [...editingTeeBoxes];
                          updated[tbIdx] = { ...updated[tbIdx], color: e.target.value, name: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) };
                          setEditingTeeBoxes(updated);
                        }}
                        className="bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs font-bold outline-none w-20"
                      >
                        {TEE_COLOR_OPTIONS.map(c => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                      <span className={`w-5 h-5 rounded-full flex-shrink-0 ${TEE_BOX_COLORS[tb.color] || 'bg-stone-200'}`} />
                      <div className="flex items-center gap-1 flex-1">
                        <label className="text-[9px] text-stone-400 font-bold">Slope</label>
                        <input type="number" value={tb.slope || ''} placeholder="0"
                          onChange={(e) => {
                            const updated = [...editingTeeBoxes];
                            updated[tbIdx] = { ...updated[tbIdx], slope: parseFloat(e.target.value) || 0 };
                            setEditingTeeBoxes(updated);
                          }}
                          className="w-14 bg-white border border-stone-200 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-stone-600 text-center outline-none"
                        />
                        <label className="text-[9px] text-stone-400 font-bold">Rating</label>
                        <input type="number" step="0.1" value={tb.courseRating || ''} placeholder="0"
                          onChange={(e) => {
                            const updated = [...editingTeeBoxes];
                            updated[tbIdx] = { ...updated[tbIdx], courseRating: parseFloat(e.target.value) || 0 };
                            setEditingTeeBoxes(updated);
                          }}
                          className="w-14 bg-white border border-stone-200 rounded-lg px-1.5 py-1 text-xs font-mono font-bold text-stone-600 text-center outline-none"
                        />
                      </div>
                      {editingTeeBoxes.length > 1 && (
                        <button onClick={() => setEditingTeeBoxes(prev => prev.filter((_, i) => i !== tbIdx))}
                          className="p-1 text-stone-300 hover:text-red-500"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Hole Table with Multi-Tee Columns */}
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-xs border-collapse min-w-[400px]">
                    <thead>
                      <tr className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-200">
                        <th className="py-2 text-left pl-2 w-12">Hole</th>
                        <th className="py-2 text-center w-14">Par</th>
                        {editingTeeBoxes.map((tb, i) => (
                          <th key={i} className="py-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black ${TEE_BOX_COLORS[tb.color] || 'bg-stone-200'}`}>
                              {tb.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {editingCourse.holes.map((hole, holeIdx) => (
                        <tr key={holeIdx} className="hover:bg-stone-50/50">
                          <td className="py-1.5 pl-2 font-black text-stone-400">#{holeIdx + 1}</td>
                          <td className="py-1.5 text-center">
                            <select
                              value={hole.par}
                              onChange={(e) => {
                                const newHoles = [...editingCourse.holes];
                                newHoles[holeIdx] = { ...newHoles[holeIdx], par: parseInt(e.target.value) };
                                setEditingCourse({...editingCourse, holes: newHoles});
                              }}
                              className="bg-white border border-stone-200 rounded px-1 py-0.5 font-bold text-stone-700 outline-none text-xs w-12 text-center"
                            >
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                              <option value={5}>5</option>
                            </select>
                          </td>
                          {editingTeeBoxes.map((tb, tbIdx) => (
                            <td key={tbIdx} className="py-1.5 text-center">
                              <input
                                type="number"
                                value={tb.distances[holeIdx] || ''}
                                onChange={(e) => {
                                  const updated = [...editingTeeBoxes];
                                  const newDist = [...updated[tbIdx].distances];
                                  newDist[holeIdx] = parseInt(e.target.value) || 0;
                                  updated[tbIdx] = { ...updated[tbIdx], distances: newDist };
                                  setEditingTeeBoxes(updated);
                                }}
                                placeholder="0"
                                className="w-16 bg-white border border-stone-200 rounded px-1 py-0.5 font-mono font-bold text-emerald-600 text-center outline-none text-xs mx-auto"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 bg-stone-50 border-t border-stone-100">
                <button
                  onClick={saveManualCourse}
                  disabled={!editingCourse.name.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Save size={20} />
                  Save Course
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Round Detail Modal */}
      <AnimatePresence>
        {isRoundModalOpen && selectedRound && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRoundModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="sticky top-0 z-10 bg-gradient-to-b from-white to-white/50 px-6 py-4 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-stone-800">{selectedRound.courseName}</h2>
                  <p className="text-xs text-stone-400">{new Date(selectedRound.date).toLocaleDateString()} • {selectedRound.totalScore} ({selectedRound.totalScore - selectedRound.totalPar > 0 ? '+' : ''}{selectedRound.totalScore - selectedRound.totalPar})</p>
                </div>
                <button
                  onClick={() => setIsRoundModalOpen(false)}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-stone-400" />
                </button>
              </div>

              {/* Scorecard */}
              <div className="overflow-y-auto flex-1 px-6 py-4">
                <div className="bg-stone-50 rounded-2xl p-6 space-y-3">
                  {Array.from({ length: 18 }, (_, i) => {
                    const holeNum = i + 1;
                    const stat = selectedRound.holeStats[holeNum];
                    if (!stat) return null;

                    const diff = stat.score - stat.par;
                    return (
                      <div key={holeNum} className="bg-white rounded-xl p-4 border border-stone-100">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-stone-500">Hole {holeNum}</span>
                            <span className="text-lg font-bold text-stone-800">Par {stat.par}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-stone-500">Score</span>
                            <span className={`text-lg font-bold ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {stat.score} ({diff > 0 ? '+' : ''}{diff})
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-bold">
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded-lg ${stat.fairway ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                              Fairway: {stat.fairway ? '✓' : '✗'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded-lg ${stat.gir ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                              GIR: {stat.gir ? '✓' : '✗'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-1 rounded-lg ${stat.putts > 0 ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-400'}`}>
                              Putts: {stat.putts}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-bold">
                          <div className={`px-2 py-1 rounded-lg ${stat.upAndDown ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-400'}`}>
                            Scrambling: {stat.upAndDown ? '✓' : '✗'}
                          </div>
                          <div className={`px-2 py-1 rounded-lg ${stat.sandSave ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-400'}`}>
                            Sand Save: {stat.sandSave ? '✓' : '✗'}
                          </div>
                          <div className={`px-2 py-1 rounded-lg ${stat.teeAccuracy ? 'bg-cyan-100 text-cyan-700' : 'bg-stone-100 text-stone-400'}`}>
                            Tee: {stat.teeAccuracy || '—'}
                          </div>
                        </div>

                        {stat.approachAccuracy && (
                          <div className="mt-2 text-[10px] font-bold">
                            <span className="px-2 py-1 rounded-lg bg-cyan-100 text-cyan-700">
                              Approach: {stat.approachAccuracy}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer with Buttons */}
              <div className="sticky bottom-0 z-10 bg-gradient-to-t from-white to-white/50 px-6 py-4 border-t border-stone-100 flex gap-3">
                <button
                  onClick={() => deleteRound(selectedRound.id)}
                  className="flex-1 px-4 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
                <button
                  onClick={() => setIsRoundModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-stone-50/80 backdrop-blur-sm pointer-events-none">
        <div className="max-w-md mx-auto text-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">
            Built for the Fairway
          </p>
        </div>
      </footer>
    </div>
  );
}
