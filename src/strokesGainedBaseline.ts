// PGA Tour baseline expected strokes data
// Source: Mark Broadie, Columbia University
// Shot data: user-provided table (10-600 yards by lie type)
// Putting data: PGA Tour 2010

interface BaselineEntry {
  distance: number;
  tee: number | null;
  fairway: number;
  rough: number;
  sand: number;
  recovery: number;
}

// Expected strokes from various lies at given distances (yards)
const SHOT_BASELINE: BaselineEntry[] = [
  { distance: 10,  tee: null, fairway: 2.18, rough: 2.34, sand: 2.43, recovery: 3.45 },
  { distance: 20,  tee: null, fairway: 2.40, rough: 2.59, sand: 2.53, recovery: 3.51 },
  { distance: 30,  tee: null, fairway: 2.52, rough: 2.70, sand: 2.66, recovery: 3.57 },
  { distance: 40,  tee: null, fairway: 2.60, rough: 2.78, sand: 2.82, recovery: 3.71 },
  { distance: 50,  tee: null, fairway: 2.66, rough: 2.87, sand: 2.92, recovery: 3.79 },
  { distance: 60,  tee: null, fairway: 2.70, rough: 2.91, sand: 3.15, recovery: 3.83 },
  { distance: 70,  tee: null, fairway: 2.72, rough: 2.93, sand: 3.21, recovery: 3.84 },
  { distance: 80,  tee: null, fairway: 2.75, rough: 2.96, sand: 3.24, recovery: 3.84 },
  { distance: 90,  tee: null, fairway: 2.77, rough: 2.99, sand: 3.24, recovery: 3.82 },
  { distance: 100, tee: 2.92, fairway: 2.80, rough: 3.02, sand: 3.23, recovery: 3.80 },
  { distance: 120, tee: 2.99, fairway: 2.85, rough: 3.08, sand: 3.21, recovery: 3.78 },
  { distance: 140, tee: 2.97, fairway: 2.91, rough: 3.15, sand: 3.22, recovery: 3.80 },
  { distance: 160, tee: 2.99, fairway: 2.98, rough: 3.23, sand: 3.28, recovery: 3.81 },
  { distance: 180, tee: 3.05, fairway: 3.08, rough: 3.31, sand: 3.40, recovery: 3.82 },
  { distance: 200, tee: 3.12, fairway: 3.19, rough: 3.42, sand: 3.55, recovery: 3.87 },
  { distance: 220, tee: 3.17, fairway: 3.32, rough: 3.53, sand: 3.70, recovery: 3.92 },
  { distance: 240, tee: 3.25, fairway: 3.45, rough: 3.64, sand: 3.84, recovery: 3.97 },
  { distance: 260, tee: 3.45, fairway: 3.58, rough: 3.74, sand: 3.93, recovery: 4.03 },
  { distance: 280, tee: 3.65, fairway: 3.69, rough: 3.83, sand: 4.00, recovery: 4.10 },
  { distance: 300, tee: 3.71, fairway: 3.78, rough: 3.90, sand: 4.04, recovery: 4.20 },
  { distance: 320, tee: 3.79, fairway: 3.84, rough: 3.95, sand: 4.12, recovery: 4.31 },
  { distance: 340, tee: 3.86, fairway: 3.88, rough: 4.02, sand: 4.26, recovery: 4.44 },
  { distance: 360, tee: 3.92, fairway: 3.95, rough: 4.11, sand: 4.41, recovery: 4.56 },
  { distance: 380, tee: 3.96, fairway: 4.03, rough: 4.21, sand: 4.55, recovery: 4.66 },
  { distance: 400, tee: 3.99, fairway: 4.11, rough: 4.30, sand: 4.69, recovery: 4.75 },
  { distance: 420, tee: 4.02, fairway: 4.19, rough: 4.40, sand: 4.83, recovery: 4.84 },
  { distance: 440, tee: 4.08, fairway: 4.27, rough: 4.49, sand: 4.97, recovery: 4.94 },
  { distance: 460, tee: 4.17, fairway: 4.34, rough: 4.58, sand: 5.11, recovery: 5.03 },
  { distance: 480, tee: 4.28, fairway: 4.42, rough: 4.68, sand: 5.25, recovery: 5.13 },
  { distance: 500, tee: 4.41, fairway: 4.50, rough: 4.77, sand: 5.40, recovery: 5.22 },
  { distance: 520, tee: 4.54, fairway: 4.58, rough: 4.87, sand: 5.54, recovery: 5.32 },
  { distance: 540, tee: 4.65, fairway: 4.66, rough: 4.96, sand: 5.68, recovery: 5.41 },
  { distance: 560, tee: 4.74, fairway: 4.74, rough: 5.06, sand: 5.82, recovery: 5.51 },
  { distance: 580, tee: 4.79, fairway: 4.82, rough: 5.15, sand: 5.96, recovery: 5.60 },
  { distance: 600, tee: 4.82, fairway: 4.89, rough: 5.25, sand: 6.10, recovery: 6.70 },
];

