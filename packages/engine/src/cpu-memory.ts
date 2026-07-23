/**
 * CPU persona memory + update rule (docs/plans/cpu-nemesis-wbs.md, WS26-T9). This module is
 * shared VERBATIM between simulator training (packages/sim) and the production post-grade
 * refinement path (wired by WS26-T10, which owns storage) — pure functions, no I/O, per this
 * package's rules.
 *
 * What a memory is: (a) an exponentially-weighted CALIBRATION table — for each
 * (category × entry-price band), the decayed count and win mass of entries taken at that
 * price — and (b) tuned POLICY PARAMS per persona. Both remain functions of price, category,
 * and clock at decision time: the no-informational-edge guardrail (review correction 2)
 * holds by construction. The `cutoff` stamp records the newest training data the memory has
 * seen — the WS26-T16 exam's audit key.
 *
 * Believability is a constraint, not an afterthought (drift note, WS26-T12): `tuneParams`
 * maximizes calibrated expected edge SUBJECT TO the persona's target win-rate band, so a
 * persona never optimizes itself into an obviously-botlike record; rating calibration is
 * Glicko's job, never this module's.
 */
import { LONGSHOT_THRESHOLD } from '@receipts/core';
import type { CpuPersona, MarketSide } from '@receipts/core';
import {
  CPU_CLOCK_PICK_WINDOW_MS,
  type CpuPickDecision,
  type CpuPickInputs,
} from './cpu-persona.js';

/** EW decay per observation — ~1400-observation half-life; recent form dominates slowly. */
export const CPU_MEMORY_DECAY = 0.9995;
/** Laplace-style prior mass pulling a cold cell toward its implied probability. */
export const CPU_MEMORY_PRIOR_N = 50;
/** Price bands of 0.05 across [0,1) — 20 cells per category. */
export const CPU_MEMORY_BANDS = 20;
/** Bounded tuning: a knob moves at most this far per tune call (stability over speed). */
export const CPU_TUNE_MAX_STEP = 0.02;

export interface CalibrationCell {
  /** Decayed observation mass. */
  n: number;
  /** Decayed win mass. */
  wins: number;
  /** Decayed sum of entry probabilities — the implied baseline the wins are measured against. */
  impliedSum: number;
}

export interface CpuPolicyParams {
  /** Chalk/Clock: minimum favorite probability worth taking (0.5 = any favorite). */
  minFavProb: number;
  /** Fade: only fade favorites at/below this (1 = fade anything). */
  maxFadeFavProb: number;
  /** Longshot: maximum entry probability that still counts as a longshot. */
  longshotMax: number;
  /** Clock: how close to lock before picking. */
  clockWindowMs: number;
}

export interface CpuMemory {
  version: 1;
  persona: CpuPersona;
  /** Newest training data this memory has seen (YYYY-MM-DD) — the T16 audit stamp. */
  cutoff: string;
  calibration: Record<string, CalibrationCell>;
  params: CpuPolicyParams;
  /** Decayed own-record tracker for the believability band. */
  record: { n: number; wins: number };
}

/** Target win-rate bands per persona — the believability constraint (WBS §2 "Ratings"). */
export const CPU_TARGET_WIN_RATE: Record<CpuPersona, { min: number; max: number }> = {
  chalk: { min: 0.55, max: 0.72 },
  fade: { min: 0.28, max: 0.45 },
  longshot: { min: 0.08, max: 0.3 },
  clock: { min: 0.55, max: 0.72 },
};

/** Defaults reproduce the untrained `decideCpuPick` behavior EXACTLY (pinned by test). */
export function defaultCpuParams(): CpuPolicyParams {
  return {
    minFavProb: 0.5,
    maxFadeFavProb: 1,
    longshotMax: LONGSHOT_THRESHOLD,
    clockWindowMs: CPU_CLOCK_PICK_WINDOW_MS,
  };
}

