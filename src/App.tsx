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
  fairway: boolean;
  gir: boolean;
  upAndDown: boolean;
  sandSave: boolean;
  teeAccuracy: 'left' | 'center' | 'right' | null;
  approachAccuracy: 'left' | 'right' | 'short' | 'long' | 'center' | null;
  par: number;
  distance?: number;
}

interface CourseHole {
  par: number;
  distance: number;
}

interface Course {
  id: string;
  name: string;
  holes: CourseHole[];
}

type Unit = 'yards' | 'meters';

// --- Constants ---

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
  { id: '14', name: 'Putter', avgDistance: 0 },
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
}

export default function App() {
  const [currentPos, setCurrentPos] = useState<Position | null>(null);
  const [startPos, setStartPos] = useState<Position | null>(null);
  const [history, setHistory] = useState<Drive[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [unit, setUnit] = useState<Unit>('yards');
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastDriveDistance, setLastDriveDistance] = useState<number | null>(null);
  const [view, setView] = useState<'home' | 'tracker' | 'history' | 'settings'>('home');
  
  // Course Search States
  const [courseSearch, setCourseSearch] = useState('');
  const [isSearchingCourse, setIsSearchingCourse] = useState(false);
  const [courseName, setCourseName] = useState('');
  
  // New States
  const [bag, setBag] = useState<Club[]>(DEFAULT_CLUBS);
  const [selectedClubId, setSelectedClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [isBagModalOpen, setIsBagModalOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [isRoundModalOpen, setIsRoundModalOpen] = useState(false);

  // Score Tracking State
  const [currentHole, setCurrentHole] = useState(1);
  const [holeStats, setHoleStats] = useState<Record<number, HoleStats>>({
    1: { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 }
  });

  // Approach Shot Tracking
  interface ApproachShot {
    holeNumber: number;
    distance: number;
    club: string;
    timestamp: number;
  }
  const [approachShots, setApproachShots] = useState<ApproachShot[]>([]);
  const [selectedApproachClubId, setSelectedApproachClubId] = useState<string>(DEFAULT_CLUBS[0].id);
  const [remainingDistance, setRemainingDistance] = useState<number | null>(null);

  // Load data from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('golf_drive_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedBag = localStorage.getItem('golf_bag');
    if (savedBag) setBag(JSON.parse(savedBag));

    const savedStats = localStorage.getItem('golf_hole_stats');
    if (savedStats) setHoleStats(JSON.parse(savedStats));

    const savedCourses = localStorage.getItem('golf_courses');
    if (savedCourses) setCourses(JSON.parse(savedCourses));

    const savedRounds = localStorage.getItem('golf_rounds');
    if (savedRounds) setRounds(JSON.parse(savedRounds));
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('golf_drive_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('golf_bag', JSON.stringify(bag));
  }, [bag]);

  useEffect(() => {
    localStorage.setItem('golf_hole_stats', JSON.stringify(holeStats));
  }, [holeStats]);

  useEffect(() => {
    localStorage.setItem('golf_courses', JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    localStorage.setItem('golf_rounds', JSON.stringify(rounds));
  }, [rounds]);

  useEffect(() => {
    localStorage.setItem('golf_approach_shots', JSON.stringify(approachShots));
  }, [approachShots]);

  // Load approach shots from localStorage
  useEffect(() => {
    const savedApproachShots = localStorage.getItem('golf_approach_shots');
    if (savedApproachShots) setApproachShots(JSON.parse(savedApproachShots));
  }, []);

  // Auto-select accuracy buttons when GIR and Fairway are both true
  useEffect(() => {
    const currentHoleData = holeStats[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
    if (currentHoleData.gir && currentHoleData.fairway) {
      // Only update if values are different to prevent pulsing
      if (currentHoleData.teeAccuracy !== 'center') {
        setTeeAccuracy('center');
      }
      if (currentHoleData.approachAccuracy !== 'center') {
        setApproachAccuracy('center');
      }
    }
  }, [currentHole, holeStats]);

  // Load courses from Supabase on app startup
  useEffect(() => {
    const loadCoursesFromSupabase = async () => {
      if (!isSupabaseAvailable()) return;

      try {
        const coursesFromSupabase = await supabaseDb.getCourses();
        if (coursesFromSupabase && coursesFromSupabase.length > 0) {
          setCourses(coursesFromSupabase);
          localStorage.setItem('golf_courses', JSON.stringify(coursesFromSupabase));
        }
      } catch (error) {
        console.error('Failed to load courses from Supabase:', error);
      }
    };

    loadCoursesFromSupabase();
  }, []);

  // Load rounds from Supabase on app startup
  useEffect(() => {
    const loadRoundsFromSupabase = async () => {
      if (!isSupabaseAvailable()) return;

      try {
        const roundsFromSupabase = await supabaseDb.getRounds();
        if (roundsFromSupabase && roundsFromSupabase.length > 0) {
          setRounds(roundsFromSupabase);
          localStorage.setItem('golf_rounds', JSON.stringify(roundsFromSupabase));
        }
      } catch (error) {
        console.error('Failed to load rounds from Supabase:', error);
      }
    };

    loadRoundsFromSupabase();
  }, []);

  // Load drives (history) from Supabase on app startup
  useEffect(() => {
    const loadDrivesFromSupabase = async () => {
      if (!isSupabaseAvailable()) return;

      try {
        const drivesFromSupabase = await supabaseDb.getDrives();
        if (drivesFromSupabase && drivesFromSupabase.length > 0) {
          setHistory(drivesFromSupabase);
          localStorage.setItem('golf_drive_history', JSON.stringify(drivesFromSupabase));
        }
      } catch (error) {
        console.error('Failed to load drives from Supabase:', error);
      }
    };

    loadDrivesFromSupabase();
  }, []);

  // Load clubs (bag) from Supabase on app startup
  useEffect(() => {
    const loadClubsFromSupabase = async () => {
      if (!isSupabaseAvailable()) return;

      try {
        const clubsFromSupabase = await supabaseDb.getClubs();
        if (clubsFromSupabase && clubsFromSupabase.length > 0) {
          setBag(clubsFromSupabase);
          localStorage.setItem('golf_bag', JSON.stringify(clubsFromSupabase));
        }
      } catch (error) {
        console.error('Failed to load clubs from Supabase:', error);
      }
    };

    loadClubsFromSupabase();
  }, []);

  // Load hole stats from Supabase on app startup
  useEffect(() => {
    const loadHoleStatsFromSupabase = async () => {
      if (!isSupabaseAvailable()) return;

      try {
        const holeStatsFromSupabase = await supabaseDb.getHoleStats();
        if (holeStatsFromSupabase && holeStatsFromSupabase.length > 0) {
          // Convert array to Record format
          const statsRecord: Record<number, HoleStats> = {};
          holeStatsFromSupabase.forEach((stat: any) => {
            statsRecord[stat.hole_number] = {
              score: stat.score,
              putts: stat.putts,
              fairway: stat.fairway,
              gir: stat.gir,
              upAndDown: stat.up_and_down,
              sandSave: stat.sand_save,
              teeAccuracy: stat.tee_accuracy,
              approachAccuracy: stat.approach_accuracy,
              par: stat.par,
              distance: stat.distance,
            };
          });
          setHoleStats(statsRecord);
          localStorage.setItem('golf_hole_stats', JSON.stringify(statsRecord));
        }
      } catch (error) {
        console.error('Failed to load hole stats from Supabase:', error);
      }
    };

    loadHoleStatsFromSupabase();
  }, []);

  // Sync courses to Supabase
  useEffect(() => {
    if (!isSupabaseAvailable()) return;

    const syncCourses = async () => {
      try {
        for (const course of courses) {
          await supabaseDb.saveCourse({
            id: course.id,
            name: course.name,
            location: course.location,
            holes: course.holes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to sync courses to Supabase:', error);
      }
    };

    const timer = setTimeout(syncCourses, 1000); // Debounce 1 second
    return () => clearTimeout(timer);
  }, [courses]);

  // Sync rounds to Supabase
  useEffect(() => {
    if (!isSupabaseAvailable()) return;

    const syncRounds = async () => {
      try {
        for (const round of rounds) {
          await supabaseDb.saveRound({
            id: round.id,
            course_id: round.courseId,
            date: round.date,
            total_score: round.totalScore,
            total_putts: round.totalPutts,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to sync rounds to Supabase:', error);
      }
    };

    const timer = setTimeout(syncRounds, 1000); // Debounce 1 second
    return () => clearTimeout(timer);
  }, [rounds]);

  // Sync drives to Supabase
  useEffect(() => {
    if (!isSupabaseAvailable()) return;

    const syncDrives = async () => {
      try {
        for (const drive of history) {
          await supabaseDb.saveDrive({
            id: drive.id,
            start_lat: drive.start.lat,
            start_lng: drive.start.lng,
            end_lat: drive.end.lat,
            end_lng: drive.end.lng,
            distance: drive.distance,
            club: drive.club,
            timestamp: drive.timestamp,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to sync drives to Supabase:', error);
      }
    };

    const timer = setTimeout(syncDrives, 1000); // Debounce 1 second
    return () => clearTimeout(timer);
  }, [history]);

  // Sync clubs to Supabase
  useEffect(() => {
    if (!isSupabaseAvailable()) return;

    const syncClubs = async () => {
      try {
        for (const club of bag) {
          await supabaseDb.saveClub({
            id: club.id,
            name: club.name,
            avg_distance: club.avgDistance,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to sync clubs to Supabase:', error);
      }
    };

    const timer = setTimeout(syncClubs, 1000); // Debounce 1 second
    return () => clearTimeout(timer);
  }, [bag]);

  // Sync hole stats to Supabase
  useEffect(() => {
    if (!isSupabaseAvailable()) return;

    const syncHoleStats = async () => {
      try {
        for (const [holeNumber, stats] of Object.entries(holeStats)) {
          await supabaseDb.saveHoleStats({
            hole_number: parseInt(holeNumber),
            score: stats.score,
            putts: stats.putts,
            fairway: stats.fairway,
            gir: stats.gir,
            up_and_down: stats.upAndDown,
            sand_save: stats.sandSave,
            tee_accuracy: stats.teeAccuracy,
            approach_accuracy: stats.approachAccuracy,
            par: stats.par,
            distance: stats.distance,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to sync hole stats to Supabase:', error);
      }
    };

    const timer = setTimeout(syncHoleStats, 1000); // Debounce 1 second
    return () => clearTimeout(timer);
  }, [holeStats]);

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
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, score: Math.max(1, current.score + delta) }
      };
    });
  };

  const updatePutts = (delta: number) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
      return {
        ...prev,
        [currentHole]: { ...current, putts: Math.max(0, current.putts + delta) }
      };
    });
  };

  const setTeeAccuracy = (accuracy: 'left' | 'center' | 'right') => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
      const newAccuracy = current.teeAccuracy === accuracy ? null : accuracy;

      return {
        ...prev,
        [currentHole]: {
          ...current,
          teeAccuracy: newAccuracy,
          fairway: newAccuracy === 'center' ? true : false  // AUTO-SYNC: fairway linked to center accuracy
        }
      };
    });
  };

  const setApproachAccuracy = (accuracy: 'left' | 'right' | 'short' | 'long' | 'center') => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
      const newAccuracy = current.approachAccuracy === accuracy ? null : accuracy;

      return {
        ...prev,
        [currentHole]: {
          ...current,
          approachAccuracy: newAccuracy,
          // AUTO-SYNC: GIR linked to center accuracy (with conflict checks)
          gir: newAccuracy === 'center' ? (current.upAndDown || current.sandSave ? false : true) : false
        }
      };
    });
  };

  const toggleStat = (stat: keyof Omit<HoleStats, 'score' | 'putts' | 'teeAccuracy' | 'approachAccuracy' | 'par'>) => {
    setHoleStats(prev => {
      const current = prev[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };
      const newValue = !current[stat];

      // GIR logic: cannot have GIR if Up&Down, Sand Save are true, or approach accuracy ≠ center
      if (stat === 'gir' && newValue) {
        // Only allow GIR if:
        // 1. Up&Down is false
        // 2. Sand Save is false
        // 3. Approach accuracy is 'center'
        if (current.upAndDown || current.sandSave || current.approachAccuracy !== 'center') {
          return prev; // Don't allow GIR
        }
      }

      // Fairway ↔ Tee Accuracy linking: if setting fairway to true, set tee accuracy to center
      if (stat === 'fairway' && newValue) {
        return {
          ...prev,
          [currentHole]: { ...current, [stat]: newValue, teeAccuracy: 'center' }
        };
      }

      // If setting fairway to false, clear tee accuracy
      if (stat === 'fairway' && !newValue) {
        return {
          ...prev,
          [currentHole]: { ...current, [stat]: newValue, teeAccuracy: null }
        };
      }

      // If setting Up&Down to true: disable GIR and clear approach accuracy
      if (stat === 'upAndDown' && newValue) {
        return {
          ...prev,
          [currentHole]: { ...current, [stat]: newValue, gir: false, approachAccuracy: null }
        };
      }

      // If setting Sand Save to true: also set Up&Down to true, disable GIR, clear approach accuracy
      if (stat === 'sandSave' && newValue) {
        return {
          ...prev,
          [currentHole]: { ...current, [stat]: newValue, upAndDown: true, gir: false, approachAccuracy: null }
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
        [nextHole]: { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 }
      }));
    }
    setCurrentHole(nextHole);
    setRemainingDistance(null);
  };

  const importCoursePars = async () => {
    if (!courseSearch.trim()) return;
    
    setIsSearchingCourse(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the hole-by-hole par and distance information for the golf course: "${courseSearch}". Return ONLY a JSON object with a "name" string and a "holes" array of 18 objects, each with "par" (integer) and "distance" (integer in yards). Example: {"name": "Pebble Beach", "holes": [{"par": 4, "distance": 380}, ...]}`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        },
      });

      const data = JSON.parse(response.text);
      if (data.holes && Array.isArray(data.holes) && data.holes.length === 18) {
        const newCourse: Course = {
          id: crypto.randomUUID(),
          name: data.name || courseSearch,
          holes: data.holes.map((h: any) => ({ par: h.par || 4, distance: h.distance || 0 }))
        };
        setCourses(prev => [newCourse, ...prev]);
        applyCourse(newCourse);
        setCourseSearch('');
      } else {
        throw new Error("Invalid course data received");
      }
    } catch (err) {
      console.error(err);
      setError("Could not find course information. Please try a more specific name.");
    } finally {
      setIsSearchingCourse(false);
    }
  };

  const applyCourse = (course: Course) => {
    const newStats: Record<number, HoleStats> = {};
    course.holes.forEach((hole, index) => {
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
    setCourseName(course.name);
    setCurrentHole(1);
    setIsRoundActive(true);
  };

  const saveManualCourse = () => {
    if (!editingCourse || !editingCourse.name.trim()) return;
    
    setCourses(prev => {
      const exists = prev.find(c => c.id === editingCourse.id);
      if (exists) {
        return prev.map(c => c.id === editingCourse.id ? editingCourse : c);
      }
      return [editingCourse, ...prev];
    });
    
    applyCourse(editingCourse);
    setIsCourseModalOpen(false);
    setEditingCourse(null);
  };

  const startManualCourse = (course?: Course) => {
    if (course) {
      setEditingCourse(JSON.parse(JSON.stringify(course)));
    } else {
      setEditingCourse({
        id: crypto.randomUUID(),
        name: '',
        holes: Array(18).fill(null).map(() => ({ par: 4, distance: 0 }))
      });
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

  const endRound = () => {
    if (!courseName) return;
    
    const holes = Object.values(holeStats);
    const totalScore = holes.reduce((acc, h) => acc + h.score, 0);
    const totalPar = holes.reduce((acc, h) => acc + h.par, 0);

    const newRound: Round = {
      id: crypto.randomUUID(),
      courseName,
      date: Date.now(),
      totalScore,
      totalPar,
      holeStats: { ...holeStats }
    };

    setRounds([newRound, ...rounds]);

    // Reset for next round
    setHoleStats({ 1: { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 } });
    setCourseName('');
    setCurrentHole(1);
    setRemainingDistance(null);
    setIsRoundActive(false);
    setView('home');
  };

  const liveDistance = startPos && currentPos ? calculateDistance(startPos, currentPos) : 0;
  const currentHoleData = holeStats[currentHole] || { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 };

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

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Avg Putts</p>
                  <p className="text-3xl font-black text-emerald-600">
                    {rounds.length > 0 
                      ? (rounds.reduce((acc, r) => {
                          const holePutts = Object.values(r.holeStats).reduce((sum, h) => sum + h.putts, 0);
                          return acc + holePutts;
                        }, 0) / (rounds.length * 18)).toFixed(1)
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Current Round Display */}
              {isRoundActive && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Current Round</p>
                  <p className="text-lg font-bold text-stone-800">{courseName}</p>
                  <p className="text-sm text-stone-600">Hole {currentHole} of 18</p>
                </div>
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
                      <button
                        key={course.id}
                        onClick={() => {
                          applyCourse(course);
                          setView('tracker');
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
                          </p>
                        </div>
                        <ChevronRight size={20} className="text-stone-300" />
                      </button>
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
              className="space-y-4"
            >
              {/* Score Tracker Section */}
              <section className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-stone-50 p-1.5 rounded-xl border border-stone-100 w-full justify-between">
                    <button onClick={() => updateScore(-1)} className="w-10 h-10 bg-white shadow-sm rounded-lg flex items-center justify-center text-stone-600 active:scale-90 transition-transform">
                      <Minus size={20} />
                    </button>
                    <div className="text-center">
                      <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Score</p>
                      <p className="text-2xl font-black">{currentHoleData.score}</p>
                      <p className={`text-[8px] font-bold uppercase tracking-tighter ${scoreIndicator.color}`}>{scoreIndicator.label}</p>
                    </div>
                    <button onClick={() => updateScore(1)} className="w-10 h-10 bg-white shadow-sm rounded-lg flex items-center justify-center text-stone-600 active:scale-90 transition-transform">
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                {/* Stat Toggles */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'fairway', label: 'Fairway' },
                    { id: 'gir', label: 'GIR' },
                    { id: 'upAndDown', label: 'Up & Down' },
                    { id: 'sandSave', label: 'Sand Save' }
                  ].map((stat) => (
                    <button
                      key={stat.id}
                      onClick={() => toggleStat(stat.id as any)}
                      className={`py-4 rounded-xl font-bold text-sm transition-all border-2 ${
                        currentHoleData[stat.id as keyof Omit<HoleStats, 'score' | 'putts' | 'teeAccuracy'>]
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10'
                          : 'bg-white border-stone-100 text-stone-400'
                      }`}
                    >
                      {stat.label}
                    </button>
                  ))}
                </div>

                {/* Putts Counter */}
                <div className="flex items-center justify-center gap-4 py-2">
                  <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest pl-2">Putts</p>
                    <button onClick={() => updatePutts(-1)} className="w-12 h-12 bg-white shadow-sm rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-90 transition-transform">
                      <Minus size={24} />
                    </button>
                    <div className="w-8 text-center">
                      <p className="text-2xl font-black text-emerald-600">{currentHoleData.putts}</p>
                    </div>
                    <button onClick={() => updatePutts(1)} className="w-12 h-12 bg-white shadow-sm rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-90 transition-transform">
                      <Plus size={24} />
                    </button>
                  </div>
                </div>

                {/* Tee Shot Accuracy */}
                {currentHoleData.par > 3 && (
                  <div className="space-y-3">
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest text-center">Tee Shot Accuracy</p>
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={() => setTeeAccuracy('left')}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.teeAccuracy === 'left'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                            : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                        }`}
                      >
                        <ChevronLeft size={26} />
                      </button>
                      <button
                        onClick={() => setTeeAccuracy('center')}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.teeAccuracy === 'center'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                            : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                        }`}
                      >
                        <div className="relative flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-current rounded-full" />
                          <div className="absolute w-2 h-2 bg-current rounded-full" />
                        </div>
                      </button>
                      <button
                        onClick={() => setTeeAccuracy('right')}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                          currentHoleData.teeAccuracy === 'right'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                            : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                        }`}
                      >
                        <ChevronRight size={26} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Approach Accuracy */}
                <div className="space-y-3">
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest text-center">Approach Accuracy</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setApproachAccuracy('left')}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.approachAccuracy === 'left'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                      }`}
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={() => setApproachAccuracy('long')}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.approachAccuracy === 'long'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                      }`}
                    >
                      <div className="rotate-90"><ChevronLeft size={24} /></div>
                    </button>
                    <button
                      onClick={() => setApproachAccuracy('center')}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.approachAccuracy === 'center'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                      }`}
                    >
                      <div className="relative flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-current rounded-full" />
                        <div className="absolute w-2 h-2 bg-current rounded-full" />
                      </div>
                    </button>
                    <button
                      onClick={() => setApproachAccuracy('short')}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.approachAccuracy === 'short'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                      }`}
                    >
                      <div className="-rotate-90"><ChevronLeft size={24} /></div>
                    </button>
                    <button
                      onClick={() => setApproachAccuracy('right')}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                        currentHoleData.approachAccuracy === 'right'
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white border-stone-100 text-stone-400 hover:border-emerald-200'
                      }`}
                    >
                      <ChevronRight size={24} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Club Selection Dropdowns */}
              <div className="space-y-3">
                {/* Tee Shot Club */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest pl-1">Tee Shot Club</label>
                  <div className="relative">
                    <select
                      value={selectedClubId}
                      onChange={(e) => setSelectedClubId(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-700 appearance-none shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      <option disabled value="">Select Club</option>
                      {bag.map(club => (
                        <option key={club.id} value={club.id}>{club.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 bottom-3 pointer-events-none text-stone-400">
                      <ChevronRight size={18} className="rotate-90" />
                    </div>
                  </div>
                </div>

                {/* Remaining Distance Display */}
                {remainingDistance !== null && remainingDistance > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-center"
                  >
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Distance to Green</p>
                    <p className="text-2xl font-black text-blue-700">
                      {Math.round(unit === 'yards' ? remainingDistance * 1.09361 : remainingDistance)}
                      <span className="text-sm ml-1">{unit}</span>
                    </p>
                  </motion.div>
                )}

                {/* Approach Shot Club - Always show for Par 4 and Par 5 */}
                {currentHoleData.par > 3 && (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest pl-1">Approach Shot Club</label>
                    <div className="relative">
                      <select
                        value={selectedApproachClubId}
                        onChange={(e) => setSelectedApproachClubId(e.target.value)}
                        className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 font-bold text-blue-700 appearance-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      >
                        <option disabled value="">Select Club</option>
                        {bag.map(club => (
                          <option key={club.id} value={club.id}>{club.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 bottom-3 pointer-events-none text-blue-400">
                        <ChevronRight size={18} className="rotate-90" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Hole Selector */}
                <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between">
                  <button 
                    onClick={() => changeHole(-1)} 
                    className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center text-stone-400 hover:bg-stone-100 transition-colors"
                  >
                    <ChevronLeft size={28} />
                  </button>
                  <div className="text-center">
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Hole</p>
                    <p className="text-3xl font-black text-emerald-600">{currentHole}</p>
                  </div>
                  <button 
                    onClick={() => changeHole(1)} 
                    className="w-12 h-12 bg-stone-50 rounded-xl flex items-center justify-center text-stone-400 hover:bg-stone-100 transition-colors"
                  >
                    <ChevronRight size={28} />
                  </button>
                </div>
              </div>

              {/* Drive Tracking Controls */}
              <div className="space-y-3">
                {!isTracking ? (
                  <div className="space-y-3">
                    {lastDriveDistance !== null && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-center"
                      >
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Last Drive</p>
                        <p className="text-4xl font-black text-emerald-700">
                          {Math.round(unit === 'yards' ? lastDriveDistance * 1.09361 : lastDriveDistance)}
                          <span className="text-lg ml-1">{unit}</span>
                        </p>
                      </motion.div>
                    )}
                    <button
                      onClick={handleStartDrive}
                      disabled={!currentPos}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Target size={20} />
                      Start Drive
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleMarkBall}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/10 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={20} />
                      Mark Ball
                    </button>
                    <button
                      onClick={handleReset}
                      className="w-full bg-white hover:bg-stone-50 text-stone-600 font-semibold py-3 rounded-xl border border-stone-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                    >
                      <RotateCcw size={16} />
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* End Round Button */}
              {courseName && (
                <button
                  onClick={() => {
                    if (confirm('End round and post score?')) {
                      endRound();
                    }
                  }}
                  className="w-full py-4 bg-stone-800 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={20} />
                  End Round & Post Score
                </button>
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
                      const allHoles = rounds.length > 0 
                        ? rounds.flatMap(r => Object.values(r.holeStats))
                        : Object.values(holeStats);
                      
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
                        ? Object.entries(approachShots.reduce((acc: Record<string, number>, shot) => {
                            acc[shot.club] = (acc[shot.club] || 0) + 1;
                            return acc;
                          }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '--'
                        : '--';

                      return [
                        { label: 'Fairway Accuracy', value: formatPct(fairwayHits, par45Played) },
                        { label: 'Left Tendency', value: formatPct(leftMisses, par45Played) },
                        { label: 'Right Tendency', value: formatPct(rightMisses, par45Played) },
                        { label: 'GIR', value: formatPct(girHits, holesPlayed) },
                        { label: 'Up & Downs', value: formatPct(upAndDowns, holesPlayed) },
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
                      setHoleStats({ 1: { score: 4, putts: 2, fairway: false, gir: false, upAndDown: false, sandSave: false, teeAccuracy: null, approachAccuracy: null, par: 4 } });
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
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100">
                      <th className="pb-4 pl-2">Club Name</th>
                      <th className="pb-4 pr-2 text-right">Avg Distance ({unit})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {bag.map((club, index) => (
                      <tr key={club.id} className="group hover:bg-stone-50/50 transition-colors">
                        <td className="py-3 pl-2">
                          <input 
                            type="text"
                            value={club.name}
                            onChange={(e) => {
                              const newBag = [...bag];
                              newBag[index].name = e.target.value;
                              setBag(newBag);
                            }}
                            className="bg-transparent font-bold text-stone-700 outline-none focus:text-emerald-600 w-full"
                          />
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <input 
                            type="number"
                            value={club.avgDistance}
                            onChange={(e) => {
                              const newBag = [...bag];
                              newBag[index].avgDistance = parseInt(e.target.value) || 0;
                              setBag(newBag);
                            }}
                            className="bg-transparent font-mono font-bold text-emerald-600 outline-none text-right w-20"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100">
                <button 
                  onClick={() => setIsBagModalOpen(false)}
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

      {/* Manual Course Modal */}
      <AnimatePresence>
        {isCourseModalOpen && editingCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCourseModalOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <MapPin size={24} />
                  </div>
                  <h2 className="text-xl font-bold">Course Details</h2>
                </div>
                <button 
                  onClick={() => setIsCourseModalOpen(false)}
                  className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Course Name</label>
                  <input 
                    type="text"
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({...editingCourse, name: e.target.value})}
                    placeholder="e.g. Augusta National"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-700 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest px-2">
                    <span>Hole</span>
                    <span className="text-center">Par</span>
                    <span className="text-right">Distance</span>
                  </div>
                  <div className="space-y-2">
                    {editingCourse.holes.map((hole, index) => (
                      <div key={index} className="grid grid-cols-3 gap-4 items-center bg-stone-50 p-2 rounded-xl border border-stone-100">
                        <span className="pl-2 font-black text-stone-400">#{index + 1}</span>
                        <div className="flex justify-center">
                          <select 
                            value={hole.par}
                            onChange={(e) => {
                              const newHoles = [...editingCourse.holes];
                              newHoles[index].par = parseInt(e.target.value);
                              setEditingCourse({...editingCourse, holes: newHoles});
                            }}
                            className="bg-white border border-stone-200 rounded-lg px-2 py-1 font-bold text-stone-700 outline-none"
                          >
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                            <option value={6}>6</option>
                          </select>
                        </div>
                        <div className="flex justify-end pr-2">
                          <input 
                            type="number"
                            value={hole.distance || ''}
                            onChange={(e) => {
                              const newHoles = [...editingCourse.holes];
                              newHoles[index].distance = parseInt(e.target.value) || 0;
                              setEditingCourse({...editingCourse, holes: newHoles});
                            }}
                            placeholder="0"
                            className="w-16 bg-white border border-stone-200 rounded-lg px-2 py-1 font-mono font-bold text-emerald-600 text-right outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100">
                <button 
                  onClick={saveManualCourse}
                  disabled={!editingCourse.name.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
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
                            Up & Down: {stat.upAndDown ? '✓' : '✗'}
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
