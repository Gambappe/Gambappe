/**
 * WS26-T9 sim side: the learning policy — `decideCpuPickWithMemory` + the shared update
 * rule, wired into the replay harness's observe hook. Training IS just running this policy
 * over a dataset; the memory object that falls out is what WS26-T10 uploads to xTrace.
 */
import type { CpuPersona } from '@receipts/core';
import {
  createCpuMemory,
  decideCpuPickWithMemory,
  observeCpuOutcome,
  tuneParams,
  type CpuMemory,
} from '@receipts/engine';
import { runSimulation, type PickPolicy, type SimMarketRow, type SimReport } from './index.js';

export const DEFAULT_TUNE_EVERY = 500;

/** A policy that reads and refines `memory` as it replays. Mutates the given memory. */
export function learningPolicy(
  memory: CpuMemory,
  tuneEvery: number = DEFAULT_TUNE_EVERY,
): PickPolicy {
  let sinceTune = 0;
  return {
    name: `learning:${memory.persona}`,
    decide: (inputs) => decideCpuPickWithMemory({ ...inputs, persona: memory.persona }, memory),
    observe: (row, decision, won) => {
      if (decision.action !== 'pick' || won === null) return;
      const entryProb = decision.side === 'yes' ? row.yesPrice : 1 - row.yesPrice;
      observeCpuOutcome(memory, { category: row.category, entryProb, won });
      sinceTune += 1;
      if (sinceTune >= tuneEvery) {
        tuneParams(memory);
        sinceTune = 0;
      }
    },
  };
}

/** A frozen policy over a trained memory: reads it, never updates it (evaluation mode). */
export function frozenPolicy(memory: CpuMemory): PickPolicy {
  return {
    name: `trained:${memory.persona}`,
    decide: (inputs) => decideCpuPickWithMemory({ ...inputs, persona: memory.persona }, memory),
  };
}

export interface TrainResult {
  memory: CpuMemory;
  trainingReport: SimReport;
}

/** Train a fresh memory for `persona` over `rows` (which must respect `cutoff` — the caller
 * slices with `splitByCutoff`; this function only stamps what it was told). */
export function trainMemory(
  rows: readonly SimMarketRow[],
  persona: CpuPersona,
  cutoff: string,
  tuneEvery: number = DEFAULT_TUNE_EVERY,
): TrainResult {
  const memory = createCpuMemory(persona, cutoff);
  const { report } = runSimulation(rows, learningPolicy(memory, tuneEvery));
  return { memory, trainingReport: report };
}