export function createCpuMemory(persona: CpuPersona, cutoff: string): CpuMemory {
  return {
    version: 1,
    persona,
    cutoff,
    calibration: {},
    params: defaultCpuParams(),
    record: { n: 0, wins: 0 },
  };
}

export function bandKey(category: string, entryProb: number): string {
  const band = Math.min(
    CPU_MEMORY_BANDS - 1,
    Math.max(0, Math.floor(entryProb * CPU_MEMORY_BANDS)),
  );
  return `${category}:${band}`;
}

/**
 * The update rule (identical in sim and production): after a pick GRADES, decay-and-add the
 * outcome into the cell for the price actually paid, and into the own-record tracker.
 */
export function observeCpuOutcome(
  memory: CpuMemory,
  observation: { category: string; entryProb: number; won: boolean },
): void {
  const key = bandKey(observation.category, observation.entryProb);
  const cell = memory.calibration[key] ?? { n: 0, wins: 0, impliedSum: 0 };
  cell.n = cell.n * CPU_MEMORY_DECAY + 1;
  cell.wins = cell.wins * CPU_MEMORY_DECAY + (observation.won ? 1 : 0);
  cell.impliedSum = cell.impliedSum * CPU_MEMORY_DECAY + observation.entryProb;
  memory.calibration[key] = cell;
  memory.record.n = memory.record.n * CPU_MEMORY_DECAY + 1;
  memory.record.wins = memory.record.wins * CPU_MEMORY_DECAY + (observation.won ? 1 : 0);
}

/**
 * Calibrated P(win) for an entry at `entryProb` in `category`: the cell's decayed win rate,
 * shrunk toward the implied probability by the prior — a cold memory predicts the market
 * price itself (no data, no opinion).
 */
export function predictWinProb(memory: CpuMemory, category: string, entryProb: number): number {
  const cell = memory.calibration[bandKey(category, entryProb)];
  if (!cell || cell.n <= 0) return entryProb;
  return (cell.wins + entryProb * CPU_MEMORY_PRIOR_N) / (cell.n + CPU_MEMORY_PRIOR_N);
}

function favoriteOf(yesPrice: number): { side: MarketSide; prob: number } | null {
  if (yesPrice > 0.5) return { side: 'yes', prob: yesPrice };
  if (yesPrice < 0.5) return { side: 'no', prob: 1 - yesPrice };
  return null;
}

/**
 * Memory-aware decision. With `defaultCpuParams()` this is behavior-identical to
 * `decideCpuPick` (pinned by test); trained params narrow/shift each persona's take band.
 * Still a pure function of price + clock + category-shaped memory — never an outcome.
 */
export function decideCpuPickWithMemory(inputs: CpuPickInputs, memory: CpuMemory): CpuPickDecision {
  const { yesPrice, timeToLockMs } = inputs;
  const { params } = memory;
  const fav = favoriteOf(yesPrice);
  switch (memory.persona) {
    case 'chalk': {
      if (!fav || fav.prob < params.minFavProb) return { action: 'skip' };
      return { action: 'pick', side: fav.side };
    }
    case 'fade': {
      if (!fav || fav.prob > params.maxFadeFavProb) return { action: 'skip' };
      return { action: 'pick', side: fav.side === 'yes' ? 'no' : 'yes' };
    }
    case 'longshot': {
      if (yesPrice <= params.longshotMax) return { action: 'pick', side: 'yes' };
      if (1 - yesPrice <= params.longshotMax) return { action: 'pick', side: 'no' };
      return { action: 'skip' };
    }
    case 'clock': {
      if (timeToLockMs > params.clockWindowMs) return { action: 'wait' };
      if (!fav || fav.prob < params.minFavProb) return { action: 'skip' };
      return { action: 'pick', side: fav.side };
    }
  }
}

/** Decayed own win rate; null before any graded pick. */
export function memoryWinRate(memory: CpuMemory): number | null {
  return memory.record.n > 0 ? memory.record.wins / memory.record.n : null;
}

