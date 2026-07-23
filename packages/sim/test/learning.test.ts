/**
 * WS26-T9 sim ACs: the learning policy's memory demonstrably matters — on a corpus with a
 * planted calibration bias, the trained chalk beats its untrained twin on Σedge per pick —
 * and evaluation mode (frozenPolicy) never mutates the memory.
 */
import { describe, expect, it } from 'vitest';
import { memoryWinRate } from '@receipts/engine';
import {
  baselinePolicies,
  frozenPolicy,
  runSimulation,
  trainMemory,
  type SimMarketRow,
} from '../src/index.js';

/** Deterministic corpus with a planted bias: strong favorites (0.75) win 85% (overdeliver);
 * weak favorites (0.55) win only 45% (underdeliver). An untrained chalk takes both; a
 * trained chalk should learn to prefer the strong band. */
function biasedCorpus(n: number): SimMarketRow[] {
  const rows: SimMarketRow[] = [];
  for (let i = 0; i < n; i++) {
    const strong = i % 2 === 0;
    const price = strong ? 0.75 : 0.55;
    const wins = strong ? i % 20 < 17 : i % 20 < 9; // 85% / 45%
    rows.push({
      id: `r${i}`,
      category: 'sports',
      yesPrice: price,
      timeToLockMs: 60_000,
      outcome: wins ? 'yes' : 'no',
    });
  }
  return rows;
}

describe('trainMemory + frozenPolicy (WS26-T9)', () => {
  it('the trained chalk beats its untrained twin on Σedge per pick over the planted bias', () => {
    const train = biasedCorpus(4000);
    const holdout = biasedCorpus(4000).map((r, i) => ({ ...r, id: `h${i}` }));

    const { memory } = trainMemory(train, 'chalk', '2026-05-31', 200);
    const trained = runSimulation(holdout, frozenPolicy(memory)).report;
    const baseline = runSimulation(
      holdout,
      baselinePolicies().find((p) => p.name === 'baseline:chalk')!,
    ).report;

    const perPick = (r: typeof trained) => (r.picks > 0 ? r.edgeSum / r.picks : 0);
    expect(perPick(trained)).toBeGreaterThan(perPick(baseline));
    expect(memory.params.minFavProb).toBeGreaterThan(0.5); // it learned to be pickier
    expect(memory.cutoff).toBe('2026-05-31'); // the audit stamp rides along
  });

  it('frozenPolicy never mutates the memory (evaluation is side-effect free)', () => {
    const { memory } = trainMemory(biasedCorpus(1000), 'chalk', '2026-05-31', 200);
    const snapshot = JSON.stringify(memory);
    runSimulation(biasedCorpus(500), frozenPolicy(memory));
    expect(JSON.stringify(memory)).toBe(snapshot);
    expect(memoryWinRate(memory)).not.toBeNull();
  });
});
