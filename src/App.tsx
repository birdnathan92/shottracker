/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { supabaseDb } from './supabaseClient';
import { isSupabaseAvailable } from './useSupabaseSync';
import { calculateHoleSG, calculateRoundSG, formatSG, sgColor, sgBgColor } from './strokesGainedCalc';
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
  ChevronUp,
  ChevronDown,
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
  teeAccuracy: 'left' | 'center' | 'right' | 'long' | 'short' | null;
  approachAccuracy: 'left' | 'right' | 'short' | 'long' | 'center' | null;
  par: number;
  distance?: number;
  driveDistance?: number;    // tee shot distance in yards (from GPS), for strokes gained
  teeClub?: string;          // club name used off the tee
  approachClub?: string;     // club name used for approach
  layUp?: boolean | null;    // par 5 only: did the player lay up?
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

interface FeatureCoordinate {
  lat: number;
  lng: number;
}

interface HoleFeature {
  id: string;
  type: 'tee_box' | 'green' | 'hazard' | 'custom' | 'fairway';
  name: string;
  teeBoxColor?: string;
  coordinates?: FeatureCoordinate;
}

interface HoleMapping {
  holeNumber: number;
  features: HoleFeature[];
}

interface Course {
  id: string;
  name: string;
  holes: CourseHole[];
  teeBoxes?: TeeBox[];
  holeMapping?: HoleMapping[];
}

type Unit = 'yards' | 'meters';

// --- Constants ---

// All available club options for the dropdown selector
const CLUB_OPTIONS: string[] = [
  'Driver',
  'Mini Driver',
  '3 Wood',
  '5 Wood',
  '7 Wood',
  '9 Wood',
  '2 Hybrid',
  '3 Hybrid',
  '4 Hybrid',
  '2 Iron',
  '3 Iron',
  '4 Iron',
  '5 Iron',
  '6 Iron',
  '7 Iron',
  '8 Iron',
  '9 Iron',
  'PW',
  'GW',
  'SW',
  'LW',
];

const MAX_BAG_SIZE = 13;

// Default bag (13 clubs)
const DEFAULT_CLUBS: Club[] = [
  { id: '1', name: 'Driver', avgDistance: 250 },
  { id: '2', name: '3 Wood', avgDistance: 220 },
  { id: '3', name: '5 Wood', avgDistance: 200 },
  { id: '4', name: '4 Hybrid', avgDistance: 190 },
  { id: '5', name: '5 Iron', avgDistance: 180 },
  { id: '6', name: '6 Iron', avgDistance: 170 },
  { id: '7', name: '7 Iron', avgDistance: 160 },
  { id: '8', name: '8 Iron', avgDistance: 150 },
  { id: '9', name: '9 Iron', avgDistance: 140 },
  { id: '10', name: 'PW', avgDistance: 130 },
  { id: '11', name: 'GW', avgDistance: 120 },
  { id: '12', name: 'SW', avgDistance: 100 },
  { id: '13', name: 'LW', avgDistance: 80 },
];

// --- Utils ---

// Haversine distance between two lat/lng points, returns meters
const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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

const PRESET_HAZARD_FEATURES = [
  'Water Hazard',
  'Left Fairway Bunker',
  'Right Fairway Bunker',
  'Left Greenside Bunker',
  'Right Greenside Bunker',
] as const;

const GREEN_FEATURES = ['Front of Green', 'Back of Green'] as const;

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