function expectedEdgeTakingFavoritesAbove(memory: CpuMemory, threshold: number): number {
  // Mean calibrated edge per candidate cell at/above the threshold, weighted by cell mass —
  // deterministic, data-driven, and zero for thresholds with no evidence.
  let mass = 0;
  let edge = 0;
  for (const [key, cell] of Object.entries(memory.calibration)) {
    if (cell.n <= 0) continue;
    const band = Number(key.split(':').at(-1));
    const bandMid = (band + 0.5) / CPU_MEMORY_BANDS;
    if (bandMid < threshold) continue;
    const category = key.slice(0, key.lastIndexOf(':'));
    const p = predictWinProb(memory, category, bandMid);
    edge += (p - bandMid) * cell.n;
    mass += cell.n;
  }
  return mass > 0 ? edge / mass : 0;
}

/**
 * Bounded, deterministic tuning: move each persona's main knob at most CPU_TUNE_MAX_STEP
 * toward the grid argmax of calibrated expected edge, SUBJECT TO the believability band —
 * when the decayed own record drifts outside the persona's target win-rate band, the knob
 * moves in the direction that pulls the record back instead (damping beats sharpening).
 */
export function tuneParams(memory: CpuMemory): void {
  const rate = memoryWinRate(memory);
  const band = CPU_TARGET_WIN_RATE[memory.persona];
  const step = (current: number, target: number): number =>
    current + Math.max(-CPU_TUNE_MAX_STEP, Math.min(CPU_TUNE_MAX_STEP, target - current));

  switch (memory.persona) {
    case 'chalk':
    case 'clock': {
      if (rate !== null && rate > band.max) {
        // Too sharp to be believable: take weaker favorites.
        memory.params.minFavProb = Math.max(0.5, step(memory.params.minFavProb, 0.5));
        return;
      }
      if (rate !== null && rate < band.min) {
        memory.params.minFavProb = Math.min(0.85, step(memory.params.minFavProb, 0.85));
        return;
      }
      // In-band: climb toward the best-edge threshold on the calibration evidence.
      let best = memory.params.minFavProb;
      let bestEdge = -Infinity;
      for (let t = 0.5; t <= 0.85 + 1e-9; t += 0.05) {
        const e = expectedEdgeTakingFavoritesAbove(memory, t);
        if (e > bestEdge + 1e-12) {
          bestEdge = e;
          best = t;
        }
      }
      memory.params.minFavProb = Math.max(
        0.5,
        Math.min(0.85, step(memory.params.minFavProb, best)),
      );
      return;
    }
    case 'fade': {
      // Fade's identity is losing with style; tuning only polices believability.
      if (rate !== null && rate < band.min) {
        // Losing too hard: only fade weak favorites (closer to coin flips).
        memory.params.maxFadeFavProb = Math.max(0.55, step(memory.params.maxFadeFavProb, 0.55));
      } else if (rate !== null && rate > band.max) {
        memory.params.maxFadeFavProb = Math.min(1, step(memory.params.maxFadeFavProb, 1));
      }
      return;
    }
    case 'longshot': {
      if (rate !== null && rate < band.min) {
        // Bleeding out: demand cheaper (higher-payout) longshots less often — tighten.
        memory.params.longshotMax = Math.max(0.08, step(memory.params.longshotMax, 0.08));
      } else if (rate !== null && rate > band.max) {
        memory.params.longshotMax = Math.min(0.35, step(memory.params.longshotMax, 0.35));
      }
      return;
    }
  }
}

/** Structural validation for memories loaded from storage (T10) — never trust a blob. */
export function isCpuMemory(value: unknown): value is CpuMemory {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    m['version'] === 1 &&
    typeof m['persona'] === 'string' &&
    typeof m['cutoff'] === 'string' &&
    typeof m['calibration'] === 'object' &&
    m['calibration'] !== null &&
    typeof m['params'] === 'object' &&
    m['params'] !== null &&
    typeof m['record'] === 'object' &&
    m['record'] !== null
  );
}