// Expected putts from given distances (feet)
const PUTT_BASELINE: { distance: number; expectedPutts: number }[] = [
  { distance: 1,  expectedPutts: 1.001 },
  { distance: 2,  expectedPutts: 1.009 },
  { distance: 3,  expectedPutts: 1.053 },
  { distance: 4,  expectedPutts: 1.147 },
  { distance: 5,  expectedPutts: 1.256 },
  { distance: 6,  expectedPutts: 1.357 },
  { distance: 7,  expectedPutts: 1.443 },
  { distance: 8,  expectedPutts: 1.515 },
  { distance: 10, expectedPutts: 1.626 },
  { distance: 15, expectedPutts: 1.790 },
  { distance: 20, expectedPutts: 1.878 },
  { distance: 30, expectedPutts: 1.978 },
  { distance: 40, expectedPutts: 2.055 },
  { distance: 50, expectedPutts: 2.135 },
  { distance: 60, expectedPutts: 2.218 },
  { distance: 90, expectedPutts: 2.379 },
];

export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'recovery';

function interpolate(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Get expected strokes to hole out from a given distance and lie.
 * Uses linear interpolation between baseline table entries.
 */
export function getExpectedStrokes(distanceYards: number, lie: LieType): number | null {
  if (distanceYards <= 0) return null;

  // Clamp to table range
  const minDist = lie === 'tee' ? 100 : 10;
  const maxDist = 600;

  if (distanceYards <= minDist) {
    const entry = SHOT_BASELINE.find(e => e.distance === minDist);
    if (!entry) return null;
    const val = entry[lie];
    return val;
  }

  if (distanceYards >= maxDist) {
    const entry = SHOT_BASELINE.find(e => e.distance === maxDist);
    if (!entry) return null;
    return entry[lie];
  }

  // Find surrounding entries for interpolation
  let lower: BaselineEntry | null = null;
  let upper: BaselineEntry | null = null;

  for (let i = 0; i < SHOT_BASELINE.length; i++) {
    const entry = SHOT_BASELINE[i];
    if (entry[lie] === null) continue;

    if (entry.distance <= distanceYards) {
      lower = entry;
    }
    if (entry.distance >= distanceYards && !upper) {
      upper = entry;
    }
  }

  if (!lower || !upper) return null;

  // Exact match
  if (lower.distance === upper.distance) {
    return lower[lie];
  }

  const lowerVal = lower[lie];
  const upperVal = upper[lie];
  if (lowerVal === null || upperVal === null) return null;

  return interpolate(distanceYards, lower.distance, upper.distance, lowerVal, upperVal);
}

/**
 * Get expected putts from a given distance in feet.
 * Uses linear interpolation between baseline table entries.
 */
export function getExpectedPutts(distanceFeet: number): number | null {
  if (distanceFeet <= 0) return null;

  if (distanceFeet <= PUTT_BASELINE[0].distance) {
    return PUTT_BASELINE[0].expectedPutts;
  }

  const last = PUTT_BASELINE[PUTT_BASELINE.length - 1];
  if (distanceFeet >= last.distance) {
    return last.expectedPutts;
  }

  for (let i = 0; i < PUTT_BASELINE.length - 1; i++) {
    const lower = PUTT_BASELINE[i];
    const upper = PUTT_BASELINE[i + 1];
    if (distanceFeet >= lower.distance && distanceFeet <= upper.distance) {
      return interpolate(distanceFeet, lower.distance, upper.distance, lower.expectedPutts, upper.expectedPutts);
    }
  }

  return null;
}