// Swipeable drive card component — swipe reveals delete button, must tap to confirm
const SwipeableDriveCard: React.FC<{ drive: Drive; unit: Unit; onDelete: (id: string) => void | Promise<void> }> = ({ drive, unit, onDelete }) => {
  const x = useMotionValue(0);
  const [isDeleteRevealed, setIsDeleteRevealed] = useState(false);
  const deleteOpacity = useTransform(x, [-100, -50], [1, 0]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Delete zone behind — tappable button */}
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-end rounded-2xl overflow-hidden"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(drive.id); }}
          className="h-full px-6 bg-red-500 text-white font-bold text-sm flex items-center gap-2 hover:bg-red-600 transition-colors"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </motion.div>
      {/* Swipeable card */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) {
            setIsDeleteRevealed(true);
          } else {
            setIsDeleteRevealed(false);
          }
        }}
        animate={{ x: isDeleteRevealed ? -100 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={() => { if (isDeleteRevealed) setIsDeleteRevealed(false); }}
        className="bg-white p-5 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between relative z-10"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-stone-800">{formatDistance(drive.distance, unit)}</p>
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">{drive.club}</span>
          </div>
          <p className="text-xs text-stone-400 font-medium">
            {new Date(drive.timestamp).toLocaleDateString()} at {new Date(drive.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

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
  const [approachShots, setApproachShots] = useState<ApproachShot[]>([]);

  const [selectedClubId, setSelectedClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [isBagModalOpen, setIsBagModalOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isRoundActive, setIsRoundActive] = useState(() => loadLocal('golf_is_round_active', false));
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [isRoundModalOpen, setIsRoundModalOpen] = useState(false);
  const [selectedApproachClubId, setSelectedApproachClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [hasManuallySelectedApproachClub, setHasManuallySelectedApproachClub] = useState(false);
  const [remainingDistance, setRemainingDistance] = useState<number | null>(null);
  const [approachDistanceOverride, setApproachDistanceOverride] = useState<number | null>(null);
  const [isEditingRound, setIsEditingRound] = useState(false);
  const [editingRoundStats, setEditingRoundStats] = useState<Record<number, HoleStats>>({});
  const [expandedClubs, setExpandedClubs] = useState<Set<string>>(new Set());
  const [teeBoxSelectionCourse, setTeeBoxSelectionCourse] = useState<Course | null>(null);
  const [activeSlope, setActiveSlope] = useState<number>(0);
  const [activeCourseRating, setActiveCourseRating] = useState<number>(0);

  // Score Tracking State
  const [currentHole, setCurrentHole] = useState(() => loadLocal('golf_current_hole', 1));

  // Editing tee boxes for manual course entry
  const [editingTeeBoxes, setEditingTeeBoxes] = useState<{ name: string; color: string; slope: number; courseRating: number; distances: number[] }[]>([]);

  // Mapping mode state
  const [isMappingModeOpen, setIsMappingModeOpen] = useState(false);
  const [mappingHoleIndex, setMappingHoleIndex] = useState(0);
  const [mappingData, setMappingData] = useState<HoleMapping[]>([]);
  const [mappingGpsStatus, setMappingGpsStatus] = useState('');
  const [addFeatureMenuOpen, setAddFeatureMenuOpen] = useState(false);
  const [customFeatureName, setCustomFeatureName] = useState('');
  const [manualCoordFeatureId, setManualCoordFeatureId] = useState<string | null>(null);
  const [manualDmsInput, setManualDmsInput] = useState('');

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
            holeMapping: c.holeMapping || undefined,
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

        // Load clubs reference data from Supabase
        const clubsFromSupabase = await supabaseDb.getClubs();
        console.log('[App] Loaded', clubsFromSupabase?.length || 0, 'clubs from Supabase');

        // Load user's custom bag from Supabase (bag selection + custom distances)
        const bagFromSupabase = await supabaseDb.getBag();
        if (bagFromSupabase && bagFromSupabase.length > 0) {
          setBag(bagFromSupabase);
          localStorage.setItem('golf_bag', JSON.stringify(bagFromSupabase));
          console.log('[App] Loaded custom bag from Supabase:', bagFromSupabase.length, 'clubs');
        }

        // Load drives - map flat DB fields to nested Position objects
        const drivesFromSupabase = await supabaseDb.getDrives();
        if (drivesFromSupabase && drivesFromSupabase.length > 0) {
          const mapped = drivesFromSupabase.map((d: any) => ({
            id: d.id,
            start: { lat: d.start_lat, lng: d.start_lng, accuracy: d.start_accuracy || 0, timestamp: d.timestamp },
            end: { lat: d.end_lat, lng: d.end_lng, accuracy: d.end_accuracy || 0, timestamp: d.timestamp },
            distance: d.distance,
            club: d.club,
            timestamp: d.timestamp,
          }));
          setHistory(mapped);
          localStorage.setItem('golf_drive_history', JSON.stringify(mapped));
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
  useEffect(() => {
    if (isInitialLoadComplete.current) {
      console.log('[App] Saving bag to localStorage:', bag.length, 'clubs');
      localStorage.setItem('golf_bag', JSON.stringify(bag));
    }
  }, [bag]);
  useEffect(() => { if (isInitialLoadComplete.current) localStorage.setItem('golf_courses', JSON.stringify(courses)); }, [courses]);

  // Auto-save mapping data to the course whenever it changes
  useEffect(() => {
    if (!editingCourse || mappingData.length === 0) return;
    setCourses(prev => prev.map(c =>
      c.id === editingCourse.id ? { ...c, holeMapping: mappingData } : c
    ));
  }, [mappingData]);
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
            holes: course.holes, teeBoxes: course.teeBoxes, holeMapping: course.holeMapping,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('Sync courses failed:', e); }
    };
    const t = setTimeout(sync, 1500);
    return () => clearTimeout(t);
  }, [courses]);

  useEffect(() => {
    if (!isInitialLoadComplete.current || !isSupabaseAvailable()) {
      console.log('[App] Skipping round sync:', { isInitialLoadComplete: isInitialLoadComplete.current, supabaseAvailable: isSupabaseAvailable() });
      return;
    }
    const sync = async () => {
      console.log('[App] Syncing', rounds.length, 'rounds to Supabase');
      try {
        for (const round of rounds) {
          console.log('[App] Syncing round:', round.id, round.courseName);
          await supabaseDb.saveRound({
            id: round.id, course_name: round.courseName, date: round.date,
            total_score: round.totalScore, total_par: round.totalPar,
            hole_stats_data: JSON.stringify(round.holeStats),
            created_at: '', updated_at: '',  // Let DB defaults handle timestamps
          });
        }
        console.log('[App] Round sync complete');
      } catch (e) {
        console.error('[App] Sync rounds failed:', e);
      }
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

  // --- AUTO HOLE DETECTION & TEE SHOT TRIGGER ---
  const nearTeeCount = React.useRef(0);
  const nearCurrentTeeCount = React.useRef(0);

  // Check if current hole has all required stats filled in
  const isHoleComplete = (holeNum: number): boolean => {
    const stats = holeStats[holeNum];
    if (!stats) return false;
    return (
      stats.score > 0 &&
      stats.putts >= 0 &&
      stats.fairway !== null &&
      stats.gir !== null
    );
  };

  useEffect(() => {
    if (!isRoundActive || !currentPos || !courseName) return;

    // Find the active course with mapping data
    const baseCourseName = courseName.replace(/\s*\(.*\)$/, '');
    const course = courses.find(c => c.name === baseCourseName || c.name === courseName);
    if (!course?.holeMapping) return;

    const TEE_PROXIMITY_METERS = 5;
    const LOITER_THRESHOLD = 3; // consecutive position updates near tee

    // Check proximity to current hole's tee box (for auto-measuring)
    const currentMapping = course.holeMapping[currentHole - 1];
    if (currentMapping && !isTracking) {
      let nearCurrentTee = false;
      for (const feature of currentMapping.features) {
        if (feature.type !== 'tee_box' || !feature.coordinates) continue;
        const dist = haversineDistance(
          currentPos.lat, currentPos.lng,
          feature.coordinates.lat, feature.coordinates.lng
        );
        if (dist < TEE_PROXIMITY_METERS) {
          nearCurrentTee = true;
          break;
        }
      }
      if (nearCurrentTee) {
        nearCurrentTeeCount.current++;
        if (nearCurrentTeeCount.current >= LOITER_THRESHOLD) {
          handleStartDrive();
          nearCurrentTeeCount.current = 0;
        }
      } else {
        nearCurrentTeeCount.current = 0;
      }
    }

    // Check proximity to next hole's tee box (for auto-advancing)
    // Only advance if current hole stats are complete
    let closestHole: number | null = null;
    let closestDist = Infinity;

    for (let holeIdx = 0; holeIdx < course.holeMapping.length; holeIdx++) {
      const holeNum = holeIdx + 1;
      if (holeNum <= currentHole) continue; // only look ahead

      const mapping = course.holeMapping[holeIdx];
      for (const feature of mapping.features) {
        if (feature.type !== 'tee_box' || !feature.coordinates) continue;
        const dist = haversineDistance(
          currentPos.lat, currentPos.lng,
          feature.coordinates.lat, feature.coordinates.lng
        );
        if (dist < TEE_PROXIMITY_METERS && dist < closestDist) {
          closestDist = dist;
          closestHole = holeNum;
        }
      }
    }

    if (closestHole && closestHole === currentHole + 1 && isHoleComplete(currentHole)) {
      nearTeeCount.current++;
      if (nearTeeCount.current >= LOITER_THRESHOLD) {
        changeHole(closestHole - currentHole);
        nearTeeCount.current = 0;
      }
    } else {
      nearTeeCount.current = 0;
    }
  }, [currentPos, isRoundActive, courseName, currentHole, courses, isTracking, holeStats]);

// --- ATOMS3 BLUETOOTH HARDWARE LISTENER ---
  useEffect(() => {
    const handleHardwareButton = (event: KeyboardEvent) => {
      // Listen for the 'Enter' key sent by the AtomS3
      if (event.key === 'Enter') {
        
        // Safety Check: Don't trigger if you are actively typing in a text box or select menu
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
          return;
        }

        event.preventDefault(); // Prevent screen jumping

        // Smart Toggle: Find which button is currently on the screen and click it
        const measureBtn = document.getElementById('measure-btn');
        const markBallBtn = document.getElementById('mark-ball-btn');

        if (measureBtn) {
          measureBtn.click();
        } else if (markBallBtn) {
          markBallBtn.click();
        }
      }
    };

    window.addEventListener('keydown', handleHardwareButton);
    return () => window.removeEventListener('keydown', handleHardwareButton);
  }, []);
  // ------------------------------------------
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
      // Note: getCurrentHoleDistance() returns YARDS, distance (from GPS) is in METERS
      const holeDistanceYards = courseName ? getCurrentHoleDistance() : null;
      const driveDistanceYards = distance * 1.09361; // convert meters → yards

      if (holeDistanceYards && remainingDistance && remainingDistance > 0 && driveDistanceYards < remainingDistance) {
        // This is an approach shot — remaining distance was already set in yards
        const approachClub = bag.find(c => c.id === selectedApproachClubId)?.name || 'Unknown';
        const newApproach: ApproachShot = {
          holeNumber: currentHole,
          distance: driveDistanceYards, // store in yards for consistency
          club: approachClub,
          timestamp: Date.now(),
        };
        setApproachShots([...approachShots, newApproach]);
        setRemainingDistance(Math.max(0, remainingDistance - driveDistanceYards));
      } else if (holeDistanceYards) {
        // This is a tee shot, calculate remaining distance in YARDS
        setRemainingDistance(Math.max(0, holeDistanceYards - driveDistanceYards));
        // Store drive distance in holeStats for strokes gained calculation
        setHoleStats(prev => ({
          ...prev,
          [currentHole]: { ...prev[currentHole], driveDistance: driveDistanceYards }
        }));
      }

      setStartPos(null);
      setIsTracking(false);
    }
  };

  const handleReset = () => {
    setStartPos(null);
    setIsTracking(false);
  };

  // Returns the hole distance in YARDS (course data is stored in yards)
  const getCurrentHoleDistance = (): number => {
    // First check if distance is stored in holeStats (set by applyCourse)
    const statsDistance = holeStats[currentHole]?.distance;
    if (statsDistance && statsDistance > 0) return statsDistance;

    // Fallback: look up from courses array
    if (!courseName) return 0;
    // courseName may include tee box suffix like " (Blue)", strip it for matching
    const baseCourseName = courseName.replace(/\s*\(.*\)$/, '');
    const course = courses.find(c => c.name === baseCourseName || c.name === courseName);
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

  // Grouped drive data for history view — group by club, sort by avg distance desc
  const groupedDrives = useMemo(() => {
    const groups: Record<string, Drive[]> = {};
    for (const drive of history) {
      if (!groups[drive.club]) groups[drive.club] = [];
      groups[drive.club].push(drive);
    }
    return Object.entries(groups)
      .map(([club, drives]) => ({
        club,
        count: drives.length,
        avgDistance: drives.reduce((sum, d) => sum + d.distance, 0) / drives.length,
        drives: drives.sort((a, b) => b.timestamp - a.timestamp),
      }))
      .sort((a, b) => b.avgDistance - a.avgDistance);
  }, [history]);

  const toggleClubExpand = (club: string) => {
    setExpandedClubs(prev => {
      const next = new Set(prev);
      if (next.has(club)) next.delete(club);
      else next.add(club);
      return next;
    });
  };

  // GIR% by approach club — computed from all rounds + current round
  const girByClub = useMemo(() => {
    const clubData: Record<string, { attempts: number; hits: number }> = {};

    // From completed rounds
    for (const round of rounds) {
      if (!round.holeStats) continue;
      for (const [, rawStats] of Object.entries(round.holeStats)) {
        const stats = rawStats as HoleStats;
        if (stats.approachClub && stats.gir !== null && stats.gir !== undefined) {
          if (!clubData[stats.approachClub]) clubData[stats.approachClub] = { attempts: 0, hits: 0 };
          clubData[stats.approachClub].attempts++;
          if (stats.gir) clubData[stats.approachClub].hits++;
        }
      }
    }

    // From current round in progress
    if (isRoundActive) {
      for (const [, stats] of Object.entries(holeStats) as [string, HoleStats][]) {
        if (stats.approachClub && stats.gir !== null && stats.gir !== undefined) {
          if (!clubData[stats.approachClub]) clubData[stats.approachClub] = { attempts: 0, hits: 0 };
          clubData[stats.approachClub].attempts++;
          if (stats.gir) clubData[stats.approachClub].hits++;
        }
      }
    }

    return Object.entries(clubData)
      .map(([club, data]) => ({
        club,
        attempts: data.attempts,
        hits: data.hits,
        girPct: data.attempts > 0 ? Math.round((data.hits / data.attempts) * 100) : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts);
  }, [rounds, holeStats, isRoundActive]);

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

  const setTeeAccuracy = (accuracy: 'left' | 'center' | 'right' | 'long' | 'short') => {
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

  const setStatDirectly = (
    stat: 'fairway' | 'gir' | 'upAndDown' | 'sandSave' | 'layUp',
    targetValue: boolean
  ) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      const newValue = current[stat] === targetValue ? null : targetValue;

      if (stat === 'sandSave' && newValue === true) {
        return { ...prev, [currentHole]: { ...current, [stat]: newValue, upAndDown: true } };
      }
      if (stat === 'fairway' && (newValue === true || newValue === null)) {
        return { ...prev, [currentHole]: { ...current, [stat]: newValue, teeAccuracy: null } };
      }
      if (stat === 'gir' && (newValue === true || newValue === null)) {
        return { ...prev, [currentHole]: { ...current, [stat]: newValue, approachAccuracy: null } };
      }
      return { ...prev, [currentHole]: { ...current, [stat]: newValue } };
    });
  };

  const changeHole = (delta: number) => {
    const nextHole = Math.max(1, Math.min(18, currentHole + delta));

    // Save current club selections to the current hole before navigating
    const currentTeeClubName = bag.find(c => c.id === selectedClubId)?.name;
    const currentApproachClubName = bag.find(c => c.id === selectedApproachClubId)?.name;

    setHoleStats(prev => {
      const updated = {
        ...prev,
        [currentHole]: {
          ...prev[currentHole],
          teeClub: currentTeeClubName,
          approachClub: currentApproachClubName,
        },
      };
      if (!updated[nextHole]) {
        updated[nextHole] = { score: 4, putts: 2, fairway: null, gir: null, upAndDown: null, sandSave: null, teeAccuracy: null, approachAccuracy: null, par: 4 };
      }
      return updated;
    });

    setCurrentHole(nextHole);
    setRemainingDistance(null);
    setLastDriveDistance(null);
    setApproachDistanceOverride(null);
    setHasManuallySelectedApproachClub(false);

    // Restore club selections if the next hole has saved clubs, otherwise default
    const nextHoleData = holeStats[nextHole];
    if (nextHoleData?.teeClub) {
      const matchingClub = bag.find(c => c.name === nextHoleData.teeClub);
      setSelectedClubId(matchingClub?.id || bag[0]?.id || DEFAULT_CLUBS[0].id);
    } else {
      setSelectedClubId(bag[0]?.id || DEFAULT_CLUBS[0].id);
    }

    if (nextHoleData?.approachClub) {
      const matchingClub = bag.find(c => c.name === nextHoleData.approachClub);
      setSelectedApproachClubId(matchingClub?.id || bag[0]?.id || DEFAULT_CLUBS[0].id);
    } else {
      setSelectedApproachClubId(bag[0]?.id || DEFAULT_CLUBS[0].id);
    }
  };

  // Auto-suggest approach shot club based on distance to green (in yards)
  // Uses 4-yard overage tolerance: allows approaching to up to 4 yards above club distance
  const suggestApproachClub = (distanceYards: number): string | null => {
    if (bag.length === 0) return null;

    // remainingDistance is now in yards, same unit as club avgDistance
    // Find club within 4-yard tolerance: club.avgDistance >= distanceYards - 4
    let bestClub: typeof bag[0] | null = null;
    let smallestDifference = Infinity;

    for (const club of bag) {
      if (club.avgDistance >= distanceYards - 4) {
        const difference = Math.abs(distanceYards - club.avgDistance);
        if (difference < smallestDifference) {
          smallestDifference = difference;
          bestClub = club;
        }
      }
    }

    // If no club found within tolerance, pick the shortest club (extreme fallback)
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
        fairway: null,
        gir: null,
        upAndDown: null,
        sandSave: null,
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

    // Merge mapping data if any
    if (mappingData.length > 0) {
      courseToSave = { ...courseToSave, holeMapping: mappingData };
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
    setMappingData([]);
    setIsMappingModeOpen(false);
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
    setIsMappingModeOpen(false);
    setMappingData([]);
    setIsCourseModalOpen(true);
  };

  // --- Mapping Mode Functions ---

  const initializeMappingData = (course: Course, teeBoxes: typeof editingTeeBoxes): HoleMapping[] => {
    return course.holes.map((_, holeIdx) => {
      const existingMapping = course.holeMapping?.[holeIdx];

      // Tee box features sorted by distance descending (furthest first)
      const teeFeatures: HoleFeature[] = [...teeBoxes]
        .sort((a, b) => (b.distances[holeIdx] || 0) - (a.distances[holeIdx] || 0))
        .map(tb => ({
          id: `tee_${tb.color}_${holeIdx}`,
          type: 'tee_box' as const,
          name: `${tb.name} Tee`,
          teeBoxColor: tb.color,
          coordinates: existingMapping?.features.find(
            f => f.type === 'tee_box' && f.teeBoxColor === tb.color
          )?.coordinates,
        }));

      // Green features
      const greenFeatures: HoleFeature[] = GREEN_FEATURES.map(name => ({
        id: `green_${name.toLowerCase().replace(/\s/g, '_')}_${holeIdx}`,
        type: 'green' as const,
        name,
        coordinates: existingMapping?.features.find(
          f => f.type === 'green' && f.name === name
        )?.coordinates,
      }));

      // Preserve existing fairway pivot points (in order)
      const fairwayFeatures = existingMapping?.features.filter(f => f.type === 'fairway') || [];

      // Preserve existing hazard/custom features
      const customFeatures = existingMapping?.features.filter(
        f => f.type === 'hazard' || f.type === 'custom'
      ) || [];

      return {
        holeNumber: holeIdx + 1,
        features: [...teeFeatures, ...fairwayFeatures, ...greenFeatures, ...customFeatures],
      };
    });
  };

  const openMappingMode = () => {
    if (!editingCourse) return;
    const data = initializeMappingData(editingCourse, editingTeeBoxes);
    setMappingData(data);
    setMappingHoleIndex(0);
    setAddFeatureMenuOpen(false);
    setCustomFeatureName('');
    setManualCoordFeatureId(null);
    setManualDmsInput('');
    setIsMappingModeOpen(true);
  };

  const captureCoordinates = (holeIdx: number, featureId: string) => {
    if (!currentPos) {
      setMappingGpsStatus('Waiting for GPS signal...');
      setTimeout(() => setMappingGpsStatus(''), 3000);
      return;
    }
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      hole.features = hole.features.map(f =>
        f.id === featureId
          ? { ...f, coordinates: { lat: currentPos.lat, lng: currentPos.lng } }
          : f
      );
      updated[holeIdx] = hole;
      return updated;
    });
    setMappingGpsStatus('Coordinates captured!');
    setTimeout(() => setMappingGpsStatus(''), 2000);
  };

  const parseDmsCoordinates = (input: string): { lat: number; lng: number } | null => {
    // Parse DMS format like: 49°13'55.16"N 123°12'27.76"W
    const dmsRegex = /(\d+)[°]\s*(\d+)[''′]\s*([\d.]+)[""″]?\s*([NSns])\s+(\d+)[°]\s*(\d+)[''′]\s*([\d.]+)[""″]?\s*([EWew])/;
    const match = input.trim().match(dmsRegex);
    if (match) {
      const latDeg = parseFloat(match[1]) + parseFloat(match[2]) / 60 + parseFloat(match[3]) / 3600;
      const lngDeg = parseFloat(match[5]) + parseFloat(match[6]) / 60 + parseFloat(match[7]) / 3600;
      const lat = match[4].toUpperCase() === 'S' ? -latDeg : latDeg;
      const lng = match[8].toUpperCase() === 'W' ? -lngDeg : lngDeg;
      return { lat, lng };
    }
    return null;
  };

  const applyManualCoordinates = (holeIdx: number, featureId: string) => {
    const parsed = parseDmsCoordinates(manualDmsInput);
    if (!parsed) {
      setMappingGpsStatus('Invalid format. Use: 49°13\'55.16"N 123°12\'27.76"W');
      setTimeout(() => setMappingGpsStatus(''), 4000);
      return;
    }
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      hole.features = hole.features.map(f =>
        f.id === featureId ? { ...f, coordinates: parsed } : f
      );
      updated[holeIdx] = hole;
      return updated;
    });
    setManualCoordFeatureId(null);
    setManualDmsInput('');
  };

  const addMappingFeature = (holeIdx: number, name: string, type: 'hazard' | 'custom') => {
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      hole.features = [...hole.features, {
        id: `${type}_${name.toLowerCase().replace(/\s/g, '_')}_${holeIdx}_${Date.now()}`,
        type,
        name,
      }];
      updated[holeIdx] = hole;
      return updated;
    });
    setAddFeatureMenuOpen(false);
    setCustomFeatureName('');
  };

  const addFairwayPoint = (holeIdx: number) => {
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      const existingFairways = hole.features.filter(f => f.type === 'fairway');
      const newNum = existingFairways.length + 1;
      const newFeature: HoleFeature = {
        id: `fairway_${holeIdx}_${Date.now()}`,
        type: 'fairway',
        name: `Fairway ${newNum}`,
      };
      // Insert after last tee box or last fairway point, before green
      const lastTeeOrFairwayIdx = hole.features.reduce(
        (acc, f, i) => (f.type === 'tee_box' || f.type === 'fairway') ? i : acc, -1
      );
      const insertIdx = lastTeeOrFairwayIdx + 1;
      hole.features = [
        ...hole.features.slice(0, insertIdx),
        newFeature,
        ...hole.features.slice(insertIdx),
      ];
      updated[holeIdx] = hole;
      return updated;
    });
  };

  const removeFairwayPoint = (holeIdx: number, featureId: string) => {
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      hole.features = hole.features.filter(f => f.id !== featureId);
      // Renumber remaining fairway points
      let fairwayNum = 1;
      hole.features = hole.features.map(f =>
        f.type === 'fairway' ? { ...f, name: `Fairway ${fairwayNum++}` } : f
      );
      updated[holeIdx] = hole;
      return updated;
    });
  };

  const removeMappingFeature = (holeIdx: number, featureId: string) => {
    setMappingData(prev => {
      const updated = [...prev];
      const hole = { ...updated[holeIdx] };
      hole.features = hole.features.filter(f => f.id !== featureId);
      updated[holeIdx] = hole;
      return updated;
    });
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
        console.log('[App] Saving bag to Supabase:', bag.length, 'clubs');

        // Save the full bag (user's selected clubs + custom distances)
        await supabaseDb.saveBag(bag);
        console.log('[App] Bag saved to Supabase');

        setError(null); // Clear any previous errors
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[App] Failed to save bag to Supabase:', errorMsg);
        setError(`Bag sync failed: ${errorMsg}`);
      }
    } else {
      console.warn('[App] Supabase not available - bag saved to localStorage only');
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
                    <p className="text-xs font-bold text-stone-400">{Math.round(unit === 'yards' ? getCurrentHoleDistance() : getCurrentHoleDistance() * 0.9144)} {unit.toUpperCase()}</p>
                  </div>
                  {/* Score relative to par badge */}
                  {(() => {
                    let totalScore = 0;
                    let totalPar = 0;
                    let holesScored = 0;
                    for (let i = 1; i <= currentHole; i++) {
                      const stat = holeStats[i];
                      if (stat && stat.score > 0) {
                        totalScore += stat.score;
                        totalPar += stat.par;
                        holesScored++;
                      }
                    }
                    if (holesScored === 0) return null;
                    const diff = totalScore - totalPar;
                    const label = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
                    const bgColor = diff < 0 ? 'bg-emerald-50' : diff > 0 ? 'bg-red-50' : 'bg-stone-100';
                    const textColor = diff < 0 ? 'text-emerald-700' : diff > 0 ? 'text-red-600' : 'text-stone-600';
                    return (
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${bgColor} ${textColor}`}>
                        {label} thru {holesScored}
                      </span>
                    );
                  })()}
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
                        onChange={(e) => {
                          setSelectedApproachClubId(e.target.value);
                          setHasManuallySelectedApproachClub(true);
                          setHoleStats(prev => ({
                            ...prev,
                            [currentHole]: {
                              ...prev[currentHole],
                              approachClub: e.target.value
                            }
                          }));
                        }}
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

                {/* Fairway Row - Hidden on Par 3 */}
                {currentHoleData.par > 3 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-bold text-stone-700 text-sm">Fairway</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStatDirectly('fairway', true)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.fairway === true
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <Check size={20} strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => setStatDirectly('fairway', false)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.fairway === false
                            ? 'bg-stone-400 border-stone-400 text-white'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <X size={20} strokeWidth={3} />
                      </button>
                      <AnimatePresence>
                        {currentHoleData.fairway === false && (
                          <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="flex items-center gap-1 overflow-hidden"
                          >
                            {(['left', 'long', 'short', 'right'] as const).map(dir => (
                              <button
                                key={dir}
                                onClick={() => setTeeAccuracy(dir)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border ${
                                  currentHoleData.teeAccuracy === dir
                                    ? 'bg-amber-500 border-amber-500 text-white'
                                    : 'bg-white border-stone-200 text-stone-400 hover:border-amber-300'
                                }`}
                                title={dir.charAt(0).toUpperCase() + dir.slice(1)}
                              >
                                {dir === 'left' && <ChevronLeft size={16} />}
                                {dir === 'long' && <ChevronUp size={16} />}
                                {dir === 'short' && <ChevronDown size={16} />}
                                {dir === 'right' && <ChevronRight size={16} />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* GIR Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">GIR</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStatDirectly('gir', true)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.gir === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => setStatDirectly('gir', false)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.gir === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                    <AnimatePresence>
                      {currentHoleData.gir === false && (
                        <motion.div
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="flex items-center gap-1 overflow-hidden"
                        >
                          {(['left', 'long', 'short', 'right'] as const).map(dir => (
                            <button
                              key={dir}
                              onClick={() => setApproachAccuracy(dir)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border ${
                                currentHoleData.approachAccuracy === dir
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'bg-white border-stone-200 text-stone-400 hover:border-amber-300'
                              }`}
                              title={dir.charAt(0).toUpperCase() + dir.slice(1)}
                            >
                              {dir === 'left' && <ChevronLeft size={16} />}
                              {dir === 'long' && <ChevronUp size={16} />}
                              {dir === 'short' && <ChevronDown size={16} />}
                              {dir === 'right' && <ChevronRight size={16} />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Lay Up Row - Par 5 only */}
                {currentHoleData.par === 5 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-bold text-stone-700 text-sm">Lay Up</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStatDirectly('layUp', true)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.layUp === true
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <Check size={20} strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => setStatDirectly('layUp', false)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.layUp === false
                            ? 'bg-stone-400 border-stone-400 text-white'
                            : 'bg-stone-100 border-stone-300 text-stone-400'
                        }`}
                      >
                        <X size={20} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Sand Save Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Sand Save</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStatDirectly('sandSave', true)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.sandSave === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => setStatDirectly('sandSave', false)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.sandSave === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>

                {/* Up & Down Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-bold text-stone-700 text-sm">Up & Down</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStatDirectly('upAndDown', true)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.upAndDown === true
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <Check size={20} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => setStatDirectly('upAndDown', false)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.upAndDown === false
                          ? 'bg-stone-400 border-stone-400 text-white'
                          : 'bg-stone-100 border-stone-300 text-stone-400'
                      }`}
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Accuracy arrows are now integrated inline in Fairway/GIR rows above */}

              {/* Drive Tracking - Compact */}
              <div className="space-y-2">
                {!isTracking ? (
                  <>
                    {lastDriveDistance !== null && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex gap-2"
                      >
                        {/* Last Drive */}
                        <div className={`bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-center ${remainingDistance !== null && remainingDistance > 0 ? 'flex-1' : 'w-full'}`}>
                          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Last Shot</p>
                          <p className="text-2xl font-black text-emerald-700">
                            {Math.round(unit === 'yards' ? lastDriveDistance * 1.09361 : lastDriveDistance)}
                            <span className="text-sm ml-1">{unit}</span>
                          </p>
                        </div>
                        {/* Approach / Remaining Distance - same row */}
                        {remainingDistance !== null && remainingDistance > 0 && (
                          <div className="flex-1 bg-blue-50 border border-blue-100 p-2 rounded-xl text-center">
                            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">To Green</p>
                            <p className="text-2xl font-black text-blue-700">
                              {Math.round(unit === 'yards' ? remainingDistance : remainingDistance * 0.9144)}
                              <span className="text-sm ml-1">{unit}</span>
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                    {/* Approach Distance Override Slider */}
                    {remainingDistance !== null && remainingDistance > 0 && !isTracking && (
                      <div className="bg-white border border-stone-100 rounded-xl p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Approach Distance</p>
                          <p className="text-sm font-bold text-blue-600">
                            {Math.round(unit === 'yards' ? remainingDistance : remainingDistance * 0.9144)} {unit}
                          </p>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={350}
                          value={Math.round(remainingDistance)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setApproachDistanceOverride(val);
                            setRemainingDistance(val);

                            // Calculate drive distance from slider and update SG
                            const holeDistanceYards = getCurrentHoleDistance();
                            if (holeDistanceYards > 0) {
                              const calculatedDriveYards = Math.max(0, holeDistanceYards - val);
                              // Update holeStats → triggers SG recalc via the live SG badge
                              setHoleStats(prev => ({
                                ...prev,
                                [currentHole]: {
                                  ...prev[currentHole],
                                  driveDistance: calculatedDriveYards
                                }
                              }));
                              // Always update Last Shot bubble: Total Hole Distance - Approach = Last Shot
                              if (calculatedDriveYards > 0) {
                                setLastDriveDistance(calculatedDriveYards / 1.09361); // yards → meters
                              }

                              // Auto-suggest approach club based on new remaining distance
                              // Only if user hasn't manually selected a club yet
                              if (!hasManuallySelectedApproachClub) {
                                const suggestedClubId = suggestApproachClub(val);
                                if (suggestedClubId) {
                                  setSelectedApproachClubId(suggestedClubId);
                                  setHoleStats(prev => ({
                                    ...prev,
                                    [currentHole]: {
                                      ...prev[currentHole],
                                      approachClub: suggestedClubId
                                    }
                                  }));
                                }
                              }
                            }
                          }}
                          className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-[8px] text-stone-300 font-bold">
                          <span>0</span>
                          <span>350 yds</span>
                        </div>
                      </div>
                    )}
                    {/* Manual approach distance entry when no GPS measurement */}
                    {lastDriveDistance === null && remainingDistance === null && getCurrentHoleDistance() > 0 && (
                      <button
                        onClick={() => setRemainingDistance(getCurrentHoleDistance())}
                        className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-2.5 rounded-xl border border-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                      >
                        <Minus size={16} />
                        Set Approach Distance
                      </button>
                    )}
                    <button
                    id="measure-btn"
                      onClick={handleStartDrive}
            
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                    >
                      <Target size={18} />
                      Measure Tee Shot
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    {/* Live distance while tracking */}
                    {liveDistance > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-2"
                      >
                        <div className={`bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-center ${getCurrentHoleDistance() > 0 ? 'flex-1' : 'w-full'}`}>
                          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Current Shot</p>
                          <p className="text-2xl font-black text-emerald-700">
                            {formatDistance(liveDistance, unit)}
                          </p>
                        </div>
                        {getCurrentHoleDistance() > 0 && (
                          <div className="flex-1 bg-blue-50 border border-blue-100 p-2 rounded-xl text-center">
                            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">To Green</p>
                            <p className="text-2xl font-black text-blue-700">
                              {(() => {
                                const holeYards = getCurrentHoleDistance();
                                const shotYards = liveDistance * 1.09361;
                                const remaining = Math.max(0, (remainingDistance !== null && remainingDistance > 0 ? remainingDistance : holeYards) - shotYards);
                                return Math.round(unit === 'yards' ? remaining : remaining * 0.9144);
                              })()}
                              <span className="text-sm ml-1">{unit}</span>
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                    <div className="flex gap-2">
                      <button
                        id="mark-ball-btn"
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

              {/* Strokes Gained Averages */}
              {rounds.length > 0 && (() => {
                const roundSGs = rounds.map(r => calculateRoundSG(r.holeStats));
                const roundsWithSG = roundSGs.filter(sg => sg.holesCalculated > 0);
                if (roundsWithSG.length === 0) return null;

                const avgSGTotal = roundsWithSG.reduce((sum, sg) => sum + sg.sgTotal, 0) / roundsWithSG.length;
                const roundsWithOTT = roundSGs.filter(sg => sg.ottHolesCalculated > 0);
                const avgSGOTT = roundsWithOTT.length > 0
                  ? roundsWithOTT.reduce((sum, sg) => sum + sg.sgOffTheTee, 0) / roundsWithOTT.length
                  : null;
                const avgSGApp = roundsWithOTT.length > 0
                  ? roundsWithOTT.reduce((sum, sg) => sum + sg.sgApproach, 0) / roundsWithOTT.length
                  : null;

                return (
                  <div className="bg-gradient-to-br from-stone-800 to-stone-900 rounded-2xl p-5 text-white">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
                      Strokes Gained vs PGA Tour (avg/round)
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Total</p>
                        <p className={`text-xl font-black ${avgSGTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatSG(avgSGTotal)}
                        </p>
                        <p className="text-[9px] text-stone-500">{roundsWithSG.length} rounds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Off Tee</p>
                        <p className={`text-xl font-black ${avgSGOTT !== null ? (avgSGOTT >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-stone-500'}`}>
                          {avgSGOTT !== null ? formatSG(avgSGOTT) : '—'}
                        </p>
                        <p className="text-[9px] text-stone-500">{roundsWithOTT.length} rounds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-stone-400 uppercase">Approach</p>
                        <p className={`text-xl font-black ${avgSGApp !== null ? (avgSGApp >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-stone-500'}`}>
                          {avgSGApp !== null ? formatSG(avgSGApp) : '—'}
                        </p>
                        <p className="text-[9px] text-stone-500">{roundsWithOTT.length} rounds</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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

              {/* GIR% by Approach Club */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-stone-800">GIR by Club</h3>
                {girByClub.length === 0 ? (
                  <div className="bg-white p-6 rounded-2xl text-center border border-dashed border-stone-200">
                    <p className="text-stone-400 text-sm">No approach club data yet.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-100">
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest">Club</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest text-center">Approaches</th>
                          <th className="px-4 py-3 font-bold text-stone-400 uppercase text-[10px] tracking-widest text-right">GIR%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {girByClub.map((row) => (
                          <tr key={row.club}>
                            <td className="px-4 py-3">
                              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">
                                {row.club}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-stone-600">{row.attempts}</td>
                            <td className={`px-4 py-3 text-right font-bold ${
                              row.girPct >= 50 ? 'text-emerald-600' : row.girPct >= 25 ? 'text-amber-600' : 'text-red-500'
                            }`}>
                              {row.girPct}%
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
                  {groupedDrives.map(({ club, count, avgDistance, drives }) => (
                    <div key={club} className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                      {/* Club summary header — clickable to expand */}
                      <button
                        onClick={() => toggleClubExpand(club)}
                        className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded uppercase tracking-wider">
                            {club}
                          </span>
                          <span className="text-sm text-stone-400 font-medium">
                            {count} {count === 1 ? 'drive' : 'drives'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-stone-700">
                            {formatDistance(avgDistance, unit)}
                          </span>
                          {expandedClubs.has(club) ? (
                            <ChevronUp size={18} className="text-stone-400" />
                          ) : (
                            <ChevronDown size={18} className="text-stone-400" />
                          )}
                        </div>
                      </button>
                      {/* Expanded individual drives */}
                      <AnimatePresence>
                        {expandedClubs.has(club) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-stone-100">
                              {drives.map(drive => (
                                <SwipeableDriveCard key={drive.id} drive={drive} unit={unit} onDelete={deleteDrive} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Your Bag ({bag.length}/{MAX_BAG_SIZE})</p>
                    {bag.length < MAX_BAG_SIZE && (
                      <button
                        onClick={() => {
                          // Find the first club option not already in the bag
                          const availableName = CLUB_OPTIONS.find(name => !bag.some(b => b.name === name)) || CLUB_OPTIONS[0];
                          setBag([...bag, { id: crypto.randomUUID(), name: availableName, avgDistance: 0 }]);
                        }}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Club
                      </button>
                    )}
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100">
                        <th className="pb-3 pl-2 w-8">#</th>
                        <th className="pb-3">Club</th>
                        <th className="pb-3 pr-2 text-right">Max Yds</th>
                        <th className="pb-3 pr-1 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {[...bag]
                        .sort((a, b) => b.avgDistance - a.avgDistance)
                        .map((club, sortedIdx) => {
                          const realIdx = bag.findIndex(b => b.id === club.id);
                          return (
                            <tr key={club.id} className="hover:bg-stone-50/50">
                              <td className="py-2.5 pl-2 text-xs text-stone-400 font-mono">{sortedIdx + 1}</td>
                              <td className="py-2.5">
                                <select
                                  value={club.name}
                                  onChange={(e) => {
                                    const newBag = [...bag];
                                    newBag[realIdx] = { ...newBag[realIdx], name: e.target.value };
                                    setBag(newBag);
                                  }}
                                  className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 font-bold text-stone-700 outline-none focus:ring-2 focus:ring-emerald-500 text-sm w-full"
                                >
                                  {CLUB_OPTIONS.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2.5 pr-2 text-right">
                                <input
                                  type="number"
                                  value={club.avgDistance}
                                  onChange={(e) => {
                                    const newBag = [...bag];
                                    newBag[realIdx] = { ...newBag[realIdx], avgDistance: parseInt(e.target.value) || 0 };
                                    setBag(newBag);
                                  }}
                                  className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 font-mono font-bold text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500 text-right w-16 text-sm"
                                />
                              </td>
                              <td className="py-2.5 pr-1 text-center">
                                <button
                                  onClick={() => setBag(bag.filter((_, i) => i !== realIdx))}
                                  className="p-1 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>

                  {bag.length === 0 && (
                    <p className="text-center py-6 text-stone-400 text-sm">No clubs added yet. Click "Add Club" to start building your bag.</p>
                  )}
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

              <div className="p-4 bg-stone-50 border-t border-stone-100 space-y-2">
                <button
                  onClick={openMappingMode}
                  disabled={!editingCourse.name.trim()}
                  className="w-full bg-white border border-emerald-300 text-emerald-700 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-emerald-50 disabled:border-stone-200 disabled:text-stone-400"
                >
                  <MapPin size={20} />
                  Map Course
                </button>
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

      {/* Mapping Mode Modal */}
      <AnimatePresence>
        {isMappingModeOpen && editingCourse && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-4 border-b border-stone-100 bg-white sticky top-0 z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsMappingModeOpen(false)}
                      className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-lg font-bold">Map Course</h2>
                      <p className="text-[10px] text-stone-400">{editingCourse.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMappingModeOpen(false)}
                    className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                {/* Hole Navigator */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => { setMappingHoleIndex(prev => Math.max(0, prev - 1)); setManualCoordFeatureId(null); setAddFeatureMenuOpen(false); }}
                    disabled={mappingHoleIndex === 0}
                    className="p-2 rounded-full hover:bg-stone-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-lg font-black text-stone-800">Hole {mappingHoleIndex + 1}</span>
                  <button
                    onClick={() => { setMappingHoleIndex(prev => Math.min(17, prev + 1)); setManualCoordFeatureId(null); setAddFeatureMenuOpen(false); }}
                    disabled={mappingHoleIndex === 17}
                    className="p-2 rounded-full hover:bg-stone-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                {/* GPS Status */}
                {mappingGpsStatus && (
                  <p className={`text-center text-xs font-bold mt-2 ${mappingGpsStatus.includes('captured') || mappingGpsStatus.includes('Coordinates') ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {mappingGpsStatus}
                  </p>
                )}
              </div>

              {/* Feature List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {mappingData[mappingHoleIndex] && (() => {
                  const holeFeatures = mappingData[mappingHoleIndex].features;
                  const teeFeatures = holeFeatures.filter(f => f.type === 'tee_box');
                  const fairwayFeatures = holeFeatures.filter(f => f.type === 'fairway');
                  const greenFeatures = holeFeatures.filter(f => f.type === 'green');
                  const otherFeatures = holeFeatures.filter(f => f.type === 'hazard' || f.type === 'custom');

                  return (
                    <>
                      {/* Tee Boxes Section */}
                      {teeFeatures.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Tee Boxes</label>
                          {teeFeatures.map(feature => {
                            const tb = editingTeeBoxes.find(t => t.color === feature.teeBoxColor);
                            const dist = tb?.distances[mappingHoleIndex] || 0;
                            return (
                              <div key={feature.id} className="bg-stone-50 rounded-xl border border-stone-100 p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-4 h-4 rounded-full flex-shrink-0 ${TEE_BOX_COLORS[feature.teeBoxColor || ''] || 'bg-stone-300'}`} />
                                    <span className="text-sm font-bold text-stone-700">{feature.name}</span>
                                    {dist > 0 && <span className="text-[10px] text-stone-400">({dist} yds)</span>}
                                  </div>
                                  {feature.coordinates ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                        {feature.coordinates.lat.toFixed(5)}, {feature.coordinates.lng.toFixed(5)}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => captureCoordinates(mappingHoleIndex, feature.id)}
                                    className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Target size={12} />
                                    {feature.coordinates ? 'Re-capture GPS' : 'Add GPS'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (manualCoordFeatureId === feature.id) {
                                        setManualCoordFeatureId(null);
                                      } else {
                                        setManualCoordFeatureId(feature.id);
                                        setManualDmsInput('');
                                      }
                                    }}
                                    className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Pencil size={12} />
                                    {feature.coordinates ? 'Edit Manual' : 'Enter Manual'}
                                  </button>
                                </div>
                                {manualCoordFeatureId === feature.id && (
                                  <div className="mt-2 space-y-1.5">
                                    <label className="text-[9px] font-bold text-stone-400 uppercase">DMS Coordinates</label>
                                    <div className="flex gap-2">
                                      <input type="text" value={manualDmsInput} onChange={(e) => setManualDmsInput(e.target.value)}
                                        placeholder={'49°13\'55.16"N 123°12\'27.76"W'}
                                        className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500" />
                                      <button onClick={() => applyManualCoordinates(mappingHoleIndex, feature.id)}
                                        className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Check size={16} /></button>
                                      <button onClick={() => setManualCoordFeatureId(null)}
                                        className="p-1.5 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300"><X size={16} /></button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Fairway Points Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-amber-500 uppercase tracking-widest ml-1">Fairway Points</label>
                          <button
                            onClick={() => addFairwayPoint(mappingHoleIndex)}
                            className="flex items-center gap-1 text-[10px] font-bold text-amber-600 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100"
                          >
                            <Plus size={12} /> Add Point
                          </button>
                        </div>
                        {fairwayFeatures.length === 0 && (
                          <p className="text-[10px] text-stone-400 ml-1">No fairway points — add points for doglegs or curved holes</p>
                        )}
                        {fairwayFeatures.map(feature => (
                          <div key={feature.id} className="bg-amber-50 rounded-xl border border-amber-200 p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-amber-400 flex-shrink-0" />
                                <span className="text-sm font-bold text-stone-700">{feature.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {feature.coordinates && (
                                  <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                    {feature.coordinates.lat.toFixed(5)}, {feature.coordinates.lng.toFixed(5)}
                                  </span>
                                )}
                                <button onClick={() => removeFairwayPoint(mappingHoleIndex, feature.id)}
                                  className="p-1 text-stone-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => captureCoordinates(mappingHoleIndex, feature.id)}
                                className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center gap-1"
                              >
                                <Target size={12} />
                                {feature.coordinates ? 'Re-capture GPS' : 'Add GPS'}
                              </button>
                              <button
                                onClick={() => {
                                  if (manualCoordFeatureId === feature.id) {
                                    setManualCoordFeatureId(null);
                                  } else {
                                    setManualCoordFeatureId(feature.id);
                                    setManualDmsInput('');
                                  }
                                }}
                                className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors flex items-center justify-center gap-1"
                              >
                                <Pencil size={12} />
                                {feature.coordinates ? 'Edit Manual' : 'Enter Manual'}
                              </button>
                            </div>
                            {manualCoordFeatureId === feature.id && (
                              <div className="mt-2 space-y-1.5">
                                <label className="text-[9px] font-bold text-stone-400 uppercase">DMS Coordinates</label>
                                <div className="flex gap-2">
                                  <input type="text" value={manualDmsInput} onChange={(e) => setManualDmsInput(e.target.value)}
                                    placeholder={'49°13\'55.16"N 123°12\'27.76"W'}
                                    className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500" />
                                  <button onClick={() => applyManualCoordinates(mappingHoleIndex, feature.id)}
                                    className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Check size={16} /></button>
                                  <button onClick={() => setManualCoordFeatureId(null)}
                                    className="p-1.5 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300"><X size={16} /></button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Green Section */}
                      {greenFeatures.length > 0 && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Green</label>
                          {greenFeatures.map(feature => (
                            <div key={feature.id} className="bg-stone-50 rounded-xl border border-stone-100 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-stone-700">{feature.name}</span>
                                {feature.coordinates && (
                                  <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                    {feature.coordinates.lat.toFixed(5)}, {feature.coordinates.lng.toFixed(5)}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => captureCoordinates(mappingHoleIndex, feature.id)}
                                  className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Target size={12} />
                                  {feature.coordinates ? 'Re-capture GPS' : 'Add GPS'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (manualCoordFeatureId === feature.id) {
                                      setManualCoordFeatureId(null);
                                    } else {
                                      setManualCoordFeatureId(feature.id);
                                      setManualDmsInput('');
                                    }
                                  }}
                                  className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Pencil size={12} />
                                  {feature.coordinates ? 'Edit Manual' : 'Enter Manual'}
                                </button>
                              </div>
                              {manualCoordFeatureId === feature.id && (
                                <div className="mt-2 space-y-1.5">
                                  <label className="text-[9px] font-bold text-stone-400 uppercase">DMS Coordinates</label>
                                  <div className="flex gap-2">
                                    <input type="text" value={manualDmsInput} onChange={(e) => setManualDmsInput(e.target.value)}
                                      placeholder={'49°13\'55.16"N 123°12\'27.76"W'}
                                      className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500" />
                                    <button onClick={() => applyManualCoordinates(mappingHoleIndex, feature.id)}
                                      className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Check size={16} /></button>
                                    <button onClick={() => setManualCoordFeatureId(null)}
                                      className="p-1.5 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300"><X size={16} /></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Hazards & Custom Features Section */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Hazards & Features</label>
                        {otherFeatures.map(feature => (
                          <div key={feature.id} className="bg-stone-50 rounded-xl border border-stone-100 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-stone-700">{feature.name}</span>
                              <div className="flex items-center gap-1">
                                {feature.coordinates && (
                                  <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                    {feature.coordinates.lat.toFixed(5)}, {feature.coordinates.lng.toFixed(5)}
                                  </span>
                                )}
                                <button onClick={() => removeMappingFeature(mappingHoleIndex, feature.id)}
                                  className="p-1 text-stone-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => captureCoordinates(mappingHoleIndex, feature.id)}
                                className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center justify-center gap-1"
                              >
                                <Target size={12} />
                                {feature.coordinates ? 'Re-capture GPS' : 'Add GPS'}
                              </button>
                              <button
                                onClick={() => {
                                  if (manualCoordFeatureId === feature.id) {
                                    setManualCoordFeatureId(null);
                                  } else {
                                    setManualCoordFeatureId(feature.id);
                                    setManualDmsInput('');
                                  }
                                }}
                                className="flex-1 text-[11px] font-bold py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors flex items-center justify-center gap-1"
                              >
                                <Pencil size={12} />
                                {feature.coordinates ? 'Edit Manual' : 'Enter Manual'}
                              </button>
                            </div>
                            {manualCoordFeatureId === feature.id && (
                              <div className="mt-2 space-y-1.5">
                                <label className="text-[9px] font-bold text-stone-400 uppercase">DMS Coordinates</label>
                                <div className="flex gap-2">
                                  <input type="text" value={manualDmsInput} onChange={(e) => setManualDmsInput(e.target.value)}
                                    placeholder={'49°13\'55.16"N 123°12\'27.76"W'}
                                    className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500" />
                                  <button onClick={() => applyManualCoordinates(mappingHoleIndex, feature.id)}
                                    className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Check size={16} /></button>
                                  <button onClick={() => setManualCoordFeatureId(null)}
                                    className="p-1.5 bg-stone-200 text-stone-600 rounded-lg hover:bg-stone-300"><X size={16} /></button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add Feature Button & Menu */}
                        {!addFeatureMenuOpen ? (
                          <button
                            onClick={() => setAddFeatureMenuOpen(true)}
                            className="w-full py-2.5 border-2 border-dashed border-stone-200 rounded-xl text-stone-400 font-bold text-xs flex items-center justify-center gap-1 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                          >
                            <Plus size={14} /> Add Feature
                          </button>
                        ) : (
                          <div className="bg-white border border-stone-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Add Feature</span>
                              <button onClick={() => { setAddFeatureMenuOpen(false); setCustomFeatureName(''); }}
                                className="p-1 text-stone-400 hover:text-stone-600"><X size={14} /></button>
                            </div>
                            {PRESET_HAZARD_FEATURES.map(name => (
                              <button key={name}
                                onClick={() => addMappingFeature(mappingHoleIndex, name, 'hazard')}
                                className="w-full text-left text-sm font-medium text-stone-700 py-2 px-3 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                              >
                                {name}
                              </button>
                            ))}
                            <div className="border-t border-stone-100 pt-2 mt-2">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={customFeatureName}
                                  onChange={(e) => setCustomFeatureName(e.target.value)}
                                  placeholder="Custom feature name..."
                                  className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button
                                  onClick={() => { if (customFeatureName.trim()) addMappingFeature(mappingHoleIndex, customFeatureName.trim(), 'custom'); }}
                                  disabled={!customFeatureName.trim()}
                                  className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-100">
                <button
                  onClick={() => setIsMappingModeOpen(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Check size={20} />
                  Done
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
              onClick={() => { setIsRoundModalOpen(false); setIsEditingRound(false); }}
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
                  onClick={() => { setIsRoundModalOpen(false); setIsEditingRound(false); }}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-stone-400" />
                </button>
              </div>

              {/* Scorecard & Strokes Gained */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                {/* Strokes Gained Summary Card */}
                {(() => {
                  const displayStats = isEditingRound ? editingRoundStats : selectedRound.holeStats;
                  const roundSG = calculateRoundSG(displayStats);
                  if (roundSG.holesCalculated === 0) return null;
                  return (
                    <div className="bg-gradient-to-br from-stone-800 to-stone-900 rounded-2xl p-5 text-white">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Strokes Gained vs PGA Tour</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">Total</p>
                          <p className={`text-xl font-black ${roundSG.sgTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatSG(roundSG.sgTotal)}
                          </p>
                          <p className="text-[9px] text-stone-500">{roundSG.holesCalculated} holes</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">Off Tee</p>
                          <p className={`text-xl font-black ${roundSG.ottHolesCalculated > 0 ? (roundSG.sgOffTheTee >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-stone-500'}`}>
                            {roundSG.ottHolesCalculated > 0 ? formatSG(roundSG.sgOffTheTee) : '—'}
                          </p>
                          <p className="text-[9px] text-stone-500">{roundSG.ottHolesCalculated} holes</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-stone-400 uppercase">Approach</p>
                          <p className={`text-xl font-black ${roundSG.ottHolesCalculated > 0 ? (roundSG.sgApproach >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-stone-500'}`}>
                            {roundSG.ottHolesCalculated > 0 ? formatSG(roundSG.sgApproach) : '—'}
                          </p>
                          <p className="text-[9px] text-stone-500">{roundSG.ottHolesCalculated} holes</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Per-Hole Scorecard Table */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[580px]">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-100 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        <th className="px-2 py-2 text-left sticky left-0 bg-stone-50 z-10">Hole</th>
                        <th className="px-2 py-2 text-center">Par</th>
                        <th className="px-2 py-2 text-center">Score</th>
                        <th className="px-2 py-2 text-center">+/-</th>
                        <th className="px-2 py-2 text-center">Putts</th>
                        <th className="px-2 py-2 text-center">FW</th>
                        <th className="px-2 py-2 text-center">GIR</th>
                        <th className="px-2 py-2 text-center">Up&Dn</th>
                        <th className="px-2 py-2 text-center">SG</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {Array.from({ length: 18 }, (_, i) => {
                        const holeNum = i + 1;
                        const displayStats = isEditingRound ? editingRoundStats : selectedRound.holeStats;
                        const stat = displayStats[holeNum];
                        if (!stat) return null;

                        const diff = stat.score - stat.par;
                        const holeSG = calculateHoleSG(stat);
                        const isTurnRow = holeNum === 10;

                        const toggleEditBool = (field: 'fairway' | 'gir' | 'upAndDown') => {
                          setEditingRoundStats(prev => {
                            const current = prev[holeNum][field];
                            const next = current === null ? true : current === true ? false : null;
                            return { ...prev, [holeNum]: { ...prev[holeNum], [field]: next } };
                          });
                        };

                        return (
                          <React.Fragment key={holeNum}>
                            {isTurnRow && (
                              <tr className="bg-stone-100">
                                <td colSpan={9} className="px-2 py-1 text-[9px] font-bold text-stone-400 uppercase tracking-widest">Back Nine</td>
                              </tr>
                            )}
                            <tr className={`${diff < 0 ? 'bg-emerald-50/40' : diff > 0 ? 'bg-red-50/40' : ''}`}>
                              <td className="px-2 py-1.5 font-bold text-stone-600 sticky left-0 bg-inherit z-10">{holeNum}</td>
                              <td className="px-2 py-1.5 text-center text-stone-500">{stat.par}</td>
                              <td className="px-2 py-1.5 text-center">
                                {isEditingRound ? (
                                  <input type="number" value={stat.score}
                                    onChange={(e) => setEditingRoundStats(prev => ({ ...prev, [holeNum]: { ...prev[holeNum], score: Math.max(1, parseInt(e.target.value) || 1) } }))}
                                    className="w-12 text-center bg-white border border-stone-200 rounded px-1 py-0.5 font-bold text-stone-800 outline-none"
                                  />
                                ) : (
                                  <span className={`font-bold ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{stat.score}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`text-xs font-bold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-stone-400'}`}>
                                  {diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : diff)}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {isEditingRound ? (
                                  <input type="number" value={stat.putts}
                                    onChange={(e) => setEditingRoundStats(prev => ({ ...prev, [holeNum]: { ...prev[holeNum], putts: Math.max(0, parseInt(e.target.value) || 0) } }))}
                                    className="w-12 text-center bg-white border border-stone-200 rounded px-1 py-0.5 font-bold text-blue-600 outline-none"
                                  />
                                ) : (
                                  <span className="font-medium text-stone-600">{stat.putts}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {isEditingRound ? (
                                  <button onClick={() => toggleEditBool('fairway')}
                                    className={`w-7 h-7 rounded-full text-xs font-bold ${stat.fairway === true ? 'bg-emerald-100 text-emerald-700' : stat.fairway === false ? 'bg-red-100 text-red-600' : 'bg-stone-100 text-stone-400'}`}>
                                    {stat.fairway === true ? '✓' : stat.fairway === false ? '✗' : '—'}
                                  </button>
                                ) : (
                                  <span className={stat.fairway ? 'text-emerald-600 font-bold' : 'text-stone-300'}>{stat.fairway === null ? '—' : stat.fairway ? '✓' : '✗'}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {isEditingRound ? (
                                  <button onClick={() => toggleEditBool('gir')}
                                    className={`w-7 h-7 rounded-full text-xs font-bold ${stat.gir === true ? 'bg-emerald-100 text-emerald-700' : stat.gir === false ? 'bg-red-100 text-red-600' : 'bg-stone-100 text-stone-400'}`}>
                                    {stat.gir === true ? '✓' : stat.gir === false ? '✗' : '—'}
                                  </button>
                                ) : (
                                  <span className={stat.gir ? 'text-emerald-600 font-bold' : 'text-stone-300'}>{stat.gir === null ? '—' : stat.gir ? '✓' : '✗'}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {isEditingRound ? (
                                  <button onClick={() => toggleEditBool('upAndDown')}
                                    className={`w-7 h-7 rounded-full text-xs font-bold ${stat.upAndDown === true ? 'bg-purple-100 text-purple-700' : stat.upAndDown === false ? 'bg-red-100 text-red-600' : 'bg-stone-100 text-stone-400'}`}>
                                    {stat.upAndDown === true ? '✓' : stat.upAndDown === false ? '✗' : '—'}
                                  </button>
                                ) : (
                                  <span className={stat.upAndDown ? 'text-purple-600 font-bold' : 'text-stone-300'}>{stat.upAndDown === null ? '—' : stat.upAndDown ? '✓' : '✗'}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {holeSG.sgTotal !== null ? (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sgBgColor(holeSG.sgTotal)} ${sgColor(holeSG.sgTotal)}`}>
                                    {formatSG(holeSG.sgTotal)}
                                  </span>
                                ) : <span className="text-stone-300">—</span>}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      {/* Totals Row */}
                      {(() => {
                        const displayStats = isEditingRound ? editingRoundStats : selectedRound.holeStats;
                        const holes = Object.values(displayStats) as HoleStats[];
                        const totalScore = holes.reduce((sum, h) => sum + h.score, 0);
                        const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
                        const totalPutts = holes.reduce((sum, h) => sum + h.putts, 0);
                        const totalDiff = totalScore - totalPar;
                        return (
                          <tr className="bg-stone-800 text-white font-bold text-xs">
                            <td className="px-2 py-2 sticky left-0 bg-stone-800 z-10">TOT</td>
                            <td className="px-2 py-2 text-center">{totalPar}</td>
                            <td className="px-2 py-2 text-center">{totalScore}</td>
                            <td className="px-2 py-2 text-center">{totalDiff > 0 ? `+${totalDiff}` : totalDiff === 0 ? 'E' : totalDiff}</td>
                            <td className="px-2 py-2 text-center">{totalPutts}</td>
                            <td colSpan={4}></td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer with Buttons */}
              <div className="flex-shrink-0 bg-white px-6 py-4 border-t border-stone-100 flex gap-3">
                {isEditingRound ? (
                  <>
                    <button
                      onClick={() => {
                        const holes = Object.values(editingRoundStats) as HoleStats[];
                        const newTotalScore = holes.reduce((sum, h) => sum + h.score, 0);
                        const newTotalPar = holes.reduce((sum, h) => sum + h.par, 0);
                        setRounds(prev => prev.map(r =>
                          r.id === selectedRound!.id
                            ? { ...r, holeStats: { ...editingRoundStats }, totalScore: newTotalScore, totalPar: newTotalPar }
                            : r
                        ));
                        setSelectedRound(prev => prev ? { ...prev, holeStats: { ...editingRoundStats }, totalScore: holes.reduce((s, h) => s + h.score, 0), totalPar: holes.reduce((s, h) => s + h.par, 0) } : null);
                        setIsEditingRound(false);
                      }}
                      className="flex-1 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      Save Changes
                    </button>
                    <button
                      onClick={() => { setIsEditingRound(false); setEditingRoundStats({}); }}
                      className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditingRoundStats({ ...selectedRound.holeStats }); setIsEditingRound(true); }}
                      className="flex-1 px-4 py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <Pencil size={18} />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRound(selectedRound.id)}
                      className="px-4 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button
                      onClick={() => { setIsRoundModalOpen(false); setIsEditingRound(false); }}
                      className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 font-bold rounded-xl hover:bg-stone-200 transition-colors"
                    >
                      Close
                    </button>
                  </>
                )}
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
