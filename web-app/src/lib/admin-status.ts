// Status thresholds. Red thresholds match the radio's /api/scheduler-health
// (generation stale > 900s, no new segment > 4h, disk >= 92%); amber is an early warning.

export type Level = 'green' | 'amber' | 'red' | 'unknown';

export const THRESHOLDS = {
  generationRedSec: 900,
  generationAmberSec: 450,
  segmentRedSec: 4 * 3600,
  segmentAmberSec: 2 * 3600,
  diskRedPct: 92,
  diskAmberPct: 85,
};

export function levelHigherIsWorse(v: number | null | undefined, amber: number, red: number, redInclusive = false): Level {
  if (v === null || v === undefined || Number.isNaN(v)) return 'unknown';
  if (redInclusive ? v >= red : v > red) return 'red';
  if (v >= amber) return 'amber';
  return 'green';
}

export const generationLevel = (s: number | null | undefined) =>
  levelHigherIsWorse(s, THRESHOLDS.generationAmberSec, THRESHOLDS.generationRedSec);
export const segmentLevel = (s: number | null | undefined) =>
  levelHigherIsWorse(s, THRESHOLDS.segmentAmberSec, THRESHOLDS.segmentRedSec);
export const diskLevel = (p: number | null | undefined) =>
  levelHigherIsWorse(p, THRESHOLDS.diskAmberPct, THRESHOLDS.diskRedPct, true);

export function streamLevel(up: boolean | null | undefined): Level {
  if (up === null || up === undefined) return 'unknown';
  return up ? 'green' : 'red';
}

const RANK: Record<Level, number> = { green: 0, unknown: 1, amber: 2, red: 3 };
export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), 'green');
}

export function formatAge(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return 'n/a';
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}
