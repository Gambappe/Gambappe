/**
 * Score the supersession test. For each probe and lane, count how much retrieved evidence
 * supports the CURRENT preference vs the SUPERSEDED one, and whether anything explicitly states
 * that a change happened.
 *
 * Verdicts:
 *   current  — current evidence present, no stale evidence: a consumer cannot get this wrong
 *   mixed    — both present: the consumer must infer recency itself, and can get it wrong
 *   stale    — only superseded evidence: actively misleading
 *   none     — no relevant evidence retrieved
 */
import { readFileSync } from 'node:fs';
import { PROBES } from './food-corpus.mjs';

const OUT = process.env.BENCH_OUT || '/tmp/claude-0/-home-user-Gambappe/318c540c-00ed-5b31-a2f4-340577435dd8/scratchpad';
const xt = JSON.parse(readFileSync(`${OUT}/food-xtrace-results.json`, 'utf8'));
const pg = JSON.parse(readFileSync(`${OUT}/food-pgvector-results.json`, 'utf8'));
const LANES = { ...xt, ...pg };

// Language that asserts a transition rather than a state — the thing that makes supersession
// legible to a consumer without it having to compare timestamps.
const CHANGE_RE = /\bstopped\b|\bswitched\b|no longer|used to|\bsince\b|permanent|not a phase|new routine|escalat|going forward|from now on|lasting habit|officially off|new go-to|instead of/i;

function verdictFor(items, probe) {
  const cur = items.filter((t) => probe.currentRe.test(t)).length;
  // An item only counts as stale evidence if it presents the old preference approvingly. Records
  // that mention the old thing while reporting it going wrong are what MOTIVATES the switch.
  const stale = probe.supersededRe
    ? items.filter(
        (t) => probe.supersededRe.test(t) && !(probe.supersededExcludeRe && probe.supersededExcludeRe.test(t)),
      ).length
    : 0;
  const change = items.some((t) => CHANGE_RE.test(t));
  let verdict;
  if (cur === 0 && stale === 0) verdict = 'none';
  else if (cur > 0 && stale === 0) verdict = 'current';
  else if (cur === 0 && stale > 0) verdict = 'stale';
  else verdict = 'mixed';
  return { cur, stale, change, verdict };
}

const laneNames = Object.keys(LANES);
const table = {};
for (const lane of laneNames) table[lane] = {};

for (const p of PROBES) {
  console.log(`\n${'='.repeat(86)}\n[${p.id}] ${p.query}`);
  console.log(`  current    : ${p.current}`);
  if (p.superseded) console.log(`  superseded : ${p.superseded}`);
  for (const lane of laneNames) {
    const items = LANES[lane][p.id] || [];
    const r = verdictFor(items, p);
    table[lane][p.id] = r;
    console.log(
      `   ${lane.padEnd(18)} ${r.verdict.padEnd(8)} current-evidence=${r.cur} stale-evidence=${r.stale} states-the-change=${r.change ? 'YES' : 'no'}`,
    );
  }
}

console.log(`\n${'='.repeat(86)}\nSUMMARY (3 reversals + 1 stable control)\n${'='.repeat(86)}`);
const REV = PROBES.filter((p) => p.superseded).map((p) => p.id);
console.log('lane'.padEnd(20) + 'reversals-correct'.padStart(18) + 'mixed'.padStart(8) + 'stale'.padStart(7) + 'control'.padStart(9) + 'states-change'.padStart(15));
for (const lane of laneNames) {
  const rs = REV.map((id) => table[lane][id]);
  const correct = rs.filter((r) => r.verdict === 'current').length;
  const mixed = rs.filter((r) => r.verdict === 'mixed').length;
  const stale = rs.filter((r) => r.verdict === 'stale' || r.verdict === 'none').length;
  const control = table[lane]['olives'].verdict === 'current' ? 'pass' : table[lane]['olives'].verdict;
  const changes = PROBES.filter((p) => table[lane][p.id].change).length;
  console.log(
    lane.padEnd(20) +
      `${correct}/${REV.length}`.padStart(18) +
      String(mixed).padStart(8) +
      String(stale).padStart(7) +
      control.padStart(9) +
      `${changes}/${PROBES.length}`.padStart(15),
  );
}
