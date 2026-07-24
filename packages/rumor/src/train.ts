/**
 * Cross-saga training with bounded tuning (docs/plans/ws27-rumor-radar.md §2D/§3,
 * WS27-T5). Mirrors cpu-memory's `tuneParams` philosophy: deterministic, grid-driven,
 * and BOUNDED — one knob per saga, moved at most RUMOR_TUNE_MAX_STEP of its range, so no
 * single saga can yank the skill and six sagas can't overfit it into a lookup table.
 *
 * The walk-forward honesty rule: each saga is EVALUATED with the skill as trained on
 * strictly earlier sagas (the pre-tune report is what goes into `skill.record`), and
 * only then tuned on. The first saga's evaluation therefore equals the untrained twin —
 * improvement can only show from the second saga on. Tuning moves only the four scalar
 * knobs; cue weights and lexicon deltas stay put in v1, which is exactly what makes the
 * prepared-entry fast path valid (see aggregate.ts).
 */
import { prepareEntries } from './aggregate.js';
import type { CrowdEntry, PreparedEntry } from './aggregate.js';
import { preparedSkillPolicy, replaySaga } from './backtest.js';
import type { SagaReplayReport } from './backtest.js';
import type { SagaDef } from './sagas.js';
import { RUMOR_TUNE_MAX_STEP, defaultRumorSkill } from './skill.js';
import type { RumorSkill } from './skill.js';

/** The tunable scalar knobs and their hard ranges. */
export const KNOB_RANGES = {
  temperature: [0.3, 3],
  recencyHalfLifeDays: [1, 21],
  homerDiscount: [0.1, 1],
  upvoteAlpha: [0.5, 2],
} as const;

export type TunableKnob = keyof typeof KNOB_RANGES;

/** Grid resolution per knob when searching for the best value. */
export const KNOB_GRID_POINTS = 9;

export interface TuneStep {
  knob: TunableKnob;
  from: number;
  to: number;
  /** Mean log-loss on this saga before/after the bounded move. */
  before: number;
  after: number;
}

export function evaluateSkill(
  skill: RumorSkill,
  saga: SagaDef,
  prepared: readonly PreparedEntry[],
): SagaReplayReport {
  return replaySaga(saga, prepared, preparedSkillPolicy(skill));
}

function knobGrid(knob: TunableKnob): number[] {
  const [lo, hi] = KNOB_RANGES[knob];
  return Array.from(
    { length: KNOB_GRID_POINTS },
    (_, i) => lo + ((hi - lo) * i) / (KNOB_GRID_POINTS - 1),
  );
}

/**
 * One bounded tuning step on one saga: find the (knob, grid value) pair with the lowest
 * replay mean log-loss, then move ONLY that knob toward its best value, capped at
 * RUMOR_TUNE_MAX_STEP × range. Ties break toward the value closest to current (stability
 * beats novelty), then toward the lower value; knob order is fixed. Returns null — and
 * touches nothing — when no grid point beats the current setting.
 */
export function tuneSkill(
  skill: RumorSkill,
  saga: SagaDef,
  prepared: readonly PreparedEntry[],
): TuneStep | null {
  const before = evaluateSkill(skill, saga, prepared).meanLogLoss;

  let best: { knob: TunableKnob; value: number; loss: number } | null = null;
  for (const knob of Object.keys(KNOB_RANGES) as TunableKnob[]) {
    for (const value of knobGrid(knob)) {
      const trial: RumorSkill = { ...skill, [knob]: value };
      const loss = evaluateSkill(trial, saga, prepared).meanLogLoss;
      const beatsBest =
        best === null ||
        loss < best.loss - 1e-12 ||
        (Math.abs(loss - best.loss) <= 1e-12 &&
          best.knob === knob &&
          Math.abs(value - skill[knob]) < Math.abs(best.value - skill[best.knob]));
      if (beatsBest) best = { knob, value, loss };
    }
  }
  if (best === null || best.loss >= before - 1e-9) return null;

  const [lo, hi] = KNOB_RANGES[best.knob];
  const maxMove = RUMOR_TUNE_MAX_STEP * (hi - lo);
  const current = skill[best.knob];
  const delta = Math.max(-maxMove, Math.min(maxMove, best.value - current));
  const moved = Math.max(lo, Math.min(hi, current + delta));
  skill[best.knob] = moved;

  const after = evaluateSkill(skill, saga, prepared).meanLogLoss;
  return { knob: best.knob, from: current, to: moved, before, after };
}

export interface SkillVersion {
  /** e.g. "skill@lebron-2018" — the xTrace conv id suffix. */
  label: string;
  /** Deep snapshot AFTER tuning on the saga (later training never mutates it). */
  skill: RumorSkill;
  /** The honest walk-forward evaluation: computed BEFORE tuning on this saga. */
  pretune: SagaReplayReport;
  tuned: TuneStep | null;
}

export interface TrainResult {
  skill: RumorSkill;
  versions: SkillVersion[];
}

/**
 * Train across sagas in chronological order (sorted by `from` defensively). Corpus
 * entries per saga come from `entriesById`; extraction is prepared once per saga (valid
 * because tuning never touches cue weights or lexicon in v1).
 */
export function trainSkill(
  sagas: readonly SagaDef[],
  entriesById: (sagaId: string) => readonly CrowdEntry[],
): TrainResult {
  const ordered = [...sagas].sort((a, b) => a.from.localeCompare(b.from));
  const skill = defaultRumorSkill('untrained');
  const versions: SkillVersion[] = [];

  for (const saga of ordered) {
    const prepared = prepareEntries(entriesById(saga.id), skill);
    const pretune = evaluateSkill(skill, saga, prepared);
    skill.record[saga.id] = {
      logLoss: pretune.final.logLoss,
      days: pretune.days.length,
      outcome: saga.outcome,
    };
    const tuned = tuneSkill(skill, saga, prepared);
    skill.cutoff = saga.to;
    versions.push({
      label: `skill@${saga.id}`,
      skill: structuredClone(skill),
      pretune,
      tuned,
    });
  }

  return { skill: structuredClone(skill), versions };
}
