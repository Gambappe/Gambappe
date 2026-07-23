/**
 * WS26-T9 ACs (docs/plans/cpu-nemesis-wbs.md): default params reproduce the untrained
 * decideCpuPick exactly; the EW update rule and Laplace-shrunk prediction behave as
 * specified; tuning is bounded, deterministic, and believability-first.
 */
import { describe, expect, it } from 'vitest';
import { CPU_PERSONAS } from '@receipts/core';
import {
  CPU_TARGET_WIN_RATE,
  CPU_TUNE_MAX_STEP,
  createCpuMemory,
  decideCpuPick,
  decideCpuPickWithMemory,
  memoryWinRate,
  observeCpuOutcome,
  predictWinProb,
  tuneParams,
  type CpuPickInputs,
} from '../src/index.js';

function inputs(overrides: Partial<CpuPickInputs> & Pick<CpuPickInputs, 'persona'>): CpuPickInputs {
  return { category: 'sports', yesPrice: 0.62, timeToLockMs: 60_000, ...overrides };
}

describe('default-params equivalence (the untrained twin IS decideCpuPick)', () => {
  it('matches decideCpuPick across a price/time sweep for every persona', () => {
    for (const persona of CPU_PERSONAS) {
      const memory = createCpuMemory(persona, '2026-05-31');
      for (let cents = 1; cents <= 99; cents++) {
        for (const timeToLockMs of [60_000, 20 * 60_000, 3 * 3600_000]) {
          const input = inputs({ persona, yesPrice: cents / 100, timeToLockMs });
          expect(
            decideCpuPickWithMemory(input, memory),
            `${persona}@${cents}/${timeToLockMs}`,
          ).toEqual(decideCpuPick(input));
        }
      }
    }
  });
});

describe('observe + predict', () => {
  it('a cold memory predicts the market price itself', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    expect(predictWinProb(memory, 'sports', 0.62)).toBe(0.62);
  });

  it('evidence moves the prediction away from implied, shrunk by the prior', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    for (let i = 0; i < 200; i++) {
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.62, won: true });
    }
    const p = predictWinProb(memory, 'sports', 0.62);
    expect(p).toBeGreaterThan(0.62); // 200 straight wins pull upward…
    expect(p).toBeLessThan(1); // …but the prior keeps it shrunk
    expect(memoryWinRate(memory)).toBeCloseTo(1, 5);
  });

  it('is category-scoped — sports evidence never leaks into another category', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    for (let i = 0; i < 100; i++) {
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.62, won: true });
    }
    expect(predictWinProb(memory, 'politics', 0.62)).toBe(0.62);
  });
});

describe('tuneParams — bounded, deterministic, believability-first', () => {
  it('never moves a knob more than CPU_TUNE_MAX_STEP per call', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    // Fake an implausibly hot record to trigger damping.
    for (let i = 0; i < 500; i++) {
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.9, won: true });
    }
    const before = memory.params.minFavProb;
    tuneParams(memory);
    expect(Math.abs(memory.params.minFavProb - before)).toBeLessThanOrEqual(
      CPU_TUNE_MAX_STEP + 1e-12,
    );
  });

  it('damps an out-of-band-hot chalk toward weaker favorites (believability beats edge)', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    memory.params.minFavProb = 0.7;
    for (let i = 0; i < 500; i++) {
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.9, won: true });
    }
    expect(memoryWinRate(memory)!).toBeGreaterThan(CPU_TARGET_WIN_RATE.chalk.max);
    tuneParams(memory);
    expect(memory.params.minFavProb).toBeLessThan(0.7); // pulled DOWN toward 0.5
  });

  it('in-band chalk climbs toward the best-edge threshold on the evidence', () => {
    const memory = createCpuMemory('chalk', '2026-05-31');
    // Strong favorites (0.775 band) overdeliver; weak favorites (0.525 band) underdeliver.
    // Record engineered to sit inside the believability band.
    for (let i = 0; i < 400; i++) {
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.775, won: i % 100 < 90 });
      observeCpuOutcome(memory, { category: 'sports', entryProb: 0.525, won: i % 100 < 40 });
    }
    const rate = memoryWinRate(memory)!;
    expect(rate).toBeGreaterThan(CPU_TARGET_WIN_RATE.chalk.min);
    expect(rate).toBeLessThan(CPU_TARGET_WIN_RATE.chalk.max);
    const before = memory.params.minFavProb;
    tuneParams(memory);
    expect(memory.params.minFavProb).toBeGreaterThan(before); // stepping toward the hot band
  });

  it('is deterministic — same memory state, same tuned params', () => {
    const make = () => {
      const m = createCpuMemory('longshot', '2026-05-31');
      for (let i = 0; i < 300; i++) {
        observeCpuOutcome(m, { category: 'sports', entryProb: 0.15, won: i % 10 === 0 });
      }
      tuneParams(m);
      return m.params;
    };
    expect(make()).toEqual(make());
  });
});
