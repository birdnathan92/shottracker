// Strokes Gained Calculator
// Based on Mark Broadie's methodology (Columbia University)
// SG = Expected_Strokes(start) - Expected_Strokes(end) - 1

import { getExpectedStrokes, LieType } from './strokesGainedBaseline';

export interface HoleSGResult {
  sgTotal: number | null;         // SG vs PGA Tour for the whole hole
  sgOffTheTee: number | null;     // null if no drive data or par 3
  sgApproach: number | null;      // remainder (approach + short game + putting)
}

export interface RoundSGResult {
  sgTotal: number;
  sgOffTheTee: number;
  sgApproach: number;
  holesCalculated: number;        // how many holes had enough data for SG:Total
  ottHolesCalculated: number;     // how many holes had enough data for SG:OTT
  perHole: Record<number, HoleSGResult>;
}

interface HoleInput {
  score: number;
  par: number;
  distance?: number;        // hole distance in yards
  fairway?: boolean | null;
  driveDistance?: number;    // tee shot distance in yards (from GPS)
}

/**
 * Calculate strokes gained for a single hole.
 */
export function calculateHoleSG(hole: HoleInput): HoleSGResult {
  const { score, par, distance, fairway, driveDistance } = hole;

  // SG: Total = expected strokes from tee - actual score
  let sgTotal: number | null = null;
  if (distance && distance > 0 && score > 0) {
    const expected = getExpectedStrokes(distance, 'tee');
    if (expected !== null) {
      sgTotal = expected - score;
    }
  }

  // SG: Off the Tee (par 4+ only, requires drive distance and fairway data)
  let sgOffTheTee: number | null = null;
  if (
    sgTotal !== null &&
    par >= 4 &&
    distance && distance > 0 &&
    driveDistance && driveDistance > 0 &&
    fairway !== null && fairway !== undefined
  ) {
    const remainingYards = Math.max(1, distance - driveDistance);
    const lie: LieType = fairway ? 'fairway' : 'rough';
    const expectedFromTee = getExpectedStrokes(distance, 'tee');
    const expectedAfterDrive = getExpectedStrokes(remainingYards, lie);

    if (expectedFromTee !== null && expectedAfterDrive !== null) {
      sgOffTheTee = expectedFromTee - expectedAfterDrive - 1;
    }
  }

  // SG: Approach = SG:Total - SG:OTT (captures everything after tee shot)
  let sgApproach: number | null = null;
  if (sgTotal !== null && sgOffTheTee !== null) {
    sgApproach = sgTotal - sgOffTheTee;
  }

  return { sgTotal, sgOffTheTee, sgApproach };
}

/**
 * Calculate aggregate strokes gained for a full round.
 */
export function calculateRoundSG(
  holeStats: Record<number, HoleInput>,
): RoundSGResult {
  let sgTotal = 0;
  let sgOffTheTee = 0;
  let sgApproach = 0;
  let holesCalculated = 0;
  let ottHolesCalculated = 0;
  const perHole: Record<number, HoleSGResult> = {};

  for (const [holeNumStr, hole] of Object.entries(holeStats)) {
    const holeNum = parseInt(holeNumStr);
    const result = calculateHoleSG(hole);
    perHole[holeNum] = result;

    if (result.sgTotal !== null) {
      sgTotal += result.sgTotal;
      holesCalculated++;
    }

    if (result.sgOffTheTee !== null) {
      sgOffTheTee += result.sgOffTheTee;
      ottHolesCalculated++;
    }

    if (result.sgApproach !== null) {
      sgApproach += result.sgApproach;
    }
  }

  return {
    sgTotal,
    sgOffTheTee,
    sgApproach,
    holesCalculated,
    ottHolesCalculated,
    perHole,
  };
}

/**
 * Format a strokes gained value for display.
 * Positive values are prefixed with '+', negative with '-'.
 */
export function formatSG(value: number | null, decimals: number = 1): string {
  if (value === null) return '—';
  const formatted = Math.abs(value).toFixed(decimals);
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Get the color class for a strokes gained value.
 */
export function sgColor(value: number | null): string {
  if (value === null) return 'text-stone-400';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-red-500';
  return 'text-stone-600';
}

/**
 * Get the background color class for a strokes gained value.
 */
export function sgBgColor(value: number | null): string {
  if (value === null) return 'bg-stone-100';
  if (value > 0) return 'bg-emerald-100';
  if (value < 0) return 'bg-red-100';
  return 'bg-stone-100';
}
