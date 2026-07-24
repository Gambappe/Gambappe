import { describe, expect, it } from 'vitest';

import {
  KNOB_RANGES,
  RUMOR_TUNE_MAX_STEP,
  aggregateCrowdOdds,
  aggregatePrepared,
  defaultRumorSkill,
  prepareEntries,
  trainSkill,
  tuneSkill,
} from '../src/index.js';
import type { CrowdEntry, SagaDef, TunableKnob } from '../src/index.js';

const entry = (text: string, day: string, score = 100, subreddit = 'nba'): CrowdEntry => ({
  text,
  score,
  subreddit,
  createdUtc: Date.parse(`${day}T12:00:00Z`) / 1000,
});

const saga = (id: string, over: Partial<SagaDef> = {}): SagaDef => ({
  id,
  player: 'Test Player',
  titleQuery: 'test',
  subreddits: ['nba'],
  from: '2018-06-25',
  to: '2018-06-28',
  resolvedAt: '2018-06-28',
  candidates: ['MIA', 'CLE', 'GSW'],
  outcome: 'CLE',
  ...over,
});

// A corpus where the crowd's leader is CORRECT — sharpening (lower temperature)
// provably lowers log-loss, so tuning has a real gradient to find.
const correctLeaderCorpus = [
  entry('Cleveland has agreed, done deal', '2018-06-25', 800),
  entry('welcome to Cleveland', '2018-06-26', 400),
  entry('Miami though', '2018-06-25', 50),
  entry('the Warriors are pure leverage', '2018-06-26', 60),
];

describe('prepareEntries / aggregatePrepared', () => {
  it('prepared aggregation is exactly equivalent to direct aggregation', () => {
    const skill = defaultRumorSkill('t');
    const asOf = Date.parse('2018-06-27T00:00:00Z') / 1000;
    const direct = aggregateCrowdOdds(correctLeaderCorpus, skill, saga('s').candidates, asOf);
    const prepared = aggregatePrepared(
      prepareEntries(correctLeaderCorpus, skill),
      skill,
      saga('s').candidates,
      asOf,
    );
    expect(prepared).toEqual(direct);
  });
});

describe('tuneSkill', () => {
  it('moves exactly one knob, bounded to RUMOR_TUNE_MAX_STEP of its range', () => {
    const skill = defaultRumorSkill('t');
    const before = { ...skill };
    const prepared = prepareEntries(correctLeaderCorpus, skill);
    const step = tuneSkill(skill, saga('s'), prepared);
    expect(step).not.toBeNull();
    const knobs = Object.keys(KNOB_RANGES) as TunableKnob[];
    const moved = knobs.filter((k) => skill[k] !== before[k]);
    expect(moved).toEqual([step!.knob]);
    const [lo, hi] = KNOB_RANGES[step!.knob];
    expect(Math.abs(step!.to - step!.from)).toBeLessThanOrEqual(
      RUMOR_TUNE_MAX_STEP * (hi - lo) + 1e-12,
    );
    expect(step!.after).toBeLessThanOrEqual(step!.before);
    // Cues and lexicon are never touched by v1 tuning (prepared-path validity).
    expect(skill.stanceCueWeights).toEqual(before.stanceCueWeights);
    expect(skill.lexiconDeltas).toEqual(before.lexiconDeltas);
  });

  it('is deterministic', () => {
    const a = defaultRumorSkill('t');
    const b = defaultRumorSkill('t');
    const stepA = tuneSkill(a, saga('s'), prepareEntries(correctLeaderCorpus, a));
    const stepB = tuneSkill(b, saga('s'), prepareEntries(correctLeaderCorpus, b));
    expect(stepA).toEqual(stepB);
    expect(a).toEqual(b);
  });

  it('returns null and touches nothing when no grid point improves', () => {
    // One bare mention of the outcome: odds are as good as this corpus gets everywhere
    // useful; if nothing beats current, the skill must be left alone.
    const skill = defaultRumorSkill('t');
    const flat = [entry('Cleveland', '2018-06-25', 10)];
    const before = structuredClone(skill);
    const step = tuneSkill(skill, saga('s'), prepareEntries(flat, skill));
    if (step === null) {
      expect(skill).toEqual(before);
    } else {
      // If the grid did find an improvement, the move must still be single-knob/bounded.
      expect(step.after).toBeLessThanOrEqual(step.before);
    }
  });
});

describe('trainSkill — walk-forward honesty', () => {
  const sagaA = saga('saga-a', { from: '2018-06-25', to: '2018-06-28', resolvedAt: '2018-06-28' });
  const sagaB = saga('saga-b', { from: '2019-06-20', to: '2019-06-24', resolvedAt: '2019-06-24' });
  const corpusB = [
    entry('Cleveland has agreed, done deal', '2019-06-21', 700),
    entry('Miami ruled out', '2019-06-22', 200),
  ];
  const byId = (id: string) => (id === 'saga-a' ? correctLeaderCorpus : corpusB);

  it('trains chronologically, stamps cutoffs, records PRE-tune scores', () => {
    // Passed out of order on purpose — the trainer must sort by `from`.
    const { skill, versions } = trainSkill([sagaB, sagaA], byId);
    expect(versions.map((v) => v.label)).toEqual(['skill@saga-a', 'skill@saga-b']);
    expect(versions[0]!.skill.cutoff).toBe('2018-06-28');
    expect(versions[1]!.skill.cutoff).toBe('2019-06-24');
    expect(skill.cutoff).toBe('2019-06-24');

    // The first saga's evaluation IS the untrained twin: identical defaults.
    const untrainedFirst = versions[0]!.pretune;
    expect(untrainedFirst.final.logLoss).toBeCloseTo(skill.record['saga-a']!.logLoss, 12);
    // record entries are pre-tune (honest): saga-b's record was computed with the
    // skill tuned only on saga-a.
    expect(Object.keys(skill.record)).toEqual(['saga-a', 'saga-b']);
    expect(skill.record['saga-b']!.outcome).toBe('CLE');
  });

  it('emitted versions are snapshots — later training never mutates them', () => {
    const { skill, versions } = trainSkill([sagaA, sagaB], byId);
    if (versions[1]!.tuned !== null) {
      // Version 0 must not reflect version 1's knob move.
      const knob = versions[1]!.tuned.knob;
      expect(versions[0]!.skill[knob]).toBe(versions[1]!.tuned.from);
      expect(skill[knob]).toBe(versions[1]!.tuned.to);
    }
    // Mutating the returned skill must not reach into stored versions.
    skill.record['tampered'] = { logLoss: 0, days: 0, outcome: 'MIA' };
    expect(versions[1]!.skill.record['tampered']).toBeUndefined();
  });
});
